<?php

namespace Tests\Feature\Profile;

use App\Models\AuthAuditLog;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Support\Profile\InvalidProfileChangeTokenException;
use App\Support\Profile\ProfileStepUpVerificationException;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfileRateLimitHardeningTest extends TestCase
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
            'profile.step_up.max_attempts' => 3,
            'profile.step_up.decay_seconds' => 60,
            'auth_security.password_min_length' => 12,
        ]);
    }

    public function test_step_up_rate_limit_expires_and_allows_legitimate_retry(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $startedAt = now();
        Carbon::setTestNow($startedAt);

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->actingAs($guard, 'api')
                ->postJson('/api/profile/password/change', [
                    'current_password' => 'wrong-password',
                    'otp' => '000000',
                    'password' => 'newpassword12',
                    'password_confirmation' => 'newpassword12',
                ])
                ->assertStatus(422);
        }

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many step-up verification attempts.')
            ->assertJsonStructure(['data' => ['retry_after_seconds']]);

        Carbon::setTestNow($startedAt->copy()->addSeconds(61));

        $this->actingAs($guard->fresh(), 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])
            ->assertOk();
    }

    public function test_email_confirm_invalid_token_attempts_are_rate_limited(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->actingAs($guard, 'api')
                ->postJson('/api/profile/email/confirm', ['token' => 'bad-token-'.$attempt])
                ->assertStatus(422)
                ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);
        }

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/email/confirm', ['token' => 'bad-token-final'])
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many step-up verification attempts.')
            ->assertJsonStructure(['data' => ['retry_after_seconds']]);
    }

    public function test_two_factor_verify_invalid_token_attempts_are_rate_limited(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->actingAs($guard, 'api')
                ->postJson('/api/profile/2fa/reconfigure/verify', [
                    'two_factor_reconfigure_token' => 'invalid-token-'.$attempt,
                    'otp' => '000000',
                ])
                ->assertStatus(422)
                ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);
        }

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/2fa/reconfigure/verify', [
                'two_factor_reconfigure_token' => 'invalid-token-final',
                'otp' => '000000',
            ])
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many step-up verification attempts.')
            ->assertJsonStructure(['data' => ['retry_after_seconds']]);

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_FAILED)
            ->where('metadata->reason', 'rate_limited')
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame(AuthAuditService::STATUS_FAILURE, $audit->status);
        $this->assertSame('rate_limited', $audit->metadata['reason']);
        $this->assertNull($audit->email);
        $payload = json_encode($audit->metadata);
        $this->assertStringNotContainsString('invalid-token-final', $payload);
        $this->assertStringNotContainsString('000000', $payload);
    }

    public function test_two_factor_verify_invalid_new_otp_lockout_writes_rate_limited_audit(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->actingAs($guard, 'api')
            ->postJson('/api/profile/2fa/reconfigure/start', [
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
            ])
            ->assertOk();

        $plainToken = $start->json('data.two_factor_reconfigure_token');
        $manualKey = $start->json('data.manual_key');

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->actingAs($guard, 'api')
                ->postJson('/api/profile/2fa/reconfigure/verify', [
                    'two_factor_reconfigure_token' => $plainToken,
                    'otp' => '000000',
                ])
                ->assertStatus(422);
        }

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/2fa/reconfigure/verify', [
                'two_factor_reconfigure_token' => $plainToken,
                'otp' => '000000',
            ])
            ->assertStatus(429);

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_FAILED)
            ->where('metadata->reason', 'rate_limited')
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('rate_limited', $audit->metadata['reason']);
        $payload = json_encode($audit->metadata);
        $this->assertStringNotContainsString($plainToken, $payload);
        $this->assertStringNotContainsString($manualKey, $payload);
        $this->assertStringNotContainsString($this->testTotpSecret, $payload);
        $this->assertStringNotContainsString('000000', $payload);
    }

    public function test_rate_limit_responses_do_not_reveal_failure_cause(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->actingAs($guard, 'api')
                ->postJson('/api/profile/password/change', [
                    'current_password' => 'wrong-password',
                    'otp' => '000000',
                    'password' => 'newpassword12',
                    'password_confirmation' => 'newpassword12',
                ])
                ->assertStatus(422)
                ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);
        }

        $response = $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])
            ->assertStatus(429);

        $payload = json_encode($response->json());
        $this->assertStringNotContainsString('password', strtolower($payload));
        $this->assertStringNotContainsString('otp', strtolower($payload));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }
}
