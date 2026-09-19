<?php

namespace Tests\Feature;

use App\Models\ProfileChangeToken;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ProfileDataFoundationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_users_table_has_required_profile_fields(): void
    {
        $columns = [
            'phone',
            'address',
            'profile_picture_url',
            'profile_version',
            'last_password_changed_at',
            'last_security_changed_at',
        ];

        foreach ($columns as $column) {
            $this->assertTrue(
                Schema::hasColumn('users', $column),
                "Expected users.{$column} column to exist."
            );
        }
    }

    public function test_user_model_casts_profile_and_security_fields(): void
    {
        $user = User::factory()->create([
            'profile_version' => 3,
            'email_verified_at' => '2026-01-15 10:00:00',
            'last_password_changed_at' => '2026-02-01 12:00:00',
            'two_factor_enabled' => true,
            'two_factor_confirmed_at' => '2026-03-01 08:00:00',
        ]);

        $user->forceFill(['last_security_changed_at' => '2026-04-01 09:00:00'])->save();
        $user->refresh();

        $casts = $user->getCasts();

        $this->assertSame('integer', $casts['profile_version']);
        $this->assertSame('datetime', $casts['email_verified_at']);
        $this->assertSame('datetime', $casts['last_password_changed_at']);
        $this->assertSame('datetime', $casts['last_security_changed_at']);
        $this->assertSame('boolean', $casts['two_factor_enabled']);
        $this->assertSame('datetime', $casts['two_factor_confirmed_at']);

        $this->assertSame(3, $user->profile_version);
        $this->assertInstanceOf(Carbon::class, $user->email_verified_at);
        $this->assertInstanceOf(Carbon::class, $user->last_password_changed_at);
        $this->assertInstanceOf(Carbon::class, $user->last_security_changed_at);
        $this->assertTrue($user->two_factor_enabled);
        $this->assertInstanceOf(Carbon::class, $user->two_factor_confirmed_at);
    }

    public function test_last_security_changed_at_is_not_mass_assignable(): void
    {
        $user = User::factory()->create();

        $this->assertNotContains('last_security_changed_at', $user->getFillable());

        $user->fill([
            'last_security_changed_at' => now(),
        ]);

        $this->assertNull($user->last_security_changed_at);
        $this->assertNull($user->fresh()->last_security_changed_at);
    }

    public function test_profile_change_tokens_table_has_expected_columns(): void
    {
        $this->assertTrue(Schema::hasTable('profile_change_tokens'));

        $columns = [
            'id',
            'user_id',
            'type',
            'token_hash',
            'pending_payload',
            'expires_at',
            'used_at',
            'ip_address',
            'user_agent',
            'created_at',
            'updated_at',
        ];

        foreach ($columns as $column) {
            $this->assertTrue(
                Schema::hasColumn('profile_change_tokens', $column),
                "Expected profile_change_tokens.{$column} column to exist."
            );
        }
    }

    public function test_profile_change_token_factory_creates_valid_records(): void
    {
        $token = ProfileChangeToken::factory()->create();

        $this->assertDatabaseHas('profile_change_tokens', [
            'id' => $token->id,
            'user_id' => $token->user_id,
            'type' => ProfileChangeToken::TYPE_EMAIL_CHANGE,
        ]);

        $this->assertNotEmpty($token->token_hash);
        $this->assertNull($token->used_at);
        $this->assertTrue($token->expires_at->isFuture());
    }

    public function test_plain_token_values_are_not_persisted(): void
    {
        $plainToken = bin2hex(random_bytes(32));
        $tokenHash = ProfileChangeToken::hashToken($plainToken);

        ProfileChangeToken::factory()->create([
            'token_hash' => $tokenHash,
        ]);

        $this->assertDatabaseHas('profile_change_tokens', [
            'token_hash' => $tokenHash,
        ]);
        $this->assertDatabaseMissing('profile_change_tokens', [
            'token_hash' => $plainToken,
        ]);
    }

    public function test_pending_payload_is_encrypted_at_rest(): void
    {
        $pendingEmail = 'pending.user@example.com';

        $token = ProfileChangeToken::factory()
            ->withPendingPayload(['pending_email' => $pendingEmail])
            ->create();

        $this->assertSame(['pending_email' => $pendingEmail], $token->fresh()->pending_payload);

        $rawPayload = DB::table('profile_change_tokens')
            ->where('id', $token->id)
            ->value('pending_payload');

        $this->assertIsString($rawPayload);
        $this->assertStringNotContainsString($pendingEmail, $rawPayload);
    }

    public function test_token_status_helpers(): void
    {
        $active = ProfileChangeToken::factory()->create();
        $this->assertTrue($active->isActive());
        $this->assertFalse($active->isExpired());
        $this->assertFalse($active->isUsed());
        $this->assertTrue($active->markUsed());
        $this->assertTrue($active->fresh()->isUsed());
        $this->assertFalse($active->fresh()->isActive());

        $expired = ProfileChangeToken::factory()->expired()->create();
        $this->assertTrue($expired->isExpired());
        $this->assertFalse($expired->isActive());

        $used = ProfileChangeToken::factory()->used()->create();
        $this->assertTrue($used->isUsed());
        $this->assertFalse($used->isActive());
        $this->assertFalse($used->markUsed());
    }

    public function test_user_profile_change_tokens_relationship(): void
    {
        $user = User::factory()->create();

        $tokens = ProfileChangeToken::factory()
            ->count(2)
            ->for($user)
            ->create();

        $this->assertCount(2, $user->profileChangeTokens);
        $this->assertTrue($user->profileChangeTokens->pluck('id')->diff($tokens->pluck('id'))->isEmpty());
    }

    public function test_profile_config_is_readable(): void
    {
        $this->assertSame('public', config('profile.profile_picture.disk'));
        $this->assertSame('profile-pictures', config('profile.profile_picture.directory'));
        $this->assertSame(2048, config('profile.profile_picture.max_size_kb'));
        $this->assertSame(['jpg', 'jpeg', 'png', 'webp'], config('profile.profile_picture.allowed_mimes'));
        $this->assertSame(10, config('profile.change_tokens.ttl_minutes'));
        $this->assertSame(5, config('profile.step_up.max_attempts'));
        $this->assertSame(300, config('profile.step_up.decay_seconds'));
        $this->assertFalse(config('profile.security.allow_user_two_factor_disable'));
        $this->assertTrue(config('profile.security.require_step_up_for_sensitive_changes'));
        $this->assertTrue(config('profile.security.revoke_sessions_after_sensitive_changes'));
    }

    public function test_profile_change_token_factory_states(): void
    {
        $emailToken = ProfileChangeToken::factory()->emailChange()->create();
        $this->assertSame(ProfileChangeToken::TYPE_EMAIL_CHANGE, $emailToken->type);

        $twoFactorToken = ProfileChangeToken::factory()->twoFactorReconfigure()->create();
        $this->assertSame(ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE, $twoFactorToken->type);
    }
}
