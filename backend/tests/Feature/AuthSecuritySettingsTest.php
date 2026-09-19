<?php

namespace Tests\Feature;

use App\Models\AuthAuditLog;
use App\Models\RefreshToken;
use App\Models\TwoFactorSetupSession;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class AuthSecuritySettingsTest extends TestCase
{
    use CreatesPatrolUsers;
    use EnablesTwoFactorAuth;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-auth-tests-32chars',
            'auth_security.access_token_ttl_minutes' => 30,
            'auth_security.refresh_cookie_name' => 'refresh_token',
            'auth_security.refresh_cookie_path' => '/api/auth',
            'auth_security.password_min_length' => 12,
        ]);
    }

    private function asAdmin(User $admin): static
    {
        return $this->actingAs($admin, 'api');
    }

    public function test_admin_can_reset_another_users_two_factor(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($target);

        $response = $this->asAdmin($admin)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey());

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.id', $target->getKey())
            ->assertJsonPath('data.user.two_factor_enabled', false);
    }

    public function test_guard_cannot_reset_two_factor(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $guardToken = $this->loginWithOtp($guard)['verify']->json('data.access_token');
        $target = $this->enableTwoFactor($this->securityOperatorUser());

        $this->withHeader('Authorization', 'Bearer '.$guardToken)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey())
            ->assertForbidden();
    }

    public function test_security_operator_cannot_reset_two_factor(): void
    {
        $operator = $this->enableTwoFactor($this->securityOperatorUser());
        $operatorToken = $this->loginWithOtp($operator)['verify']->json('data.access_token');
        $target = $this->enableTwoFactor($this->guardUser());

        $this->withHeader('Authorization', 'Bearer '.$operatorToken)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey())
            ->assertForbidden();
    }

    public function test_two_factor_reset_clears_two_factor_fields(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());

        $this->asAdmin($admin)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey())
            ->assertOk();

        $target->refresh();
        $this->assertNull($target->two_factor_secret);
        $this->assertFalse($target->two_factor_enabled);
        $this->assertNull($target->two_factor_confirmed_at);
        $this->assertSame(0, TwoFactorSetupSession::query()->where('user_id', $target->getKey())->count());
    }

    public function test_two_factor_reset_revokes_target_refresh_sessions(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($target);

        $this->assertSame(1, RefreshToken::query()->whereNull('revoked_at')->count());

        $this->asAdmin($admin)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey())
            ->assertOk();

        $this->assertSame(
            0,
            RefreshToken::query()->where('user_id', $target->getKey())->whereNull('revoked_at')->count()
        );
    }

    public function test_old_refresh_cookie_cannot_refresh_after_two_factor_reset(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $targetLogin = $this->loginWithOtp($target)['verify'];
        $cookie = $targetLogin->getCookie('refresh_token', false);

        $this->asAdmin($admin)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey())
            ->assertOk();

        $this->withUnencryptedCookie('refresh_token', $cookie->getValue())
            ->withCredentials()
            ->postJson('/api/auth/refresh')
            ->assertUnauthorized();
    }

    public function test_user_login_after_two_factor_reset_returns_setup_required(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());

        $this->asAdmin($admin)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey())
            ->assertOk();

        $login = $this->postJson('/api/auth/login', [
            'email' => $target->email,
            'password' => 'password',
        ]);

        $login->assertOk()
            ->assertJsonPath('data.next_step', 'two_factor_setup_required');
    }

    public function test_two_factor_reset_writes_audit_log_with_actor_and_target(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());

        $this->asAdmin($admin)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey())
            ->assertOk();

        $log = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RESET)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($log);
        $this->assertSame(AuthAuditService::STATUS_SUCCESS, $log->status);
        $this->assertSame($target->getKey(), $log->user_id);
        $this->assertSame($target->getKey(), $log->metadata['target_user_id']);
        $this->assertSame($target->email, $log->metadata['target_user_email']);
        $this->assertSame($admin->getKey(), $log->metadata['reset_by_user_id']);
        $this->assertArrayHasKey('revoked_count', $log->metadata);
    }

    public function test_two_factor_reset_response_does_not_expose_secrets_or_tokens(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());

        $response = $this->asAdmin($admin)
            ->postJson('/api/auth/2fa/reset/'.$target->getKey());

        $encoded = json_encode($response->json());
        $this->assertStringNotContainsString($this->testTotpSecret, $encoded);
        $this->assertStringNotContainsString('two_factor_secret', $encoded);
        $this->assertStringNotContainsString('token_hash', $encoded);
        $this->assertStringNotContainsString('two_factor_setup_token', $encoded);
    }

    public function test_password_update_revokes_refresh_sessions(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($target);

        $this->asAdmin($admin)
            ->patchJson('/api/users/'.$target->getKey(), [
                'password' => 'newpassword12',
            ])
            ->assertOk();

        $this->assertSame(
            0,
            RefreshToken::query()->where('user_id', $target->getKey())->whereNull('revoked_at')->count()
        );
    }

    public function test_old_refresh_cookie_cannot_refresh_after_password_change(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $targetLogin = $this->loginWithOtp($target)['verify'];
        $cookie = $targetLogin->getCookie('refresh_token', false);

        $this->asAdmin($admin)
            ->patchJson('/api/users/'.$target->getKey(), [
                'password' => 'newpassword12',
            ])
            ->assertOk();

        $this->withUnencryptedCookie('refresh_token', $cookie->getValue())
            ->withCredentials()
            ->postJson('/api/auth/refresh')
            ->assertUnauthorized();
    }

    public function test_old_access_token_cannot_access_me_after_password_change(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $targetToken = $this->loginWithOtp($target)['verify']->json('data.access_token');

        $this->asAdmin($admin)
            ->patchJson('/api/users/'.$target->getKey(), [
                'password' => 'newpassword12',
            ])
            ->assertOk();

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$targetToken)
            ->getJson('/api/auth/me')
            ->assertForbidden();
    }

    public function test_non_password_user_update_does_not_revoke_sessions(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($target);

        $this->asAdmin($admin)
            ->patchJson('/api/users/'.$target->getKey(), [
                'name' => 'Updated Guard Name',
            ])
            ->assertOk();

        $this->assertSame(
            1,
            RefreshToken::query()->where('user_id', $target->getKey())->whereNull('revoked_at')->count()
        );
    }

    public function test_non_password_user_update_does_not_change_last_password_changed_at(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $originalChangedAt = $target->last_password_changed_at;

        $this->asAdmin($admin)
            ->patchJson('/api/users/'.$target->getKey(), [
                'name' => 'Updated Guard Name',
            ])
            ->assertOk();

        $target->refresh();
        $this->assertEquals($originalChangedAt, $target->last_password_changed_at);
    }

    public function test_password_change_writes_password_changed_audit_log(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());

        $this->asAdmin($admin)
            ->patchJson('/api/users/'.$target->getKey(), [
                'password' => 'newpassword12',
            ])
            ->assertOk();

        $log = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_PASSWORD_CHANGED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($log);
        $this->assertSame(AuthAuditService::STATUS_SUCCESS, $log->status);
        $this->assertSame($target->getKey(), $log->metadata['target_user_id']);
        $this->assertSame($target->email, $log->metadata['target_user_email']);
        $this->assertSame($admin->getKey(), $log->metadata['changed_by_user_id']);
        $this->assertArrayHasKey('revoked_count', $log->metadata);
    }

    public function test_password_change_audit_metadata_does_not_include_password(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());
        $newPassword = 'newpassword12';

        $this->asAdmin($admin)
            ->patchJson('/api/users/'.$target->getKey(), [
                'password' => $newPassword,
            ])
            ->assertOk();

        $encoded = json_encode(AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_PASSWORD_CHANGED)
            ->latest('occurred_at')
            ->value('metadata'));

        $this->assertStringNotContainsString($newPassword, $encoded);
        $this->assertStringNotContainsString('password', strtolower($encoded));
    }

    public function test_admin_changing_another_users_password_does_not_revoke_admin_session(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $adminLogin = $this->loginWithOtp($admin);
        $adminToken = $adminLogin['verify']->json('data.access_token');
        $target = $this->enableTwoFactor($this->guardUser());

        $this->asAdmin($admin)
            ->patchJson('/api/users/'.$target->getKey(), [
                'password' => 'newpassword12',
            ])
            ->assertOk();

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$adminToken)
            ->getJson('/api/auth/me')
            ->assertOk();

        $this->assertSame(
            1,
            RefreshToken::query()->where('user_id', $admin->getKey())->whereNull('revoked_at')->count()
        );
    }

    public function test_active_user_middleware_fails_closed_when_jwt_payload_unreadable_after_password_change(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $user->forceFill(['last_password_changed_at' => now()])->save();

        $this->actingAs($user, 'api')
            ->getJson('/api/auth/me')
            ->assertForbidden();
    }
}
