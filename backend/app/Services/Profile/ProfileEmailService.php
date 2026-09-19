<?php

namespace App\Services\Profile;

use App\Mail\ProfileEmailChangeVerificationMail;
use App\Models\ProfileChangeToken;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Services\Auth\RefreshTokenService;
use App\Support\Profile\InvalidProfileChangeTokenException;
use App\Support\Profile\ProfileStepUpRateLimitedException;
use App\Support\Profile\ProfileStepUpVerificationException;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class ProfileEmailService
{
    public function __construct(
        private readonly ProfileSecurityService $profileSecurityService,
        private readonly RefreshTokenService $refreshTokenService,
        private readonly AuthAuditService $authAuditService,
        private readonly ProfileBlockchainService $profileBlockchainService,
        private readonly ProfileStepUpRateLimiter $stepUpRateLimiter,
    ) {}

    /**
     * @param  array{current_password: string, otp: string, new_email: string}  $validated
     * @return array{expires_in: int, masked_email: string}
     *
     * @throws ProfileStepUpRateLimitedException
     * @throws ProfileStepUpVerificationException
     */
    public function startEmailChange(User $user, array $validated, Request $request): array
    {
        try {
            $this->profileSecurityService->verifyStepUp(
                $user,
                $validated['current_password'],
                $validated['otp'],
                $request,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            $this->recordEmailChangeFailure($user, $request, 'step_up_rate_limited');

            throw $exception;
        } catch (ProfileStepUpVerificationException $exception) {
            $this->recordEmailChangeFailure($user, $request, 'step_up_failed');

            throw $exception;
        }

        $normalizedEmail = $this->normalizeEmail($validated['new_email']);
        $this->assertEmailAvailableForChange($user, $normalizedEmail);

        $ttlMinutes = (int) config('profile.change_tokens.ttl_minutes', 10);

        $this->invalidateActiveEmailChangeTokens($user);

        $created = $this->profileSecurityService->createChangeToken(
            $user,
            ProfileChangeToken::TYPE_EMAIL_CHANGE,
            [
                'pending_email' => $normalizedEmail,
                'requested_at' => now()->toIso8601String(),
            ],
            $request,
        );

        Mail::to($normalizedEmail)->send(
            new ProfileEmailChangeVerificationMail($created['token'], $ttlMinutes)
        );

        $this->authAuditService->record(
            AuthAuditService::EVENT_EMAIL_CHANGE_STARTED,
            AuthAuditService::STATUS_SUCCESS,
            $request,
            user: $user,
            metadata: [
                'source' => 'self_profile',
                'target_user_id' => $user->getKey(),
                'target_email_hash' => $this->hashEmail($normalizedEmail),
                'profile_version' => (int) $user->profile_version,
                'token_expires_at' => $created['model']->expires_at?->toIso8601String(),
            ],
            omitTopLevelEmail: true,
        );

        return [
            'expires_in' => $ttlMinutes * 60,
            'masked_email' => $this->maskEmail($normalizedEmail),
            'delivery_mode' => $this->resolveDeliveryMode(),
        ];
    }

    private function resolveDeliveryMode(): ?string
    {
        if (! config('app.debug')) {
            return null;
        }

        $mailer = (string) config('mail.default', 'log');

        if ($mailer === 'log') {
            return 'log';
        }

        if ($mailer === 'array') {
            return 'array';
        }

        return 'smtp';
    }

    /**
     * @param  array{token: string}  $validated
     * @return array{revoked_count: int, profile_version: int}
     *
     * @throws InvalidProfileChangeTokenException
     */
    public function confirmEmailChange(User $user, array $validated, Request $request): array
    {
        try {
            $this->stepUpRateLimiter->ensureNotLocked(
                $user,
                $request,
                ProfileStepUpRateLimiter::SCOPE_EMAIL_CHANGE_CONFIRM,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            $this->recordEmailChangeFailure($user, $request, 'rate_limited');

            throw $exception;
        }

        $plainToken = $validated['token'];
        $tokenHash = ProfileChangeToken::hashToken($plainToken);
        $failureReason = null;

        try {
            $result = DB::transaction(function () use ($user, $plainToken, $tokenHash, $request, &$failureReason): array {
                $token = ProfileChangeToken::query()
                    ->where('token_hash', $tokenHash)
                    ->where('type', ProfileChangeToken::TYPE_EMAIL_CHANGE)
                    ->lockForUpdate()
                    ->first();

                if ($token === null || $token->isUsed() || $token->isExpired()) {
                    $failureReason = 'invalid_token';

                    throw new InvalidProfileChangeTokenException;
                }

                if ((string) $token->user_id !== (string) $user->getKey()) {
                    $failureReason = 'token_user_mismatch';

                    throw new InvalidProfileChangeTokenException;
                }

                $pendingEmail = $token->pending_payload['pending_email'] ?? null;

                if (! is_string($pendingEmail) || ! filter_var($pendingEmail, FILTER_VALIDATE_EMAIL)) {
                    $failureReason = 'invalid_pending_email';

                    throw new InvalidProfileChangeTokenException;
                }

                $normalizedEmail = $this->normalizeEmail($pendingEmail);

                /** @var User $locked */
                $locked = User::query()
                    ->whereKey($user->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();

                if (! $this->isEmailAvailableForChange($locked, $normalizedEmail)) {
                    $failureReason = 'email_unavailable';

                    throw new InvalidProfileChangeTokenException;
                }

                $consumed = ProfileChangeToken::query()
                    ->whereKey($token->getKey())
                    ->whereNull('used_at')
                    ->where('expires_at', '>', now())
                    ->update(['used_at' => now()]);

                if ($consumed === 0) {
                    $failureReason = 'invalid_token';

                    throw new InvalidProfileChangeTokenException;
                }

                $oldEmailHash = $this->hashEmail((string) $locked->email);
                $now = now();

                $locked->email = $normalizedEmail;
                $locked->forceFill([
                    'email_verified_at' => $now,
                    'last_security_changed_at' => $now,
                ]);
                $locked->profile_version = ((int) $locked->profile_version) + 1;

                try {
                    $locked->save();
                } catch (QueryException $exception) {
                    if ($this->isUniqueEmailConstraintViolation($exception)) {
                        $failureReason = 'email_unavailable';

                        throw new InvalidProfileChangeTokenException;
                    }

                    throw $exception;
                }

                $revokedCount = $this->refreshTokenService->revokeAllForUser($locked);

                $this->authAuditService->record(
                    AuthAuditService::EVENT_EMAIL_CHANGED,
                    AuthAuditService::STATUS_SUCCESS,
                    $request,
                    user: $locked,
                    metadata: [
                        'source' => 'self_profile',
                        'target_user_id' => $locked->getKey(),
                        'changed_by_user_id' => $locked->getKey(),
                        'old_email_hash' => $oldEmailHash,
                        'new_email_hash' => $this->hashEmail($normalizedEmail),
                        'profile_version' => (int) $locked->profile_version,
                        'revoked_count' => $revokedCount,
                    ],
                    omitTopLevelEmail: true,
                );

                return [
                    'revoked_count' => $revokedCount,
                    'profile_version' => (int) $locked->profile_version,
                    'changed_at' => $now,
                    'old_email_hash' => $oldEmailHash,
                    'new_email_hash' => $this->hashEmail($normalizedEmail),
                ];
            });
        } catch (InvalidProfileChangeTokenException $exception) {
            if ($failureReason !== null) {
                $this->stepUpRateLimiter->recordFailedAttempt(
                    $user,
                    $request,
                    ProfileStepUpRateLimiter::SCOPE_EMAIL_CHANGE_CONFIRM,
                );
                $this->recordEmailChangeFailure($user, $request, $failureReason);
            }

            throw $exception;
        }

        $this->stepUpRateLimiter->clear(
            $user,
            $request,
            ProfileStepUpRateLimiter::SCOPE_EMAIL_CHANGE_CONFIRM,
        );

        $this->profileBlockchainService->recordEmailChanged(
            $user->fresh(),
            $result['profile_version'],
            $result['revoked_count'],
            $result['old_email_hash'],
            $result['new_email_hash'],
            $request,
            $result['changed_at'],
        );

        return [
            'revoked_count' => $result['revoked_count'],
            'profile_version' => $result['profile_version'],
        ];
    }

    private function invalidateActiveEmailChangeTokens(User $user): void
    {
        ProfileChangeToken::query()
            ->where('user_id', $user->getKey())
            ->where('type', ProfileChangeToken::TYPE_EMAIL_CHANGE)
            ->active()
            ->update(['used_at' => now()]);
    }

    private function assertEmailAvailableForChange(User $user, string $normalizedEmail): void
    {
        if (! $this->isEmailAvailableForChange($user, $normalizedEmail)) {
            throw new \InvalidArgumentException('The new email is not available.');
        }
    }

    private function isEmailAvailableForChange(User $user, string $normalizedEmail): bool
    {
        $currentEmail = $this->normalizeEmail((string) $user->email);

        if ($normalizedEmail === $currentEmail) {
            return false;
        }

        $validator = Validator::make(
            ['new_email' => $normalizedEmail],
            [
                'new_email' => [
                    'required',
                    'email',
                    Rule::unique('users', 'email')->ignore($user->getKey()),
                ],
            ],
        );

        return ! $validator->fails();
    }

    private function isUniqueEmailConstraintViolation(QueryException $exception): bool
    {
        $message = strtolower($exception->getMessage());

        return str_contains($message, 'users.email')
            || str_contains($message, 'users_email_unique')
            || str_contains($message, 'unique constraint failed: users.email');
    }

    private function recordEmailChangeFailure(User $user, Request $request, string $reason): void
    {
        $this->authAuditService->record(
            AuthAuditService::EVENT_EMAIL_CHANGE_FAILED,
            AuthAuditService::STATUS_FAILURE,
            $request,
            user: $user,
            metadata: [
                'source' => 'self_profile',
                'target_user_id' => $user->getKey(),
                'reason' => $reason,
                'profile_version' => (int) $user->profile_version,
            ],
            omitTopLevelEmail: true,
        );
    }

    private function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    private function hashEmail(string $email): string
    {
        return hash('sha256', $this->normalizeEmail($email));
    }

    private function maskEmail(string $email): string
    {
        $normalized = $this->normalizeEmail($email);

        if (! str_contains($normalized, '@')) {
            return '***';
        }

        [$local, $domain] = explode('@', $normalized, 2);
        $visible = substr($local, 0, 1);
        $maskedLocal = $visible.str_repeat('*', max(1, strlen($local) - 1));

        return $maskedLocal.'@'.$domain;
    }
}
