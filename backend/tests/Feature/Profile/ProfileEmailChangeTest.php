<?php

namespace Tests\Feature\Profile;

use App\Mail\ProfileEmailChangeVerificationMail;
use App\Models\AuthAuditLog;
use App\Models\ProfileChangeToken;
use App\Models\RefreshToken;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Support\Profile\InvalidProfileChangeTokenException;
use App\Support\Profile\ProfileStepUpVerificationException;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfileEmailChangeTest extends TestCase
{
    use CreatesPatrolUsers;
    use EnablesTwoFactorAuth;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        Cache::flush();
        Mail::fake();

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
        $this->postJson('/api/profile/email/start', $this->validStartPayload())
            ->assertUnauthorized();
    }

    public function test_unauthenticated_confirm_returns_401(): void
    {
        $this->postJson('/api/profile/email/confirm', ['token' => 'abc'])
            ->assertUnauthorized();
    }

    public function test_start_requires_current_password_otp_and_new_email(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->actingAs($guard, 'api')
            ->postJson('/api/profile/email/start', [])
            ->assertStatus(422);

        $errors = $response->json('data.errors');
        $this->assertArrayHasKey('current_password', $errors);
        $this->assertArrayHasKey('otp', $errors);
        $this->assertArrayHasKey('new_email', $errors);
    }

    public function test_confirm_requires_token(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->actingAs($guard, 'api')
            ->postJson('/api/profile/email/confirm', [])
            ->assertStatus(422);

        $this->assertArrayHasKey('token', $response->json('data.errors'));
    }

    public function test_start_rejects_same_current_email(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->startEmailChange($guard, [
            'new_email' => strtolower($guard->email),
        ])->assertStatus(422);

        $this->assertArrayHasKey('new_email', $response->json('data.errors'));
        $this->assertSame($guard->email, $guard->fresh()->email);
    }

    public function test_start_rejects_email_already_used_by_another_user(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $other = $this->enableTwoFactor($this->securityOperatorUser());

        $this->startEmailChange($guard, [
            'new_email' => $other->email,
        ])->assertStatus(422);

        $this->assertSame($guard->email, $guard->fresh()->email);
    }

    public function test_email_is_not_changed_before_confirmation(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $newEmail = 'pending.change@example.com';

        $this->startEmailChange($guard, ['new_email' => $newEmail])->assertOk();

        $this->assertSame($guard->email, $guard->fresh()->email);
    }

    public function test_start_rejects_wrong_current_password_with_generic_step_up_message(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startEmailChange($guard, ['current_password' => 'wrong-password'])
            ->assertStatus(422)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);
    }

    public function test_start_rejects_wrong_otp_with_same_generic_step_up_message(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startEmailChange($guard, ['otp' => '000000'])
            ->assertStatus(422)
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);

        $this->startEmailChange($guard, ['current_password' => 'wrong-password'])
            ->assertJsonPath('message', ProfileStepUpVerificationException::MESSAGE);
    }

    public function test_repeated_failed_step_up_attempts_are_rate_limited(): void
    {
        config(['profile.step_up.max_attempts' => 3]);

        $guard = $this->enableTwoFactor($this->guardUser());

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->startEmailChange($guard, ['current_password' => 'wrong-password'])
                ->assertStatus(422);
        }

        $this->startEmailChange($guard)->assertStatus(429)
            ->assertJsonPath('message', 'Too many step-up verification attempts.');
    }

    public function test_start_creates_hashed_token_and_sends_mail(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $newEmail = 'new.guard@example.com';

        $response = $this->startEmailChange($guard, ['new_email' => $newEmail])
            ->assertOk()
            ->assertJsonPath('message', 'Email change verification sent.')
            ->assertJsonStructure(['data' => ['expires_in', 'masked_email']]);

        $this->assertSame(600, $response->json('data.expires_in'));
        $this->assertStringNotContainsString($newEmail, (string) $response->json('data.masked_email'));

        $this->assertDatabaseCount('profile_change_tokens', 1);
        $tokenRow = ProfileChangeToken::query()->firstOrFail();
        $this->assertSame(ProfileChangeToken::TYPE_EMAIL_CHANGE, $tokenRow->type);
        $this->assertNull($tokenRow->used_at);

        Mail::assertSent(ProfileEmailChangeVerificationMail::class, function (ProfileEmailChangeVerificationMail $mail) use ($newEmail): bool {
            return $mail->hasTo($newEmail);
        });

        $sentMail = Mail::sent(ProfileEmailChangeVerificationMail::class)->first();
        $this->assertNotSame($sentMail->verificationToken, $tokenRow->token_hash);
        $this->assertDatabaseMissing('profile_change_tokens', [
            'token_hash' => $sentMail->verificationToken,
        ]);
    }

    public function test_pending_email_is_encrypted_at_rest(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $newEmail = 'encrypted.pending@example.com';

        $this->startEmailChange($guard, ['new_email' => $newEmail])->assertOk();

        $tokenRow = ProfileChangeToken::query()->firstOrFail();
        $this->assertSame($newEmail, $tokenRow->fresh()->pending_payload['pending_email'] ?? null);

        $rawPayload = DB::table('profile_change_tokens')
            ->where('id', $tokenRow->id)
            ->value('pending_payload');

        $this->assertIsString($rawPayload);
        $this->assertStringNotContainsString($newEmail, $rawPayload);
    }

    public function test_start_writes_email_change_started_audit_with_safe_metadata(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $newEmail = 'audit.start@example.com';

        $this->startEmailChange($guard, ['new_email' => $newEmail])->assertOk();

        $audit = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_EMAIL_CHANGE_STARTED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('self_profile', $audit->metadata['source']);
        $this->assertNull($audit->email);
        $this->assertArrayHasKey('target_email_hash', $audit->metadata);
        $this->assertArrayHasKey('profile_version', $audit->metadata);
        $this->assertStringNotContainsString($newEmail, json_encode($audit->metadata));
    }

    public function test_invalid_token_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->confirmEmailChange($guard, 'not-a-valid-token')
            ->assertStatus(422)
            ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);
    }

    public function test_expired_token_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $newEmail = 'expired@example.com';

        $this->startEmailChange($guard, ['new_email' => $newEmail])->assertOk();
        $plainToken = $this->plainTokenFromLastMail();

        Carbon::setTestNow(now()->addMinutes(11));

        $this->confirmEmailChange($guard->fresh(), $plainToken)
            ->assertStatus(422)
            ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);

        $this->assertSame($guard->email, $guard->fresh()->email);
    }

    public function test_used_token_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $newEmail = 'used.token@example.com';

        $this->startEmailChange($guard, ['new_email' => $newEmail])->assertOk();
        $plainToken = $this->plainTokenFromLastMail();

        Carbon::setTestNow(now()->addSecond());

        $login = $this->loginWithOtp($guard->fresh(), 'password');
        $accessToken = $login['verify']->json('data.access_token');

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->postJson('/api/profile/email/confirm', ['token' => $plainToken])
            ->assertOk();

        Carbon::setTestNow(now()->addSecond());
        $secondLogin = $this->loginWithOtp($guard->fresh(), 'password');

        $this->withHeader('Authorization', 'Bearer '.$secondLogin['verify']->json('data.access_token'))
            ->postJson('/api/profile/email/confirm', ['token' => $plainToken])
            ->assertStatus(422);
    }

    public function test_wrong_token_type_returns_422(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $plainToken = bin2hex(random_bytes(32));

        ProfileChangeToken::factory()->twoFactorReconfigure()->create([
            'user_id' => $guard->id,
            'token_hash' => ProfileChangeToken::hashToken($plainToken),
        ]);

        $this->confirmEmailChange($guard, $plainToken)
            ->assertStatus(422);
    }

    public function test_token_for_different_user_is_rejected_without_changing_either_user(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $other = $this->enableTwoFactor($this->securityOperatorUser());

        $this->startEmailChange($guard, ['new_email' => 'guard.new@example.com'])->assertOk();
        $plainToken = $this->plainTokenFromLastMail();

        $this->confirmEmailChange($other, $plainToken)
            ->assertStatus(422);

        $this->assertSame('guard.new@example.com', $this->pendingEmailForUser($guard));
        $this->assertSame($guard->email, $guard->fresh()->email);
        $this->assertSame($other->email, $other->fresh()->email);
    }

    public function test_confirm_updates_email_and_invalidates_sessions(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $guard->forceFill(['profile_version' => 2])->save();
        $oldEmail = $guard->email;
        $newEmail = 'confirmed.guard@example.com';

        $login = $this->loginWithOtp($guard)['verify'];
        $oldAccessToken = $login->json('data.access_token');
        $oldRefreshCookie = $login->getCookie('refresh_token', false);

        $this->withHeader('Authorization', 'Bearer '.$oldAccessToken)
            ->postJson('/api/profile/email/start', $this->validStartPayload(['new_email' => $newEmail]))
            ->assertOk();

        $plainToken = $this->plainTokenFromLastMail();

        Carbon::setTestNow(now()->addSecond());

        $response = $this->withHeader('Authorization', 'Bearer '.$oldAccessToken)
            ->postJson('/api/profile/email/confirm', ['token' => $plainToken])
            ->assertOk()
            ->assertJsonPath('message', 'Email changed successfully. Please sign in again.')
            ->assertJsonPath('data.requires_reauthentication', true)
            ->assertJsonPath('data.revoked_sessions_count', 1);

        $cookie = $response->getCookie('refresh_token', false);
        $this->assertNotNull($cookie);
        $this->assertSame('', $cookie->getValue());

        $fresh = $guard->fresh();
        $this->assertSame($newEmail, $fresh->email);
        $this->assertNotNull($fresh->email_verified_at);
        $this->assertNotNull($fresh->last_security_changed_at);
        $this->assertSame(3, $fresh->profile_version);

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$oldAccessToken)
            ->getJson('/api/profile')
            ->assertForbidden();

        $this->withUnencryptedCookie('refresh_token', $oldRefreshCookie->getValue())
            ->withCredentials()
            ->postJson('/api/auth/refresh')
            ->assertUnauthorized();

        $this->postJson('/api/auth/login', [
            'email' => $oldEmail,
            'password' => 'password',
        ])->assertUnauthorized();

        Carbon::setTestNow(now()->addSecond());

        $newLogin = $this->loginWithOtp($fresh, 'password');
        $newLogin['login']->assertOk();
        $newLogin['verify']->assertOk();

        $newAccessToken = $newLogin['verify']->json('data.access_token');

        Auth::guard('api')->forgetUser();

        $this->withHeader('Authorization', 'Bearer '.$newAccessToken)
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.user.email', $newEmail);
    }

    public function test_confirm_writes_email_changed_audit_with_safe_metadata(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $newEmail = 'audit.changed@example.com';

        $this->startEmailChange($guard, ['new_email' => $newEmail])->assertOk();
        $plainToken = $this->plainTokenFromLastMail();

        Carbon::setTestNow(now()->addSecond());
        $login = $this->loginWithOtp($guard->fresh(), 'password');
        $this->withHeader('Authorization', 'Bearer '.$login['verify']->json('data.access_token'))
            ->postJson('/api/profile/email/confirm', ['token' => $plainToken])
            ->assertOk();

        $audit = AuthAuditLog::query()
            ->where('event_type', AuthAuditService::EVENT_EMAIL_CHANGED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('self_profile', $audit->metadata['source']);
        $this->assertNull($audit->email);
        $this->assertArrayHasKey('old_email_hash', $audit->metadata);
        $this->assertArrayHasKey('new_email_hash', $audit->metadata);
        $this->assertArrayHasKey('profile_version', $audit->metadata);
        $this->assertArrayHasKey('revoked_count', $audit->metadata);

        $payload = json_encode($audit->metadata);
        $this->assertStringNotContainsString($newEmail, $payload);
        $this->assertStringNotContainsString($guard->email, $payload);
    }

    public function test_response_and_audit_do_not_expose_secrets(): void
    {
        config(['app.debug' => false]);

        $guard = $this->enableTwoFactor($this->guardUser());
        $newEmail = 'secrets.test@example.com';

        $startResponse = $this->startEmailChange($guard, ['new_email' => $newEmail])->assertOk();
        $plainToken = $this->plainTokenFromLastMail();

        $startPayload = json_encode($startResponse->json());
        $this->assertStringNotContainsString($plainToken, $startPayload);
        $this->assertStringNotContainsString($this->testTotpSecret, $startPayload);
        $this->assertArrayNotHasKey('delivery_mode', $startResponse->json('data'));

        Carbon::setTestNow(now()->addSecond());

        $confirmResponse = $this->confirmEmailChange($guard->fresh(), $plainToken)->assertOk();
        $confirmPayload = json_encode($confirmResponse->json());
        $this->assertStringNotContainsString($plainToken, $confirmPayload);
        $this->assertStringNotContainsString($this->testTotpSecret, $confirmPayload);
    }

    public function test_debug_mode_log_mailer_exposes_delivery_mode_without_token(): void
    {
        config(['app.debug' => true, 'mail.default' => 'log']);

        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->startEmailChange($guard, ['new_email' => 'debug.mode@example.com'])->assertOk();

        $this->assertSame('log', $response->json('data.delivery_mode'));
        $plainToken = $this->plainTokenFromLastMail();
        $this->assertStringNotContainsString($plainToken, json_encode($response->json()));
    }

    public function test_production_mode_does_not_expose_delivery_mode(): void
    {
        config(['app.debug' => false, 'mail.default' => 'log']);

        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->startEmailChange($guard, ['new_email' => 'prod.mode@example.com'])->assertOk();

        $this->assertArrayNotHasKey('delivery_mode', $response->json('data'));
    }

    public function test_admin_security_operator_and_guard_can_change_own_email(): void
    {
        foreach ([
            [$this->adminUser(), 'admin.new@example.com'],
            [$this->securityOperatorUser(), 'operator.new@example.com'],
            [$this->guardUser(), 'guard.new@example.com'],
        ] as [$user, $newEmail]) {
            Mail::fake();
            $enabled = $this->enableTwoFactor($user);

            $this->startEmailChange($enabled, ['new_email' => $newEmail])->assertOk();
            $plainToken = $this->plainTokenFromLastMail();

            Carbon::setTestNow(now()->addSecond());

            $this->confirmEmailChange($enabled->fresh(), $plainToken)->assertOk();
            $this->assertSame($newEmail, $enabled->fresh()->email);
        }
    }

    public function test_new_start_invalidates_previous_active_email_change_token(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->startEmailChange($guard, ['new_email' => 'first@example.com'])->assertOk();
        $firstToken = $this->plainTokenFromLastMail();

        $this->startEmailChange($guard->fresh(), ['new_email' => 'second@example.com'])->assertOk();
        $secondToken = $this->plainTokenFromLastMail();

        Carbon::setTestNow(now()->addSecond());

        $this->confirmEmailChange($guard->fresh(), $firstToken)
            ->assertStatus(422);

        $this->confirmEmailChange($guard->fresh(), $secondToken)
            ->assertOk();

        $this->assertSame('second@example.com', $guard->fresh()->email);
    }

    public function test_confirm_returns_422_when_pending_email_was_claimed_by_another_user(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $pendingEmail = 'pending.claimed@example.com';
        $originalEmail = $guard->email;
        $originalVersion = (int) $guard->profile_version;

        $this->startEmailChange($guard, ['new_email' => $pendingEmail])->assertOk();
        $plainToken = $this->plainTokenFromLastMail();

        User::factory()->create([
            'role_id' => $guard->role_id,
            'email' => $pendingEmail,
            'two_factor_enabled' => true,
        ]);

        Carbon::setTestNow(now()->addSecond());

        $login = $this->loginWithOtp($guard->fresh(), 'password');
        $activeSessionsBefore = RefreshToken::query()
            ->where('user_id', $guard->id)
            ->whereNull('revoked_at')
            ->count();

        $accessToken = $login['verify']->json('data.access_token');

        $this->withHeader('Authorization', 'Bearer '.$accessToken)
            ->postJson('/api/profile/email/confirm', ['token' => $plainToken])
            ->assertStatus(422)
            ->assertJsonPath('message', InvalidProfileChangeTokenException::MESSAGE);

        $fresh = $guard->fresh();
        $this->assertSame($originalEmail, $fresh->email);
        $this->assertSame($originalVersion, $fresh->profile_version);
        $this->assertNull($fresh->last_security_changed_at);

        $this->assertSame(
            $activeSessionsBefore,
            RefreshToken::query()->where('user_id', $guard->id)->whereNull('revoked_at')->count()
        );

        $this->assertDatabaseMissing('auth_audit_logs', [
            'user_id' => $guard->id,
            'event_type' => AuthAuditService::EVENT_EMAIL_CHANGED,
        ]);

        $failure = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_EMAIL_CHANGE_FAILED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($failure);
        $this->assertSame('email_unavailable', $failure->metadata['reason']);
        $this->assertNull($failure->email);

        $tokenRow = ProfileChangeToken::query()
            ->where('user_id', $guard->id)
            ->where('type', ProfileChangeToken::TYPE_EMAIL_CHANGE)
            ->latest('created_at')
            ->first();

        $this->assertNotNull($tokenRow);
        $this->assertNull($tokenRow->used_at);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function startEmailChange(User $user, array $overrides = [])
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/email/start', $this->validStartPayload($overrides));
    }

    private function confirmEmailChange(User $user, string $token)
    {
        return $this->actingAs($user, 'api')
            ->postJson('/api/profile/email/confirm', ['token' => $token]);
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
            'new_email' => 'changed.user@example.com',
        ], $overrides);
    }

    private function plainTokenFromLastMail(): string
    {
        /** @var ProfileEmailChangeVerificationMail $mail */
        $mail = Mail::sent(ProfileEmailChangeVerificationMail::class)->last();

        return $mail->verificationToken;
    }

    private function pendingEmailForUser(User $user): ?string
    {
        $token = ProfileChangeToken::query()
            ->where('user_id', $user->getKey())
            ->where('type', ProfileChangeToken::TYPE_EMAIL_CHANGE)
            ->latest('created_at')
            ->first();

        return is_array($token?->pending_payload)
            ? ($token->pending_payload['pending_email'] ?? null)
            : null;
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }
}
