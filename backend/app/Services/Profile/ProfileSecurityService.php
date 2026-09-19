<?php

namespace App\Services\Profile;

use App\Models\ProfileChangeToken;
use App\Models\User;
use App\Services\Auth\RefreshTokenService;
use App\Services\Auth\TwoFactorService;
use App\Support\Profile\InvalidProfileChangeTokenException;
use App\Support\Profile\ProfileStepUpRateLimitedException;
use App\Support\Profile\ProfileStepUpVerificationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class ProfileSecurityService
{
    public function __construct(
        private readonly TwoFactorService $twoFactorService,
        private readonly RefreshTokenService $refreshTokenService,
        private readonly ProfileStepUpRateLimiter $stepUpRateLimiter,
    ) {}

    /**
     * @throws ProfileStepUpRateLimitedException
     * @throws ProfileStepUpVerificationException
     */
    public function verifyStepUp(
        User $user,
        string $currentPassword,
        string $otp,
        ?Request $request = null,
    ): void {
        $this->stepUpRateLimiter->ensureNotLocked($user, $request);

        if (! $this->hasValidTwoFactorSetup($user)) {
            $this->stepUpRateLimiter->recordFailedAttempt($user, $request);

            throw new ProfileStepUpVerificationException;
        }

        $passwordValid = Hash::check($currentPassword, $user->password);
        $otpValid = $this->twoFactorService->verifyForUser($user, $otp);

        if (! $passwordValid || ! $otpValid) {
            $this->stepUpRateLimiter->recordFailedAttempt($user, $request);

            throw new ProfileStepUpVerificationException;
        }

        $this->stepUpRateLimiter->clear($user, $request);
    }

    /**
     * @param  string  $type  Must be a {@see ProfileChangeToken} supported type constant — never a request-controlled string.
     * @return array{token: string, model: ProfileChangeToken}
     */
    public function createChangeToken(
        User $user,
        string $type,
        array $pendingPayload = [],
        ?Request $request = null,
    ): array {
        $this->assertSupportedTokenType($type);

        $plainToken = bin2hex(random_bytes(32));
        $ttlMinutes = (int) config('profile.change_tokens.ttl_minutes', 10);

        $model = ProfileChangeToken::query()->create([
            'user_id' => $user->getKey(),
            'type' => $type,
            'token_hash' => ProfileChangeToken::hashToken($plainToken),
            'pending_payload' => $pendingPayload === [] ? null : $pendingPayload,
            'expires_at' => now()->addMinutes($ttlMinutes),
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
        ]);

        return [
            'token' => $plainToken,
            'model' => $model,
        ];
    }

    /**
     * @param  string  $type  Must be a {@see ProfileChangeToken} supported type constant — never a request-controlled string.
     *
     * @throws InvalidProfileChangeTokenException
     */
    public function validateChangeToken(string $plainToken, string $type): ProfileChangeToken
    {
        $this->assertSupportedTokenType($type);

        if ($plainToken === '') {
            throw new InvalidProfileChangeTokenException;
        }

        $token = $this->findActiveTokenByPlainToken($plainToken, $type);

        if ($token === null) {
            throw new InvalidProfileChangeTokenException;
        }

        return $token;
    }

    /**
     * @param  string  $type  Must be a {@see ProfileChangeToken} supported type constant — never a request-controlled string.
     *
     * @throws InvalidProfileChangeTokenException
     */
    public function consumeChangeToken(string $plainToken, string $type): ProfileChangeToken
    {
        $this->assertSupportedTokenType($type);

        if ($plainToken === '') {
            throw new InvalidProfileChangeTokenException;
        }

        $tokenHash = ProfileChangeToken::hashToken($plainToken);

        return DB::transaction(function () use ($tokenHash, $type): ProfileChangeToken {
            $token = ProfileChangeToken::query()
                ->where('token_hash', $tokenHash)
                ->where('type', $type)
                ->lockForUpdate()
                ->first();

            if ($token === null || $token->isUsed() || $token->isExpired()) {
                throw new InvalidProfileChangeTokenException;
            }

            $updated = ProfileChangeToken::query()
                ->whereKey($token->getKey())
                ->whereNull('used_at')
                ->where('expires_at', '>', now())
                ->update(['used_at' => now()]);

            if ($updated === 0) {
                throw new InvalidProfileChangeTokenException;
            }

            return $token->fresh();
        });
    }

    /**
     * @return array{user: User, revoked_count: int}
     */
    public function revokeSessionsAfterSensitiveChange(
        User $user,
        ?Request $request = null,
    ): array {
        return DB::transaction(function () use ($user): array {
            /** @var User $locked */
            $locked = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            $locked->forceFill([
                'last_security_changed_at' => now(),
            ])->save();

            $revokedCount = $this->refreshTokenService->revokeAllForUser($locked);

            return [
                'user' => $locked->fresh(),
                'revoked_count' => $revokedCount,
            ];
        });
    }

    private function hasValidTwoFactorSetup(User $user): bool
    {
        return $user->two_factor_enabled === true
            && $user->two_factor_secret !== null
            && $user->two_factor_confirmed_at !== null;
    }

    private function findActiveTokenByPlainToken(string $plainToken, string $type): ?ProfileChangeToken
    {
        if ($plainToken === '') {
            return null;
        }

        $token = ProfileChangeToken::query()
            ->where('token_hash', ProfileChangeToken::hashToken($plainToken))
            ->where('type', $type)
            ->first();

        if ($token === null || $token->isUsed() || $token->isExpired()) {
            return null;
        }

        return $token;
    }

    private function assertSupportedTokenType(string $type): void
    {
        if (! ProfileChangeToken::isSupportedType($type)) {
            throw new \InvalidArgumentException('Unsupported profile change token type.');
        }
    }
}
