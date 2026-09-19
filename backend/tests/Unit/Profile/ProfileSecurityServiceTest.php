<?php

namespace Tests\Unit\Profile;

use App\Models\ProfileChangeToken;
use App\Models\User;
use App\Services\Profile\ProfileSecurityService;
use App\Services\Profile\ProfileStepUpRateLimiter;
use App\Support\Profile\InvalidProfileChangeTokenException;
use App\Support\Profile\ProfileStepUpRateLimitedException;
use App\Support\Profile\ProfileStepUpVerificationException;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfileSecurityServiceTest extends TestCase
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
            'profile.change_tokens.ttl_minutes' => 10,
            'profile.step_up.max_attempts' => 5,
            'profile.step_up.decay_seconds' => 300,
        ]);

        Cache::flush();
        $this->service = app(ProfileSecurityService::class);
    }

    public function test_verify_step_up_succeeds_with_correct_password_and_totp(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $request = Request::create('/api/profile/password/change', 'POST');

        $this->service->verifyStepUp($user, 'password', $this->currentTotp(), $request);

        $this->assertTrue(true);
    }

    public function test_verify_step_up_fails_with_wrong_password(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());

        try {
            $this->service->verifyStepUp($user, 'wrong-password', $this->currentTotp());
            $this->fail('Expected ProfileStepUpVerificationException.');
        } catch (ProfileStepUpVerificationException $exception) {
            $this->assertSame(ProfileStepUpVerificationException::MESSAGE, $exception->getMessage());
        }
    }

    public function test_verify_step_up_fails_with_wrong_totp(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());

        try {
            $this->service->verifyStepUp($user, 'password', '000000');
            $this->fail('Expected ProfileStepUpVerificationException.');
        } catch (ProfileStepUpVerificationException $exception) {
            $this->assertSame(ProfileStepUpVerificationException::MESSAGE, $exception->getMessage());
        }
    }

    public function test_wrong_password_and_wrong_totp_produce_same_failure_message(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());

        $passwordFailure = null;
        $otpFailure = null;

        try {
            $this->service->verifyStepUp($user, 'wrong-password', $this->currentTotp());
        } catch (ProfileStepUpVerificationException $exception) {
            $passwordFailure = $exception->getMessage();
        }

        try {
            $this->service->verifyStepUp($user, 'password', '000000');
        } catch (ProfileStepUpVerificationException $exception) {
            $otpFailure = $exception->getMessage();
        }

        $this->assertSame(ProfileStepUpVerificationException::MESSAGE, $passwordFailure);
        $this->assertSame(ProfileStepUpVerificationException::MESSAGE, $otpFailure);
        $this->assertSame($passwordFailure, $otpFailure);
    }

    public function test_verify_step_up_fails_when_two_factor_is_incomplete(): void
    {
        $user = User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'two_factor_enabled' => false,
            'setup_required' => false,
        ]);

        $this->expectException(ProfileStepUpVerificationException::class);
        $this->expectExceptionMessage(ProfileStepUpVerificationException::MESSAGE);

        $this->service->verifyStepUp($user, 'password', '000000');
    }

    public function test_repeated_failed_step_up_attempts_are_rate_limited(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $request = Request::create('/api/profile/password/change', 'POST');

        for ($attempt = 0; $attempt < 5; $attempt++) {
            try {
                $this->service->verifyStepUp($user, 'wrong-password', '000000', $request);
            } catch (ProfileStepUpVerificationException) {
            }
        }

        $this->expectException(ProfileStepUpRateLimitedException::class);

        $this->service->verifyStepUp($user, 'password', $this->currentTotp(), $request);
    }

    public function test_successful_step_up_clears_failed_attempt_state(): void
    {
        $user = $this->enableTwoFactor($this->guardUser());
        $request = Request::create('/api/profile/password/change', 'POST');
        $limiter = app(ProfileStepUpRateLimiter::class);

        try {
            $this->service->verifyStepUp($user, 'wrong-password', '000000', $request);
        } catch (ProfileStepUpVerificationException) {
        }

        $this->service->verifyStepUp($user, 'password', $this->currentTotp(), $request);

        for ($attempt = 0; $attempt < 4; $attempt++) {
            try {
                $this->service->verifyStepUp($user, 'wrong-password', '000000', $request);
            } catch (ProfileStepUpVerificationException) {
            }
        }

        $this->assertFalse($limiter->isLocked($user, $request));

        $this->service->verifyStepUp($user, 'password', $this->currentTotp(), $request);
    }

    public function test_create_change_token_stores_hash_only(): void
    {
        $user = $this->guardUser();
        $request = Request::create('/api/profile/email/start', 'POST', server: [
            'REMOTE_ADDR' => '203.0.113.10',
            'HTTP_USER_AGENT' => 'ProfileTestAgent/1.0',
        ]);

        $result = $this->service->createChangeToken(
            $user,
            ProfileChangeToken::TYPE_EMAIL_CHANGE,
            ['pending_email' => 'new@example.com'],
            $request,
        );

        $this->assertNotSame('', $result['token']);
        $this->assertSame(
            ProfileChangeToken::hashToken($result['token']),
            $result['model']->token_hash
        );
        $this->assertDatabaseHas('profile_change_tokens', [
            'id' => $result['model']->id,
            'user_id' => $user->getKey(),
            'type' => ProfileChangeToken::TYPE_EMAIL_CHANGE,
            'ip_address' => '203.0.113.10',
            'user_agent' => 'ProfileTestAgent/1.0',
        ]);
        $this->assertDatabaseMissing('profile_change_tokens', [
            'token_hash' => $result['token'],
        ]);
        $this->assertSame(['pending_email' => 'new@example.com'], $result['model']->pending_payload);
        $this->assertTrue($result['model']->expires_at->greaterThan(now()));
    }

    public function test_validate_change_token_returns_active_token(): void
    {
        $user = $this->guardUser();
        $created = $this->service->createChangeToken($user, ProfileChangeToken::TYPE_EMAIL_CHANGE);

        $validated = $this->service->validateChangeToken($created['token'], ProfileChangeToken::TYPE_EMAIL_CHANGE);

        $this->assertSame($created['model']->id, $validated->id);
    }

    public function test_validate_change_token_rejects_expired_token(): void
    {
        $user = $this->guardUser();
        $created = $this->service->createChangeToken($user, ProfileChangeToken::TYPE_EMAIL_CHANGE);

        Carbon::setTestNow(now()->addMinutes(11));

        $this->expectException(InvalidProfileChangeTokenException::class);

        $this->service->validateChangeToken($created['token'], ProfileChangeToken::TYPE_EMAIL_CHANGE);
    }

    public function test_validate_change_token_rejects_used_token(): void
    {
        $user = $this->guardUser();
        $created = $this->service->createChangeToken($user, ProfileChangeToken::TYPE_EMAIL_CHANGE);
        $this->service->consumeChangeToken($created['token'], ProfileChangeToken::TYPE_EMAIL_CHANGE);

        $this->expectException(InvalidProfileChangeTokenException::class);

        $this->service->validateChangeToken($created['token'], ProfileChangeToken::TYPE_EMAIL_CHANGE);
    }

    public function test_validate_change_token_rejects_wrong_type(): void
    {
        $user = $this->guardUser();
        $created = $this->service->createChangeToken($user, ProfileChangeToken::TYPE_EMAIL_CHANGE);

        $this->expectException(InvalidProfileChangeTokenException::class);

        $this->service->validateChangeToken($created['token'], ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE);
    }

    public function test_consume_change_token_marks_used_at(): void
    {
        $user = $this->guardUser();
        $created = $this->service->createChangeToken($user, ProfileChangeToken::TYPE_EMAIL_CHANGE);

        $consumed = $this->service->consumeChangeToken($created['token'], ProfileChangeToken::TYPE_EMAIL_CHANGE);

        $this->assertNotNull($consumed->used_at);
        $this->assertTrue($consumed->fresh()->isUsed());
    }

    public function test_change_token_cannot_be_consumed_twice(): void
    {
        $user = $this->guardUser();
        $created = $this->service->createChangeToken($user, ProfileChangeToken::TYPE_EMAIL_CHANGE);

        $this->service->consumeChangeToken($created['token'], ProfileChangeToken::TYPE_EMAIL_CHANGE);

        $this->expectException(InvalidProfileChangeTokenException::class);

        $this->service->consumeChangeToken($created['token'], ProfileChangeToken::TYPE_EMAIL_CHANGE);
    }

    public function test_consume_change_token_rejects_blank_plain_token(): void
    {
        $this->expectException(InvalidProfileChangeTokenException::class);

        $this->service->consumeChangeToken('', ProfileChangeToken::TYPE_EMAIL_CHANGE);
    }

    public function test_create_change_token_rejects_unsupported_type(): void
    {
        $user = $this->guardUser();

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Unsupported profile change token type.');

        $this->service->createChangeToken($user, 'password_change');
    }

    public function test_pending_payload_remains_encrypted_at_rest(): void
    {
        $user = $this->guardUser();
        $created = $this->service->createChangeToken(
            $user,
            ProfileChangeToken::TYPE_EMAIL_CHANGE,
            ['pending_email' => 'pending.user@example.com'],
        );

        $this->assertSame(
            ['pending_email' => 'pending.user@example.com'],
            $created['model']->fresh()->pending_payload
        );

        $rawPayload = DB::table('profile_change_tokens')
            ->where('id', $created['model']->id)
            ->value('pending_payload');

        $this->assertIsString($rawPayload);
        $this->assertStringNotContainsString('pending.user@example.com', $rawPayload);
    }

    public function test_revoke_sessions_after_sensitive_change_updates_timestamp_and_revokes_refresh_tokens(): void
    {
        Carbon::setTestNow('2026-06-29 12:00:00');

        $user = $this->enableTwoFactor($this->guardUser());
        $this->loginWithOtp($user);

        $this->assertSame(1, $user->refreshTokens()->whereNull('revoked_at')->count());

        $result = $this->service->revokeSessionsAfterSensitiveChange($user);

        $this->assertSame(1, $result['revoked_count']);
        $this->assertTrue($result['user']->last_security_changed_at->equalTo(Carbon::parse('2026-06-29 12:00:00')));
        $this->assertSame(
            0,
            $user->refreshTokens()->whereNull('revoked_at')->count()
        );
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }
}
