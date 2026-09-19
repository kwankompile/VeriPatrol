<?php

namespace Tests\Feature\Profile;

use App\Models\AuthAuditLog;
use App\Models\RefreshToken;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Support\Profile\ProfileStepUpVerificationException;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfilePasswordChangeTest extends TestCase
{
    use CreatesPatrolUsers;
    use EnablesTwoFactorAuth;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        Cache::flush();

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-auth-tests-32chars',
            'auth_security.access_token_ttl_minutes' => 30,
            'auth_security.refresh_cookie_name' => 'refresh_token',
            'auth_security.refresh_cookie_path' => '/api/auth',
            'auth_security.password_min_length' => 12,
            'profile.step_up.max_attempts' => 5,
            'profile.step_up.decay_seconds' => 300,
        ]);
    }

    public function test_unauthenticated_password_change_returns_401(): void
    {
        $this->postJson('/api/profile/password/change', $this->validPayload())
            ->assertUnauthorized();
    }

    public function test_missing_required_fields_return_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Validation failed.');

        $errors = $response->json('data.errors');
        $this->assertArrayHasKey('current_password', $errors);
        $this->assertArrayHasKey('otp', $errors);
        $this->assertArrayHasKey('password', $errors);
        $this->assertArrayHasKey('password_confirmation', $errors);
    }

    public function test_weak_password_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->changePassword($guard, [
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertStatus(422);

        $this->assertArrayHasKey('password', $response->json('data.errors'));
    }

    public function test_wrong_current_password_returns_generic_step_up_failure(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->changePassword($guard, [
            'current_password' => 'wrong-password',
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE)
            ->assertJsonPath('data', null);

        $this->assertTrue(Hash::check('password', $guard->fresh()->password));
    }

    public function test_wrong_otp_returns_same_generic_step_up_failure(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->changePassword($guard, [
            'otp' => '000000',
        ])->assertStatus(422)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);

        $this->changePassword($guard, [
            'current_password' => 'wrong-password',
        ])->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);
    }

    public function test_successful_password_change_updates_credentials_and_metadata(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $guard->forceFill(['profile_version' => 4])->save();
        $this->loginWithOtp($guard);

        $this->changePassword($guard->fresh())
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Password changed successfully. Please sign in again.')
            ->assertJsonPath('data.requires_reauthentication', true)
            ->assertJsonPath('data.revoked_sessions_count', 1);

        $fresh = $guard->fresh();
        $this->assertTrue(Hash::check('newpassword12', $fresh->password));
        $this->assertFalse(Hash::check('password', $fresh->password));
        $this->assertNotNull($fresh->last_password_changed_at);
        $this->assertNotNull($fresh->last_security_changed_at);
        $this->assertSame(5, $fresh->profile_version);
    }

    public function test_old_password_no_longer_works_after_change(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->changePassword($guard)->assertOk();

        $this->postJson('/api/auth/login', [
            'email' => $guard->email,
            'password' => 'password',
        ])->assertUnauthorized();
    }

    public function test_new_password_works_through_login_and_otp_flow(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->changePassword($guard)->assertOk();

        Carbon::setTestNow(now()->addSecond());

        $login = $this->loginWithOtp($guard->fresh(), 'newpassword12');

        $login['login']->assertOk();
        $login['verify']->assertOk()
            ->assertJsonPath('success', true);

        $newAccessToken = $login['verify']->json('data.access_token');

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$newAccessToken)
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.user.id', $guard->getKey());
    }

    public function test_refresh_sessions_are_revoked_including_current_session(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $login = $this->loginWithOtp($guard)['verify'];
        $cookie = $login->getCookie('refresh_token', false);

        $this->assertSame(1, RefreshToken::query()->where('user_id', $guard->id)->whereNull('revoked_at')->count());

        $this->changePassword($guard->fresh())->assertOk();

        $this->assertSame(
            0,
            RefreshToken::query()->where('user_id', $guard->id)->whereNull('revoked_at')->count()
        );

        $this->withUnencryptedCookie('refresh_token', $cookie->getValue())
            ->withCredentials()
            ->postJson('/api/auth/refresh')
            ->assertUnauthorized();
    }

    public function test_old_jwt_cannot_access_profile_after_password_change(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $accessToken = $this->loginWithOtp($guard)['verify']->json('data.access_token');

        $this->changePassword($guard->fresh())->assertOk();

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->getJson('/api/profile')
            ->assertForbidden();
    }

    public function test_password_changed_audit_log_is_written_with_self_profile_source(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->changePassword($guard)->assertOk();

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_PASSWORD_CHANGED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame(AuthAuditService::STATUS_SUCCESS, $audit->status);
        $this->assertSame('self_profile', $audit->metadata['source']);
        $this->assertSame($guard->id, $audit->metadata['target_user_id']);
        $this->assertSame($guard->id, $audit->metadata['changed_by_user_id']);
        $this->assertArrayHasKey('profile_version', $audit->metadata);
        $this->assertArrayHasKey('revoked_count', $audit->metadata);
    }

    public function test_audit_and_response_do_not_expose_secrets(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $guard->forceFill([
            'two_factor_secret' => encrypt($this->testTotpSecret),
        ])->save();

        $response = $this->changePassword($guard->fresh(), [
            'current_password' => 'password',
            'otp' => $this->currentTotp(),
            'password' => 'newpassword12',
            'password_confirmation' => 'newpassword12',
        ])->assertOk();

        $responsePayload = json_encode($response->json());
        $this->assertStringNotContainsString('newpassword12', $responsePayload);
        $this->assertStringNotContainsString($this->testTotpSecret, $responsePayload);
        $this->assertStringNotContainsString('access_token', $responsePayload);
        $this->assertStringNotContainsString('refresh_token', $responsePayload);
        $this->assertStringNotContainsString('two_factor_secret', $responsePayload);

        $audit = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_PASSWORD_CHANGED)
            ->latest('occurred_at')
            ->first();

        $auditPayload = json_encode($audit?->metadata ?? []);
        $this->assertStringNotContainsString('newpassword12', $auditPayload);
        $this->assertStringNotContainsString($this->testTotpSecret, $auditPayload);
        $this->assertStringNotContainsString('current_password', $auditPayload);
        $this->assertStringNotContainsString('password_confirmation', $auditPayload);
    }

    public function test_admin_can_change_own_password(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());

        $this->changePassword($admin)->assertOk();
        $this->assertTrue(Hash::check('newpassword12', $admin->fresh()->password));
    }

    public function test_security_operator_can_change_own_password(): void
    {
        $operator = $this->enableTwoFactor($this->securityOperatorUser());

        $this->changePassword($operator)->assertOk();
        $this->assertTrue(Hash::check('newpassword12', $operator->fresh()->password));
    }

    public function test_guard_can_change_own_password(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->changePassword($guard)->assertOk();
        $this->assertTrue(Hash::check('newpassword12', $guard->fresh()->password));
    }

    public function test_endpoint_only_changes_authenticated_users_password(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $other = $this->enableTwoFactor($this->securityOperatorUser());

        $this->changePassword($guard)->assertOk();

        $this->assertTrue(Hash::check('newpassword12', $guard->fresh()->password));
        $this->assertTrue(Hash::check('password', $other->fresh()->password));
    }

    public function test_response_clears_refresh_cookie_when_possible(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($guard);

        $response = $this->changePassword($guard->fresh())->assertOk();

        $cookie = $response->getCookie('refresh_token', false);
        $this->assertNotNull($cookie);
        $this->assertSame('', $cookie->getValue());
    }

    public function test_repeated_step_up_failures_are_rate_limited(): void
    {
        config(['profile.step_up.max_attempts' => 3]);

        $guard = $this->enableTwoFactor($this->guardUser());

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->changePassword($guard, ['current_password' => 'wrong-password'])
                ->assertStatus(422);
        }

        $this->changePassword($guard, [
            'current_password' => 'password',
            'otp' => $this->currentTotp(),
        ])->assertStatus(429)
            ->assertJsonPath('message', 'Too many step-up verification attempts.')
            ->assertJsonStructure(['data' => ['retry_after_seconds']]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function changePassword(User $user, array $overrides = [])
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/password/change', $this->validPayload($overrides));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function validPayload(array $overrides = []): array
    {
        return array_merge([
            'current_password' => 'password',
            'otp' => $this->currentTotp(),
            'password' => 'newpassword12',
            'password_confirmation' => 'newpassword12',
        ], $overrides);
    }
}
