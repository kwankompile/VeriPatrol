<?php

namespace App\Services\Profile;

use App\Models\ProfileChangeToken;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Services\Auth\RefreshTokenService;
use App\Services\Auth\TwoFactorService;
use App\Support\Profile\InvalidProfileChangeTokenException;
use App\Support\Profile\ProfileStepUpRateLimitedException;
use App\Support\Profile\ProfileStepUpVerificationException;
use App\Support\Profile\ProfileTwoFactorReconfigureStaleSecurityStateException;
use App\Support\Profile\ProfileTwoFactorReconfigureVerificationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProfileTwoFactorReconfigureService
{
    public function __construct(
        private readonly ProfileSecurityService $profileSecurityService,
        private readonly TwoFactorService $twoFactorService,
        private readonly RefreshTokenService $refreshTokenService,
        private readonly AuthAuditService $authAuditService,
        private readonly ProfileStepUpRateLimiter $stepUpRateLimiter,
        private readonly ProfileBlockchainService $profileBlockchainService,
    ) {}

    /**
     * @param  array{current_password: string, otp: string}  $validated
     * @return array{
     *     two_factor_reconfigure_token: string,
     *     manual_key: string,
     *     otpauth_uri: string,
     *     expires_in: int
     * }
     *
     * @throws ProfileStepUpRateLimitedException
     * @throws ProfileStepUpVerificationException
     */
    public function startReconfigure(User $user, array $validated, Request $request): array
    {
        if (! $this->userHasValidTwoFactorSetup($user)) {
            $this->stepUpRateLimiter->recordFailedAttempt($user, $request);
            $this->recordReconfigureFailure($user, $request, 'missing_valid_2fa_setup');

            throw new ProfileStepUpVerificationException;
        }

        $securitySnapshot = $this->captureSecuritySnapshot($user);

        try {
            $this->profileSecurityService->verifyStepUp(
                $user,
                $validated['current_password'],
                $validated['otp'],
                $request,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            $this->recordReconfigureFailure($user, $request, 'step_up_rate_limited');

            throw $exception;
        } catch (ProfileStepUpVerificationException $exception) {
            $this->recordReconfigureFailure($user, $request, 'step_up_failed');

            throw $exception;
        }

        $ttlMinutes = (int) config('profile.change_tokens.ttl_minutes', 10);

        try {
            return DB::transaction(function () use ($user, $request, $ttlMinutes, $securitySnapshot): array {
                $locked = User::query()
                    ->whereKey($user->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();

                if (! $this->securitySnapshotMatches($locked, $securitySnapshot)) {
                    throw new ProfileTwoFactorReconfigureStaleSecurityStateException;
                }

                $this->invalidateActiveReconfigureTokens($locked);

                $newSecret = $this->twoFactorService->generateSecret();

                $created = $this->profileSecurityService->createChangeToken(
                    $locked,
                    ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE,
                    [
                        'pending_secret' => $newSecret,
                        'requested_at' => now()->toIso8601String(),
                    ],
                    $request,
                );

                $this->authAuditService->record(
                    AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_STARTED,
                    AuthAuditService::STATUS_SUCCESS,
                    $request,
                    user: $locked,
                    metadata: [
                        'source' => 'self_profile',
                        'target_user_id' => $locked->getKey(),
                        'profile_version' => (int) $locked->profile_version,
                        'token_expires_at' => $created['model']->expires_at?->toIso8601String(),
                    ],
                    omitTopLevelEmail: true,
                );

                return [
                    'two_factor_reconfigure_token' => $created['token'],
                    'manual_key' => $newSecret,
                    'otpauth_uri' => $this->twoFactorService->buildOtpauthUri($locked, $newSecret),
                    'expires_in' => $ttlMinutes * 60,
                ];
            }, 3);
        } catch (ProfileTwoFactorReconfigureStaleSecurityStateException) {
            $this->recordReconfigureFailure($user, $request, 'security_state_changed');

            throw new ProfileStepUpVerificationException;
        }
    }

    /**
     * @param  array{two_factor_reconfigure_token: string, otp: string}  $validated
     * @return array{revoked_count: int, profile_version: int}
     *
     * @throws ProfileStepUpRateLimitedException
     * @throws InvalidProfileChangeTokenException
     * @throws ProfileTwoFactorReconfigureVerificationException
     */
    public function verifyReconfigure(User $user, array $validated, Request $request): array
    {
        try {
            $this->stepUpRateLimiter->ensureNotLocked(
                $user,
                $request,
                ProfileStepUpRateLimiter::SCOPE_RECONFIGURE_VERIFY,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            $this->recordReconfigureFailure($user, $request, 'rate_limited');

            throw $exception;
        }

        $plainToken = $validated['two_factor_reconfigure_token'];
        $otp = $validated['otp'];
        $tokenHash = ProfileChangeToken::hashToken($plainToken);
        $failureReason = null;

        try {
            $result = DB::transaction(function () use ($user, $tokenHash, $otp, $request, &$failureReason): array {
                /** @var User $locked */
                $locked = User::query()
                    ->whereKey($user->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();

                $token = ProfileChangeToken::query()
                    ->where('token_hash', $tokenHash)
                    ->where('type', ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE)
                    ->where('user_id', $locked->getKey())
                    ->lockForUpdate()
                    ->first();

                if ($token === null) {
                    $failureReason = 'invalid_token';

                    throw new InvalidProfileChangeTokenException;
                }

                if ($token->isUsed()) {
                    $failureReason = 'used';

                    throw new InvalidProfileChangeTokenException;
                }

                if ($token->isExpired()) {
                    $failureReason = 'expired';

                    throw new InvalidProfileChangeTokenException;
                }

                if ((string) $token->user_id !== (string) $locked->getKey()) {
                    $failureReason = 'token_user_mismatch';

                    throw new InvalidProfileChangeTokenException;
                }

                $pendingSecret = $token->pending_payload['pending_secret'] ?? null;

                if (! is_string($pendingSecret) || $pendingSecret === '') {
                    $failureReason = 'invalid_token';

                    throw new InvalidProfileChangeTokenException;
                }

                if (! $this->twoFactorService->verifyCode($pendingSecret, $otp)) {
                    $failureReason = 'invalid_new_otp';

                    throw new ProfileTwoFactorReconfigureVerificationException;
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

                $this->invalidateActiveReconfigureTokens($locked);

                $now = now();

                $locked->forceFill([
                    'two_factor_enabled' => true,
                    'two_factor_secret' => $this->twoFactorService->encryptSecret($pendingSecret),
                    'two_factor_confirmed_at' => $now,
                    'last_security_changed_at' => $now,
                ]);
                $locked->profile_version = ((int) $locked->profile_version) + 1;
                $locked->save();

                $revokedCount = $this->refreshTokenService->revokeAllForUser($locked);

                $this->authAuditService->record(
                    AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURED,
                    AuthAuditService::STATUS_SUCCESS,
                    $request,
                    user: $locked,
                    metadata: [
                        'source' => 'self_profile',
                        'target_user_id' => $locked->getKey(),
                        'changed_by_user_id' => $locked->getKey(),
                        'profile_version' => (int) $locked->profile_version,
                        'revoked_count' => $revokedCount,
                    ],
                    omitTopLevelEmail: true,
                );

                return [
                    'revoked_count' => $revokedCount,
                    'profile_version' => (int) $locked->profile_version,
                    'changed_at' => $now,
                ];
            }, 3);
        } catch (InvalidProfileChangeTokenException $exception) {
            if ($failureReason !== null) {
                $this->stepUpRateLimiter->recordFailedAttempt(
                    $user,
                    $request,
                    ProfileStepUpRateLimiter::SCOPE_RECONFIGURE_VERIFY,
                );
                $this->recordReconfigureFailure($user, $request, $failureReason);
            }

            throw $exception;
        } catch (ProfileTwoFactorReconfigureVerificationException $exception) {
            $this->stepUpRateLimiter->recordFailedAttempt(
                $user,
                $request,
                ProfileStepUpRateLimiter::SCOPE_RECONFIGURE_VERIFY,
            );
            $this->recordReconfigureFailure($user, $request, 'invalid_new_otp');

            throw $exception;
        }

        $this->stepUpRateLimiter->clear(
            $user,
            $request,
            ProfileStepUpRateLimiter::SCOPE_RECONFIGURE_VERIFY,
        );

        $this->profileBlockchainService->recordTwoFactorReconfigured(
            $user->fresh(),
            $result['profile_version'],
            $result['revoked_count'],
            $request,
            $result['changed_at'],
        );

        return $result;
    }

    private function invalidateActiveReconfigureTokens(User $user): void
    {
        ProfileChangeToken::query()
            ->where('user_id', $user->getKey())
            ->where('type', ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE)
            ->active()
            ->update(['used_at' => now()]);
    }

    private function userHasValidTwoFactorSetup(User $user): bool
    {
        return $user->two_factor_enabled === true
            && $user->two_factor_secret !== null
            && $user->two_factor_confirmed_at !== null;
    }

    /**
     * @return array{
     *     two_factor_enabled: bool,
     *     two_factor_secret: string|null,
     *     two_factor_confirmed_at: int|null,
     *     last_security_changed_at: int|null
     * }
     */
    private function captureSecuritySnapshot(User $user): array
    {
        return [
            'two_factor_enabled' => $user->two_factor_enabled === true,
            'two_factor_secret' => $user->two_factor_secret,
            'two_factor_confirmed_at' => $user->two_factor_confirmed_at?->getTimestamp(),
            'last_security_changed_at' => $user->last_security_changed_at?->getTimestamp(),
        ];
    }

    /**
     * @param  array{
     *     two_factor_enabled: bool,
     *     two_factor_secret: string|null,
     *     two_factor_confirmed_at: int|null,
     *     last_security_changed_at: int|null
     * }  $snapshot
     */
    private function securitySnapshotMatches(User $user, array $snapshot): bool
    {
        if (! $this->userHasValidTwoFactorSetup($user)) {
            return false;
        }

        return ($user->two_factor_enabled === true) === $snapshot['two_factor_enabled']
            && $user->two_factor_secret === $snapshot['two_factor_secret']
            && ($user->two_factor_confirmed_at?->getTimestamp()) === $snapshot['two_factor_confirmed_at']
            && ($user->last_security_changed_at?->getTimestamp()) === $snapshot['last_security_changed_at'];
    }

    private function recordReconfigureFailure(User $user, Request $request, string $reason): void
    {
        $this->authAuditService->record(
            AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_FAILED,
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
}
