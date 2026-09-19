<?php

namespace Tests\Feature;

use App\Models\AuthAuditLog;
use App\Models\RefreshToken;
use App\Models\Role;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Services\Auth\TwoFactorService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

/**
 * M10 umbrella regression tests for cross-flow login-module guarantees.
 * Detailed coverage lives in milestone-specific Auth* test classes.
 */
class AuthFinalHardeningTest extends TestCase
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
            'auth_security.otp_max_attempts' => 5,
        ]);
    }

    public function test_public_registration_endpoint_is_not_available(): void
    {
        $this->postJson('/api/auth/register', [
            'email' => 'self-service@example.com',
            'password' => 'SelfService12!',
        ])->assertNotFound();
    }

    public function test_password_login_stage_does_not_issue_tokens_before_otp(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.next_step', 'otp_required')
            ->assertJsonMissingPath('data.access_token')
            ->assertCookieMissing('refresh_token');

        $encoded = json_encode($response->json());
        $this->assertStringNotContainsString('refresh_token', $encoded);
    }

    public function test_guard_scope_mine_returns_only_own_sessions(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $admin = $this->enableTwoFactor($this->adminUser());

        $this->loginWithOtp($guard)['verify'];
        $this->loginWithOtp($admin)['verify'];

        $this->assertGreaterThanOrEqual(2, RefreshToken::query()->whereNull('revoked_at')->count());

        $response = $this->actingAs($guard->fresh(['role']), 'api')
            ->getJson('/api/auth/sessions?scope=mine');

        $response->assertOk();

        $sessions = $response->json('data');
        $this->assertNotEmpty($sessions);

        foreach ($sessions as $session) {
            $this->assertSame($guard->getKey(), $session['user']['id']);
            $this->assertNotSame($admin->getKey(), $session['user']['id']);
        }
    }

    public function test_full_activation_path_from_admin_create_to_protected_access(): void
    {
        $admin = $this->adminUser();
        $guardRoleId = Role::query()->where('name', 'Guard')->value('id');

        $this->actingAs($admin, 'api')
            ->postJson('/api/users', [
                'name' => 'New Guard',
                'email' => 'new-guard@example.com',
                'password' => 'TempPassword1!',
                'role_id' => $guardRoleId,
            ])
            ->assertCreated()
            ->assertJsonPath('data.setup_required', true)
            ->assertJsonStructure(['password_setup' => ['token', 'expires_at']]);

        $setupToken = $this->postJson('/api/auth/login', [
            'email' => 'new-guard@example.com',
            'password' => 'TempPassword1!',
        ])->json('data.setup_token');
        $this->assertNotEmpty($setupToken);

        $complete = $this->postJson('/api/auth/password-setup/complete', [
            'setup_token' => $setupToken,
            'password' => 'NewStrongPassword1!',
            'password_confirmation' => 'NewStrongPassword1!',
        ])->assertOk()
            ->assertJsonPath('data.next_step', 'two_factor_setup_required');

        $this->travel(2)->seconds();

        try {
            $setupSessionToken = $complete->json('data.two_factor_setup_token');

            $start = $this->postJson('/api/auth/2fa/setup/start', [
                'two_factor_setup_token' => $setupSessionToken,
            ])->assertOk();

            $setupOtp = app(TwoFactorService::class)->generateTotp($start->json('data.manual_key'));

            $verifySetup = $this->postJson('/api/auth/2fa/setup/verify', [
                'two_factor_setup_token' => $setupSessionToken,
                'otp' => $setupOtp,
            ])->assertOk()
                ->assertJsonStructure(['data' => ['access_token']])
                ->assertCookie('refresh_token');

            $this->withHeader('Authorization', 'Bearer '.$verifySetup->json('data.access_token'))
                ->getJson('/api/auth/me')
                ->assertOk()
                ->assertJsonPath('data.user.email', 'new-guard@example.com');
        } finally {
            $this->travelBack();
        }
    }

    public function test_login_and_refresh_responses_never_include_refresh_token_in_json_body(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $login = $this->loginWithOtp($user)['verify'];
        $cookie = $login->getCookie('refresh_token', false);

        $login->assertJsonMissingPath('data.refresh_token');

        $loginEncoded = json_encode($login->json());
        $this->assertStringNotContainsString('refresh_token', $loginEncoded);
        $this->assertStringNotContainsString($cookie->getValue(), $loginEncoded);

        $refresh = $this->withUnencryptedCookie('refresh_token', $cookie->getValue())
            ->withCredentials()
            ->postJson('/api/auth/refresh')
            ->assertOk();

        $refreshCookie = $refresh->getCookie('refresh_token', false);

        $refresh->assertJsonMissingPath('data.refresh_token');

        $refreshEncoded = json_encode($refresh->json());
        $this->assertStringNotContainsString('refresh_token', $refreshEncoded);
        $this->assertStringNotContainsString($refreshCookie->getValue(), $refreshEncoded);
    }

    public function test_m9_security_audit_events_are_recorded_without_secrets(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($admin, 'api')
            ->postJson('/api/auth/2fa/reset/'.$target->getKey())
            ->assertOk();

        $this->actingAs($admin, 'api')
            ->patchJson('/api/users/'.$target->getKey(), [
                'password' => 'newpassword12',
            ])
            ->assertOk();

        $resetLog = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RESET)
            ->latest('occurred_at')
            ->first();

        $passwordLog = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_PASSWORD_CHANGED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($resetLog);
        $this->assertNotNull($passwordLog);

        $combined = json_encode([
            $resetLog->metadata,
            $passwordLog->metadata,
        ]);

        $this->assertStringNotContainsString('two_factor_secret', strtolower($combined));
        $this->assertStringNotContainsString('refresh_token', strtolower($combined));
        $this->assertStringNotContainsString('token_hash', strtolower($combined));
    }

    public function test_setup_required_user_cannot_access_protected_api_with_bearer_only(): void
    {
        $user = User::factory()->setupRequired()->withoutTwoFactor()->create([
            'role_id' => Role::query()->where('name', 'Guard')->value('id'),
        ]);

        $token = auth('api')->login($user);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/auth/me')
            ->assertForbidden();
    }
}
