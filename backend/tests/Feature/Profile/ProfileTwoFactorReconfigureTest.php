<?php

namespace Tests\Feature\Profile;

use App\Models\AuthAuditLog;
use App\Models\ProfileChangeToken;
use App\Models\RefreshToken;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Services\Auth\TwoFactorService;
use App\Support\Profile\InvalidProfileChangeTokenException;
use App\Support\Profile\ProfileStepUpVerificationException;
use App\Support\Profile\ProfileTwoFactorReconfigureVerificationException;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfileTwoFactorReconfigureTest extends TestCase
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
            'profile.change_tokens.ttl_minutes' => 10,
            'profile.step_up.max_attempts' => 5,
            'profile.step_up.decay_seconds' => 300,
        ]);
    }

    public function test_unauthenticated_start_returns_401(): void
    {
        $this->postJson('/api/profile/2fa/reconfigure/start', $this->validStartPayload())
            ->assertUnauthorized();
    }

    public function test_unauthenticated_verify_returns_401(): void
    {
        $this->postJson('/api/profile/2fa/reconfigure/verify', [
            'two_factor_reconfigure_token' => 'abc',
            'otp' => '123456',
        ])->assertUnauthorized();
    }

    public function test_start_requires_current_password_and_otp(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->actingAs($guard, 'api')
            ->postJson('/api/profile/2fa/reconfigure/start', [])
            ->assertStatus(422);

        $errors = $response->json('data.errors');
        $this->assertArrayHasKey('current_password', $errors);
        $this->assertArrayHasKey('otp', $errors);
    }

    public function test_verify_requires_two_factor_reconfigure_token_and_otp(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->actingAs($guard, 'api')
            ->postJson('/api/profile/2fa/reconfigure/verify', [])
            ->assertStatus(422);

        $errors = $response->json('data.errors');
        $this->assertArrayHasKey('two_factor_reconfigure_token', $errors);
        $this->assertArrayHasKey('otp', $errors);
    }

    public function test_start_rejects_wrong_current_password_with_generic_step_up_message(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startReconfigure($guard, ['current_password' => 'wrong-password'])
            ->assertStatus(422)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);
    }

    public function test_start_rejects_wrong_current_otp_with_same_generic_step_up_message(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startReconfigure($guard, ['otp' => '000000'])
            ->assertStatus(422)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);

        $this->startReconfigure($guard, ['current_password' => 'wrong-password'])
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);
    }

    public function test_repeated_failed_start_attempts_are_rate_limited(): void
    {
        config(['profile.step_up.max_attempts' => 3]);

        $guard = $this->enableTwoFactor($this->guardUser());

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->startReconfigure($guard, ['current_password' => 'wrong-password'])
                ->assertStatus(422);
        }

        $this->startReconfigure($guard)
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many step-up verification attempts.');
    }

    public function test_user_without_valid_two_factor_setup_cannot_start_reconfiguration(): void
    {
        $guard = $this->guardUser();

        $this->startReconfigure($guard)
            ->assertStatus(422)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);

        $this->assertDatabaseCount('profile_change_tokens', 0);
    }

    public function test_start_returns_reconfigure_token_manual_key_otpauth_uri_and_expires_in(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->startReconfigure($guard)
            ->assertOk()
            ->assertJsonPath('message', 'Two-factor reconfiguration started.')
            ->assertJsonStructure([
                'data' => [
                    'two_factor_reconfigure_token',
                    'manual_key',
                    'otpauth_uri',
                    'expires_in',
                ],
            ]);

        $this->assertSame(600, $response->json('data.expires_in'));
        $this->assertStringStartsWith('otpauth://totp/', $response->json('data.otpauth_uri'));
        $this->assertNotEmpty($response->json('data.manual_key'));
        $this->assertNotEmpty($response->json('data.two_factor_reconfigure_token'));
    }

    public function test_start_creates_exactly_one_two_factor_reconfigure_token(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startReconfigure($guard)->assertOk();

        $this->assertDatabaseCount('profile_change_tokens', 1);

        $tokenRow = ProfileChangeToken::query()->firstOrFail();
        $this->assertSame(ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE, $tokenRow->type);
        $this->assertNull($tokenRow->used_at);
    }

    public function test_token_hash_is_stored_not_plain_token(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->startReconfigure($guard)->assertOk();
        $plainToken = $response->json('data.two_factor_reconfigure_token');

        $tokenRow = ProfileChangeToken::query()->firstOrFail();
        $this->assertNotSame($plainToken, $tokenRow->token_hash);
        $this->assertSame(ProfileChangeToken::hashToken($plainToken), $tokenRow->token_hash);
        $this->assertDatabaseMissing('profile_change_tokens', [
            'token_hash' => $plainToken,
        ]);
    }

    public function test_pending_temporary_secret_is_encrypted_at_rest(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->startReconfigure($guard)->assertOk();
        $manualKey = $response->json('data.manual_key');

        $tokenRow = ProfileChangeToken::query()->firstOrFail();
        $this->assertSame($manualKey, $tokenRow->fresh()->pending_payload['pending_secret'] ?? null);

        $rawPayload = DB::table('profile_change_tokens')
            ->where('id', $tokenRow->id)
            ->value('pending_payload');

        $this->assertIsString($rawPayload);
        $this->assertStringNotContainsString($manualKey, $rawPayload);
    }

    public function test_old_two_factor_secret_remains_unchanged_after_start(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $originalSecret = $guard->fresh()->two_factor_secret;

        $this->startReconfigure($guard)->assertOk();

        $this->assertSame($originalSecret, $guard->fresh()->two_factor_secret);
    }

    public function test_two_factor_enabled_remains_true_after_start(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startReconfigure($guard)->assertOk();

        $this->assertTrue($guard->fresh()->two_factor_enabled);
    }

    public function test_new_start_invalidates_prior_active_reconfiguration_tokens(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $first = $this->startReconfigure($guard)->assertOk();
        $firstToken = $first->json('data.two_factor_reconfigure_token');

        $second = $this->startReconfigure($guard->fresh())->assertOk();
        $secondToken = $second->json('data.two_factor_reconfigure_token');

        $this->assertSame(
            1,
            ProfileChangeToken::query()
                ->where('user_id', $guard->id)
                ->where('type', ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE)
                ->active()
                ->count()
        );

        Carbon::setTestNow(now()->addSecond());

        $this->verifyReconfigure($guard->fresh(), $firstToken, '000000')
            ->assertStatus(422)
            ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);

        $newSecret = $second->json('data.manual_key');
        $newOtp = app(TwoFactorService::class)->generateTotp($newSecret);

        $this->verifyReconfigure($guard->fresh(), $secondToken, $newOtp)
            ->assertOk();
    }

    public function test_sequential_starts_leave_only_one_active_reconfigure_token(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startReconfigure($guard)->assertOk();
        $this->startReconfigure($guard->fresh())->assertOk();
        $this->startReconfigure($guard->fresh())->assertOk();

        $this->assertSame(
            1,
            ProfileChangeToken::query()
                ->where('user_id', $guard->id)
                ->where('type', ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE)
                ->active()
                ->count()
        );

        $this->assertSame(
            2,
            ProfileChangeToken::query()
                ->where('user_id', $guard->id)
                ->where('type', ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE)
                ->whereNotNull('used_at')
                ->count()
        );

        $this->assertDatabaseCount('profile_change_tokens', 3);
    }

    public function test_successful_verify_invalidates_other_active_reconfigure_tokens(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');
        $newSecret = $start->json('data.manual_key');

        $orphanPlainToken = bin2hex(random_bytes(32));
        ProfileChangeToken::factory()
            ->twoFactorReconfigure()
            ->withPendingPayload([
                'pending_secret' => 'ORPHANSECRETFORRECONFIGURETEST1',
                'requested_at' => now()->toIso8601String(),
            ])
            ->create([
                'user_id' => $guard->id,
                'token_hash' => ProfileChangeToken::hashToken($orphanPlainToken),
            ]);

        $this->assertSame(
            2,
            ProfileChangeToken::query()
                ->where('user_id', $guard->id)
                ->where('type', ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE)
                ->active()
                ->count()
        );

        Carbon::setTestNow(now()->addSecond());

        $newOtp = app(TwoFactorService::class)->generateTotp($newSecret);
        $this->verifyReconfigure($guard->fresh(), $plainToken, $newOtp)->assertOk();

        $this->assertSame(
            0,
            ProfileChangeToken::query()
                ->where('user_id', $guard->id)
                ->where('type', ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE)
                ->active()
                ->count()
        );
    }

    public function test_start_step_up_failure_writes_reconfigure_failed_audit(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startReconfigure($guard, ['current_password' => 'wrong-password'])
            ->assertStatus(422);

        $failure = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_FAILED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($failure);
        $this->assertSame('step_up_failed', $failure->metadata['reason']);
        $this->assertNull($failure->email);
        $this->assertStringNotContainsString('wrong-password', json_encode($failure->metadata));
    }

    public function test_start_rate_limit_writes_reconfigure_failed_audit(): void
    {
        config(['profile.step_up.max_attempts' => 2]);

        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startReconfigure($guard, ['current_password' => 'wrong-password'])->assertStatus(422);
        $this->startReconfigure($guard, ['current_password' => 'wrong-password'])->assertStatus(422);
        $this->startReconfigure($guard)->assertStatus(429);

        $failure = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_FAILED)
            ->where('metadata->reason', 'step_up_rate_limited')
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($failure);
        $this->assertSame('step_up_rate_limited', $failure->metadata['reason']);
    }

    public function test_user_without_two_factor_setup_writes_missing_valid_2fa_setup_audit(): void
    {
        $guard = $this->guardUser();

        $this->startReconfigure($guard)
            ->assertStatus(422)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);

        $failures = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_FAILED)
            ->where('user_id', $guard->id)
            ->get();

        $this->assertCount(1, $failures);
        $this->assertSame('missing_valid_2fa_setup', $failures->first()->metadata['reason']);
    }

    public function test_security_snapshot_rejects_changed_security_state(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $service = app(\App\Services\Profile\ProfileTwoFactorReconfigureService::class);
        $reflection = new \ReflectionClass($service);

        $capture = $reflection->getMethod('captureSecuritySnapshot');
        $capture->setAccessible(true);
        $matches = $reflection->getMethod('securitySnapshotMatches');
        $matches->setAccessible(true);

        $snapshot = $capture->invoke($service, $guard);

        $guard->forceFill(['last_security_changed_at' => now()])->save();

        $this->assertFalse($matches->invoke($service, $guard->fresh(), $snapshot));
    }

    public function test_start_writes_reconfigure_started_audit_with_safe_metadata(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->startReconfigure($guard)->assertOk();

        $audit = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_STARTED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('self_profile', $audit->metadata['source']);
        $this->assertNull($audit->email);
        $this->assertArrayHasKey('profile_version', $audit->metadata);
        $this->assertArrayHasKey('token_expires_at', $audit->metadata);

        $payload = json_encode($audit->metadata);
        $this->assertStringNotContainsString($response->json('data.manual_key'), $payload);
        $this->assertStringNotContainsString($response->json('data.two_factor_reconfigure_token'), $payload);
        $this->assertStringNotContainsString($this->testTotpSecret, $payload);
    }

    public function test_invalid_token_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->verifyReconfigure($guard, 'not-a-valid-token', '123456')
            ->assertStatus(422)
            ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);
    }

    public function test_expired_token_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');
        $originalSecret = $guard->fresh()->two_factor_secret;

        Carbon::setTestNow(now()->addMinutes(11));

        $this->verifyReconfigure($guard->fresh(), $plainToken, '123456')
            ->assertStatus(422)
            ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);

        $this->assertSame($originalSecret, $guard->fresh()->two_factor_secret);
    }

    public function test_used_token_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');
        $newSecret = $start->json('data.manual_key');
        $newOtp = app(TwoFactorService::class)->generateTotp($newSecret);

        Carbon::setTestNow(now()->addSecond());

        $login = $this->loginWithOtp($guard->fresh(), 'password');
        $accessToken = $login['verify']->json('data.access_token');

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->postJson('/api/profile/2fa/reconfigure/verify', [
                'two_factor_reconfigure_token' => $plainToken,
                'otp' => $newOtp,
            ])
            ->assertOk();

        Carbon::setTestNow(now()->addSecond());
        $secondLogin = $this->loginWithOtpUsingSecret($guard->fresh(), $newSecret, 'password');

        $this->withHeader('Authorization', 'Bearer '.$secondLogin['verify']->json('data.access_token'))
            ->postJson('/api/profile/2fa/reconfigure/verify', [
                'two_factor_reconfigure_token' => $plainToken,
                'otp' => $newOtp,
            ])
            ->assertStatus(422);
    }

    public function test_wrong_token_type_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $plainToken = bin2hex(random_bytes(32));

        ProfileChangeToken::factory()->emailChange()->create([
            'user_id' => $guard->id,
            'token_hash' => ProfileChangeToken::hashToken($plainToken),
        ]);

        $this->verifyReconfigure($guard, $plainToken, '123456')
            ->assertStatus(422)
            ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);
    }

    public function test_token_belonging_to_another_user_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $other = $this->enableTwoFactor($this->securityOperatorUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');

        $this->verifyReconfigure($other, $plainToken, '123456')
            ->assertStatus(422);

        $this->assertTrue($guard->fresh()->two_factor_enabled);
        $this->assertNull(
            ProfileChangeToken::query()
                ->where('user_id', $guard->id)
                ->where('type', ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE)
                ->value('used_at')
        );
    }

    public function test_invalid_new_otp_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');

        $this->verifyReconfigure($guard, $plainToken, '000000')
            ->assertStatus(422)
            ->assertJsonPath('message', ProfileTwoFactorReconfigureVerificationException::MESSAGE);
    }

    public function test_invalid_new_otp_does_not_consume_token(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');
        $newSecret = $start->json('data.manual_key');

        $this->verifyReconfigure($guard, $plainToken, '000000')->assertStatus(422);

        $tokenRow = ProfileChangeToken::query()
            ->where('token_hash', ProfileChangeToken::hashToken($plainToken))
            ->firstOrFail();

        $this->assertNull($tokenRow->used_at);

        $newOtp = app(TwoFactorService::class)->generateTotp($newSecret);

        Carbon::setTestNow(now()->addSecond());

        $this->verifyReconfigure($guard->fresh(), $plainToken, $newOtp)->assertOk();
    }

    public function test_repeated_invalid_new_otp_attempts_are_rate_limited(): void
    {
        config(['profile.step_up.max_attempts' => 3]);

        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->verifyReconfigure($guard, $plainToken, '000000')
                ->assertStatus(422);
        }

        $this->verifyReconfigure($guard, $plainToken, '000000')
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many step-up verification attempts.');
    }

    public function test_failure_audit_logs_do_not_expose_secrets(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');
        $manualKey = $start->json('data.manual_key');

        $this->verifyReconfigure($guard, $plainToken, '000000')->assertStatus(422);

        $failure = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURE_FAILED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($failure);
        $this->assertSame('invalid_new_otp', $failure->metadata['reason']);

        $payload = json_encode($failure->metadata);
        $this->assertStringNotContainsString($plainToken, $payload);
        $this->assertStringNotContainsString($manualKey, $payload);
        $this->assertStringNotContainsString($this->testTotpSecret, $payload);
        $this->assertStringNotContainsString('000000', $payload);
    }

    public function test_verify_success_replaces_secret_and_updates_metadata(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $guard->forceFill([
            'profile_version' => 2,
            'last_security_changed_at' => null,
        ])->save();

        $originalEncryptedSecret = $guard->fresh()->two_factor_secret;
        $originalConfirmedAt = $guard->fresh()->two_factor_confirmed_at;

        $login = $this->loginWithOtp($guard)['verify'];
        $oldAccessToken = $login->json('data.access_token');
        $oldRefreshCookie = $login->getCookie('refresh_token', false);

        $start = $this->withHeader('Authorization', 'Bearer '.$oldAccessToken)
            ->postJson('/api/profile/2fa/reconfigure/start', $this->validStartPayload())
            ->assertOk();

        $plainToken = $start->json('data.two_factor_reconfigure_token');
        $newSecret = $start->json('data.manual_key');
        $newOtp = app(TwoFactorService::class)->generateTotp($newSecret);

        Carbon::setTestNow(now()->addSecond());

        $response = $this->withHeader('Authorization', 'Bearer '.$oldAccessToken)
            ->postJson('/api/profile/2fa/reconfigure/verify', [
                'two_factor_reconfigure_token' => $plainToken,
                'otp' => $newOtp,
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Two-factor authentication reconfigured successfully. Please sign in again.')
            ->assertJsonPath('data.requires_reauthentication', true)
            ->assertJsonPath('data.revoked_sessions_count', 1);

        $cookie = $response->getCookie('refresh_token', false);
        $this->assertNotNull($cookie);
        $this->assertSame('', $cookie->getValue());

        $fresh = $guard->fresh();
        $this->assertNotSame($originalEncryptedSecret, $fresh->two_factor_secret);
        $this->assertTrue($fresh->two_factor_enabled);
        $this->assertNotNull($fresh->two_factor_confirmed_at);
        $this->assertTrue($fresh->two_factor_confirmed_at->greaterThan($originalConfirmedAt));
        $this->assertNotNull($fresh->last_security_changed_at);
        $this->assertSame(3, $fresh->profile_version);

        $tokenRow = ProfileChangeToken::query()
            ->where('token_hash', ProfileChangeToken::hashToken($plainToken))
            ->firstOrFail();
        $this->assertNotNull($tokenRow->used_at);

        $this->assertSame(
            0,
            RefreshToken::query()->where('user_id', $guard->id)->whereNull('revoked_at')->count()
        );

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$oldAccessToken)
            ->getJson('/api/profile')
            ->assertForbidden();

        $this->withUnencryptedCookie('refresh_token', $oldRefreshCookie->getValue())
            ->withCredentials()
            ->postJson('/api/auth/refresh')
            ->assertUnauthorized();

        $oldOtpLogin = $this->postJson('/api/auth/login', [
            'email' => $guard->email,
            'password' => 'password',
        ])->assertOk();

        $this->postJson('/api/auth/otp/verify', [
            'login_challenge_id' => $oldOtpLogin->json('data.login_challenge_id'),
            'otp' => $this->currentTotp(),
        ])->assertStatus(422);

        Carbon::setTestNow(now()->addSecond());

        $newLogin = $this->loginWithOtpUsingSecret($fresh, $newSecret, 'password');
        $newLogin['login']->assertOk();
        $newLogin['verify']->assertOk();

        $newAccessToken = $newLogin['verify']->json('data.access_token');

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$newAccessToken)
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.user.two_factor_enabled', true);
    }

    public function test_verify_writes_reconfigured_audit_with_safe_metadata(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $start = $this->startReconfigure($guard)->assertOk();
        $plainToken = $start->json('data.two_factor_reconfigure_token');
        $newSecret = $start->json('data.manual_key');
        $newOtp = app(TwoFactorService::class)->generateTotp($newSecret);

        Carbon::setTestNow(now()->addSecond());

        $this->verifyReconfigure($guard->fresh(), $plainToken, $newOtp)->assertOk();

        $audit = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_TWO_FACTOR_RECONFIGURED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('self_profile', $audit->metadata['source']);
        $this->assertNull($audit->email);
        $this->assertArrayHasKey('profile_version', $audit->metadata);
        $this->assertArrayHasKey('revoked_count', $audit->metadata);

        $payload = json_encode($audit->metadata);
        $this->assertStringNotContainsString($plainToken, $payload);
        $this->assertStringNotContainsString($newSecret, $payload);
        $this->assertStringNotContainsString($this->testTotpSecret, $payload);
    }

    public function test_no_user_disable_two_factor_route_exists(): void
    {
        $profileRoutes = collect(Route::getRoutes())
            ->filter(fn ($route) => str_starts_with((string) $route->uri(), 'profile'))
            ->map(fn ($route) => $route->uri().'|'.implode(',', $route->methods()))
            ->values()
            ->all();

        foreach ($profileRoutes as $routeSignature) {
            $this->assertStringNotContainsString('disable', strtolower($routeSignature));
        }

        $this->assertNull(Route::getRoutes()->getByName('profile.2fa.disable'));
        $this->assertNull(Route::getRoutes()->getByName('profile.2fa.reconfigure.disable'));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function startReconfigure(User $user, array $overrides = [])
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/2fa/reconfigure/start', $this->validStartPayload($overrides));
    }

    private function verifyReconfigure(User $user, string $token, string $otp)
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/2fa/reconfigure/verify', [
                'two_factor_reconfigure_token' => $token,
                'otp' => $otp,
            ]);
    }

    /**
     * @return array{login: \Illuminate\Testing\TestResponse, verify: \Illuminate\Testing\TestResponse}
     */
    private function loginWithOtpUsingSecret(User $user, string $secret, string $password = 'password'): array
    {
        $loginResponse = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => $password,
        ]);

        $verifyResponse = $this->postJson('/api/auth/otp/verify', [
            'login_challenge_id' => $loginResponse->json('data.login_challenge_id'),
            'otp' => app(TwoFactorService::class)->generateTotp($secret),
        ]);

        return [
            'login' => $loginResponse,
            'verify' => $verifyResponse,
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function validStartPayload(array $overrides = []): array
    {
        return array_merge([
            'current_password' => 'password',
            'otp' => $this->currentTotp(),
        ], $overrides);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }
}
