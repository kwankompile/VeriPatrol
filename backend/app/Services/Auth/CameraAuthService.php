<?php

namespace App\Services\Auth;

use App\Models\Camera;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use PHPOpenSourceSaver\JWTAuth\JWTGuard;

class CameraAuthService
{
    public function __construct(
        private readonly LoginRateLimiter $loginRateLimiter,
    ) {}

    /**
     * @return array{
     *     access_token: string,
     *     token_type: string,
     *     expires_in: int,
     *     camera: array{id: string, name: string, rtsp_url: string|null}
     * }
     *
     * @throws LoginRateLimitedException
     */
    public function login(string $email, string $password, ?string $rtspUrl, Request $request): array
    {
        $email = $this->loginRateLimiter->normalizeEmail($email);

        $this->loginRateLimiter->ensureNotLocked($email, $request, LoginRateLimiter::SCOPE_CAMERA_LOGIN);

        $camera = Camera::query()->where('email', $email)->first();

        if ($camera === null || $camera->password === null || ! Hash::check($password, $camera->password)) {
            $justLocked = $this->loginRateLimiter->recordFailedAttempt(
                $email,
                $request,
                LoginRateLimiter::SCOPE_CAMERA_LOGIN,
            );

            if ($justLocked) {
                throw new LoginRateLimitedException(
                    $this->loginRateLimiter->availableIn($email, $request, LoginRateLimiter::SCOPE_CAMERA_LOGIN),
                );
            }

            throw new InvalidCameraCredentialsException;
        }

        if (! $camera->credential_enabled || ! $camera->is_active) {
            throw new CameraAccessDisabledException;
        }

        $this->loginRateLimiter->clear($email, $request, LoginRateLimiter::SCOPE_CAMERA_LOGIN);

        $camera->last_login_at = now();

        if ($rtspUrl !== null && $rtspUrl !== '') {
            $camera->rtsp_url = $rtspUrl;
            $camera->rtsp_reported_at = now();
        }

        $camera->save();

        $ttlMinutes = (int) config('auth_security.camera_token_ttl_minutes', 60);

        /** @var JWTGuard $guard */
        $guard = Auth::guard('camera');
        $guard->setTTL($ttlMinutes);
        $token = $guard->login($camera);

        return [
            'access_token' => $token,
            'token_type' => 'bearer',
            'expires_in' => $ttlMinutes * 60,
            'camera' => [
                'id' => $camera->id,
                'name' => $camera->name,
                'rtsp_url' => $camera->rtsp_url,
            ],
        ];
    }
}
