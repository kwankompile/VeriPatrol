<?php

namespace Tests\Feature\Profile;

use App\Models\AuthAuditLog;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Support\Profile\ProfileStepUpVerificationException;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfileAuditHardeningTest extends TestCase
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
            'profile.step_up.max_attempts' => 5,
            'profile.step_up.decay_seconds' => 300,
            'auth_security.password_min_length' => 12,
        ]);
    }

    public function test_password_change_failure_writes_password_change_failed_audit(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'wrong-password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_PASSWORD_CHANGE_FAILED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame(AuthAuditService::STATUS_FAILURE, $audit->status);
        $this->assertSame('step_up_failed', $audit->metadata['reason']);
        $this->assertSame('self_profile', $audit->metadata['source']);
        $this->assertNull($audit->email);
        $this->assertStringNotContainsString('wrong-password', json_encode($audit->metadata));
    }

    public function test_password_change_rate_limit_writes_password_change_failed_audit(): void
    {
        config(['profile.step_up.max_attempts' => 2]);

        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'wrong-password',
                'otp' => '000000',
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])->assertStatus(422);

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'wrong-password',
                'otp' => '000000',
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])->assertStatus(422);

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])->assertStatus(429);

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_PASSWORD_CHANGE_FAILED)
            ->where('metadata->reason', 'step_up_rate_limited')
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('step_up_rate_limited', $audit->metadata['reason']);
    }

    public function test_email_start_failure_writes_email_change_failed_audit(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/email/start', [
                'current_password' => 'wrong-password',
                'otp' => $this->currentTotp(),
                'new_email' => 'changed.user@example.com',
            ])
            ->assertStatus(422);

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_EMAIL_CHANGE_FAILED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('step_up_failed', $audit->metadata['reason']);
        $this->assertNull($audit->email);
    }

    public function test_email_confirm_invalid_token_writes_email_change_failed_audit(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/email/confirm', ['token' => 'invalid-token-value'])
            ->assertStatus(422);

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_EMAIL_CHANGE_FAILED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('invalid_token', $audit->metadata['reason']);
        $this->assertStringNotContainsString('invalid-token-value', json_encode($audit->metadata));
    }

    public function test_profile_audit_captures_ip_address_and_user_agent(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->withServerVariables([
                'REMOTE_ADDR' => '203.0.113.50',
                'HTTP_USER_AGENT' => 'ProfileAuditTestAgent/1.0',
            ])
            ->postJson('/api/profile/password/change', [
                'current_password' => 'wrong-password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])
            ->assertStatus(422);

        $audit = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_PASSWORD_CHANGE_FAILED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('203.0.113.50', $audit->ip_address);
        $this->assertSame('ProfileAuditTestAgent/1.0', $audit->user_agent);
    }

    public function test_profile_success_audit_captures_ip_address_and_user_agent(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->withServerVariables([
                'REMOTE_ADDR' => '198.51.100.10',
                'HTTP_USER_AGENT' => 'ProfileSuccessAuditAgent/2.0',
            ])
            ->patchJson('/api/profile', ['phone' => '+60123456789'])
            ->assertOk();

        $audit = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_PROFILE_UPDATED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('198.51.100.10', $audit->ip_address);
        $this->assertSame('ProfileSuccessAuditAgent/2.0', $audit->user_agent);
    }

    public function test_profile_audit_metadata_sanitizer_rejects_secret_keys(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $service = app(AuthAuditService::class);

        $audit = $service->record(
            AuthAuditService::EVENT_PASSWORD_CHANGE_FAILED,
            AuthAuditService::STATUS_FAILURE,
            user: $guard,
            metadata: [
                'source' => 'self_profile',
                'target_user_id' => $guard->getKey(),
                'reason' => 'step_up_failed',
                'password' => 'secret-password',
                'otp' => '123456',
                'two_factor_secret' => $this->testTotpSecret,
                'token' => 'plain-token',
                'refresh_token' => 'refresh-value',
                'otpauth_uri' => 'otpauth://totp/Test',
            ],
            omitTopLevelEmail: true,
        );

        $metadata = $audit->fresh()->metadata ?? [];
        $this->assertSame('self_profile', $metadata['source']);
        $this->assertSame('step_up_failed', $metadata['reason']);
        $this->assertArrayNotHasKey('password', $metadata);
        $this->assertArrayNotHasKey('otp', $metadata);
        $this->assertArrayNotHasKey('two_factor_secret', $metadata);
        $this->assertArrayNotHasKey('token', $metadata);
        $this->assertArrayNotHasKey('refresh_token', $metadata);
        $this->assertArrayNotHasKey('otpauth_uri', $metadata);
    }
}
