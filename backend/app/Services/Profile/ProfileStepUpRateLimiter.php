<?php

namespace App\Services\Profile;

use App\Models\User;
use App\Support\Profile\ProfileStepUpRateLimitedException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class ProfileStepUpRateLimiter
{
    /**
     * @throws ProfileStepUpRateLimitedException
     */
    public function ensureNotLocked(User $user, ?Request $request = null, string $scope = 'step_up'): void
    {
        if ($this->isLocked($user, $request, $scope)) {
            throw new ProfileStepUpRateLimitedException($this->availableIn($user, $request, $scope));
        }
    }

    public function recordFailedAttempt(User $user, ?Request $request = null, string $scope = 'step_up'): void
    {
        $key = $this->key($user, $request, $scope);
        $attemptsKey = $key.':attempts';
        $lockKey = $key.':lock';
        $maxAttempts = (int) config('profile.step_up.max_attempts', 5);
        $decaySeconds = (int) config('profile.step_up.decay_seconds', 300);

        $attempts = (int) Cache::get($attemptsKey, 0) + 1;
        Cache::put($attemptsKey, $attempts, now()->addSeconds($decaySeconds * 2));

        if ($attempts >= $maxAttempts) {
            Cache::put($lockKey, now()->addSeconds($decaySeconds)->timestamp, now()->addSeconds($decaySeconds));
        }
    }

    public function clear(User $user, ?Request $request = null, string $scope = 'step_up'): void
    {
        $key = $this->key($user, $request, $scope);
        Cache::forget($key.':attempts');
        Cache::forget($key.':lock');
    }

    public function availableIn(User $user, ?Request $request = null, string $scope = 'step_up'): int
    {
        $lockKey = $this->key($user, $request, $scope).':lock';
        $expiresAt = Cache::get($lockKey);

        if ($expiresAt === null) {
            return 0;
        }

        return max(0, (int) $expiresAt - now()->timestamp);
    }

    public function isLocked(User $user, ?Request $request = null, string $scope = 'step_up'): bool
    {
        $lockKey = $this->key($user, $request, $scope).':lock';
        $expiresAt = Cache::get($lockKey);

        if ($expiresAt === null) {
            return false;
        }

        if ((int) $expiresAt <= now()->timestamp) {
            Cache::forget($lockKey);

            return false;
        }

        return true;
    }

    private function key(User $user, ?Request $request = null, string $scope = 'step_up'): string
    {
        $material = (string) $user->getKey().'|'.($request?->ip() ?? 'unknown');

        if ($scope !== 'step_up') {
            $material .= '|'.$scope;
        }

        return 'profile_step_up:'.hash('sha256', $material);
    }

    public const SCOPE_RECONFIGURE_VERIFY = '2fa_reconfigure_verify';

    public const SCOPE_EMAIL_CHANGE_CONFIRM = 'email_change_confirm';
}
