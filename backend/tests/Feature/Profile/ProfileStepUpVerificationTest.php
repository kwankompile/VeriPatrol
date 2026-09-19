<?php

namespace Tests\Feature\Profile;

use App\Models\RefreshToken;
use App\Models\User;
use App\Services\Profile\ProfileSecurityService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfileStepUpVerificationTest extends TestCase
{
    use CreatesPatrolUsers;
    use EnablesTwoFactorAuth;
    use RefreshDatabase;

    private ProfileSecurityService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-auth-tests-32chars',
            'auth_security.access_token_ttl_minutes' => 30,
            'auth_security.refresh_cookie_name' => 'refresh_token',
            'auth_security.refresh_cookie_path' => '/api/auth',
            'profile.step_up.max_attempts' => 5,
            'profile.step_up.decay_seconds' => 300,
        ]);

        $this->service = app(ProfileSecurityService::class);
    }

    public function test_old_refresh_cookie_cannot_refresh_after_sensitive_change_revocation(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $login = $this->loginWithOtp($user)['verify'];
        $cookie = $login->getCookie('refresh_token', false);

        $this->service->revokeSessionsAfterSensitiveChange($user);

        $this->withUnencryptedCookie('refresh_token', $cookie->getValue())
            ->withCredentials()
            ->postJson('/api/auth/refresh')
            ->assertUnauthorized();
    }

    public function test_old_access_token_cannot_access_profile_after_last_security_changed_at_update(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $accessToken = $this->loginWithOtp($user)['verify']->json('data.access_token');

        $this->service->revokeSessionsAfterSensitiveChange($user);

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/profile')
            ->assertForbidden();
    }

    public function test_new_login_works_after_sensitive_change_revocation(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $oldToken = $this->loginWithOtp($user)['verify']->json('data.access_token');

        $this->service->revokeSessionsAfterSensitiveChange($user);

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$oldToken)
            ->getJson('/api/profile')
            ->assertForbidden();

        Carbon::setTestNow(now()->addSecond());

        $newToken = $this->loginWithOtp($user->fresh())['verify']->json('data.access_token');

        $this->withHeader('Authorization', 'Bearer '.$newToken)
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.user.id', $user->getKey());
    }

    public function test_active_user_middleware_still_rejects_jwt_issued_before_password_change(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $accessToken = $this->loginWithOtp($user)['verify']->json('data.access_token');

        $user->forceFill(['last_password_changed_at' => now()])->save();

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/profile')
            ->assertForbidden();
    }

    public function test_active_user_middleware_rejects_jwt_issued_before_last_security_changed_at(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $accessToken = $this->loginWithOtp($user)['verify']->json('data.access_token');

        $user->forceFill(['last_security_changed_at' => now()])->save();

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/profile')
            ->assertForbidden();
    }

    public function test_active_user_middleware_uses_later_of_password_and_security_timestamps(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $accessToken = $this->loginWithOtp($user)['verify']->json('data.access_token');

        $user->forceFill([
            'last_password_changed_at' => now()->subMinutes(5),
            'last_security_changed_at' => now(),
        ])->save();

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/profile')
            ->assertForbidden();
    }

    public function test_valid_jwt_works_when_no_security_timestamps_exist(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $user->forceFill([
            'last_password_changed_at' => null,
            'last_security_changed_at' => null,
        ])->save();

        $accessToken = $this->loginWithOtp($user->fresh())['verify']->json('data.access_token');

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/profile')
            ->assertOk();
    }

    public function test_active_user_middleware_fails_closed_when_jwt_payload_unreadable_and_security_timestamp_exists(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $user->forceFill(['last_security_changed_at' => now()])->save();

        $this->actingAs($user, 'api')
            ->getJson('/api/profile')
            ->assertForbidden();
    }

    public function test_revoke_sessions_helper_returns_accurate_revoked_count(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($user);
        $this->loginWithOtp($user);

        $this->assertSame(2, RefreshToken::query()->where('user_id', $user->getKey())->whereNull('revoked_at')->count());

        $result = $this->service->revokeSessionsAfterSensitiveChange($user);

        $this->assertSame(2, $result['revoked_count']);
        $this->assertNotNull($result['user']->last_security_changed_at);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }
}
