<?php

namespace App\Services\Auth;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class LoginRateLimiter
{
    public const SCOPE_USER_LOGIN = 'auth_login';

    public const SCOPE_CAMERA_LOGIN = 'camera_auth_login';

    public function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    /**
     * @throws LoginRateLimitedException
     */
    public function ensureNotLocked(string $email, Request $request, string $scope = self::SCOPE_USER_LOGIN): void
    {
        if ($this->isLocked($email, $request, $scope)) {
            throw new LoginRateLimitedException($this->availableIn($email, $request, $scope));
        }
    }

    /**
     * Record a failed login attempt. Returns true when the attempt triggers lockout.
     */
    public function recordFailedAttempt(string $email, Request $request, string $scope = self::SCOPE_USER_LOGIN): bool
    {
        $key = $this->key($email, $request, $scope);
        $attemptsKey = $key.':attempts';
        $lockKey = $key.':lock';
        $maxAttempts = $this->maxAttemptsForScope($scope);
        $lockMinutes = $this->lockMinutesForScope($scope);

        $attempts = (int) Cache::get($attemptsKey, 0) + 1;
        Cache::put($attemptsKey, $attempts, now()->addMinutes($lockMinutes * 2));

        if ($attempts >= $maxAttempts) {
            Cache::put($lockKey, now()->addMinutes($lockMinutes)->timestamp, now()->addMinutes($lockMinutes));

            return true;
        }

        return false;
    }

    public function clear(string $email, Request $request, string $scope = self::SCOPE_USER_LOGIN): void
    {
        $key = $this->key($email, $request, $scope);
        Cache::forget($key.':attempts');
        Cache::forget($key.':lock');
    }

    public function availableIn(string $email, Request $request, string $scope = self::SCOPE_USER_LOGIN): int
    {
        $lockKey = $this->key($email, $request, $scope).':lock';
        $expiresAt = Cache::get($lockKey);

        if ($expiresAt === null) {
            return 0;
        }

        return max(0, (int) $expiresAt - now()->timestamp);
    }

    public function isLocked(string $email, Request $request, string $scope = self::SCOPE_USER_LOGIN): bool
    {
        $lockKey = $this->key($email, $request, $scope).':lock';
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

    private function key(string $email, Request $request, string $scope): string
    {
        $material = $scope.'|'.$this->normalizeEmail($email).'|'.($request->ip() ?? 'unknown');

        return $scope.':'.hash('sha256', $material);
    }

    private function maxAttemptsForScope(string $scope): int
    {
        if ($scope === self::SCOPE_CAMERA_LOGIN) {
            return (int) config('auth_security.camera_login_max_attempts', 5);
        }

        return (int) config('auth_security.login_max_attempts', 5);
    }

    private function lockMinutesForScope(string $scope): int
    {
        if ($scope === self::SCOPE_CAMERA_LOGIN) {
            return (int) config('auth_security.camera_login_lock_minutes', 15);
        }

        return (int) config('auth_security.login_lock_minutes', 15);
    }
}
