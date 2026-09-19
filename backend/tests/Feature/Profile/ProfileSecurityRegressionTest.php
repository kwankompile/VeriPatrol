<?php

namespace Tests\Feature\Profile;

use App\Models\BlockchainRecord;
use App\Models\User;
use App\Services\Auth\TwoFactorService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class ProfileSecurityRegressionTest extends TestCase
{
    use CreatesPatrolUsers;
    use EnablesTwoFactorAuth;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        Cache::flush();
        Storage::fake('public');

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-auth-tests-32chars',
            'auth_security.password_min_length' => 12,
            'profile.step_up.max_attempts' => 5,
            'profile.step_up.decay_seconds' => 300,
            'blockchain.enabled' => true,
            'blockchain.canonical_version' => 'v1',
            'blockchain.hash_algorithm' => 'sha256',
            'blockchain.network' => 'ganache',
            'blockchain.environment' => 'local',
            'blockchain.chain_id' => 1337,
            'blockchain.contract_address' => '0x'.str_repeat('a', 40),
        ]);
    }

    /**
     * @return array<string, array{0: string, 1: array<string, mixed>}>
     */
    public static function sensitiveEndpointProhibitedFieldProvider(): array
    {
        return [
            'password change rejects user_id' => [
                '/api/profile/password/change',
                [
                    'current_password' => 'password',
                    'otp' => '000000',
                    'password' => 'newpassword12',
                    'password_confirmation' => 'newpassword12',
                    'user_id' => '00000000-0000-4000-8000-000000000099',
                ],
            ],
            'password change rejects profile_version' => [
                '/api/profile/password/change',
                [
                    'current_password' => 'password',
                    'otp' => '000000',
                    'password' => 'newpassword12',
                    'password_confirmation' => 'newpassword12',
                    'profile_version' => 1,
                ],
            ],
            'email start rejects target_user_id' => [
                '/api/profile/email/start',
                [
                    'current_password' => 'password',
                    'otp' => '000000',
                    'new_email' => 'other@example.com',
                    'target_user_id' => '00000000-0000-4000-8000-000000000099',
                ],
            ],
            'email confirm rejects email' => [
                '/api/profile/email/confirm',
                [
                    'token' => 'abc',
                    'email' => 'hijack@example.com',
                ],
            ],
            '2fa start rejects two_factor_enabled' => [
                '/api/profile/2fa/reconfigure/start',
                [
                    'current_password' => 'password',
                    'otp' => '000000',
                    'two_factor_enabled' => false,
                ],
            ],
            '2fa verify rejects two_factor_secret' => [
                '/api/profile/2fa/reconfigure/verify',
                [
                    'two_factor_reconfigure_token' => 'abc',
                    'otp' => '000000',
                    'two_factor_secret' => 'SECRETVALUE',
                ],
            ],
        ];
    }

    #[DataProvider('sensitiveEndpointProhibitedFieldProvider')]
    public function test_sensitive_profile_endpoints_reject_unexpected_fields(string $uri, array $payload): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $response = $this->actingAs($guard, 'api')->postJson($uri, $payload);

        $response->assertStatus(422)->assertJsonPath('message', 'Validation failed.');

        $errors = $response->json('data.errors');
        $this->assertNotEmpty($errors);
    }

    public function test_picture_upload_rejects_unexpected_fields(): void
    {
        if (! extension_loaded('gd')) {
            $this->markTestSkipped('GD extension is not installed.');
        }

        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->post('/api/profile/picture', [
                'image' => UploadedFile::fake()->image('avatar.jpg'),
                'role_id' => 1,
            ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Validation failed.');
    }

    public function test_admin_cannot_change_another_users_phone_through_profile_endpoint(): void
    {
        $admin = $this->adminUser();
        $guard = $this->guardUser();
        $originalPhone = $guard->phone;
        $originalAdminPhone = $admin->phone;

        $this->actingAs($admin, 'api')
            ->patchJson('/api/profile', [
                'phone' => '+60999999999',
                'target_user_id' => $guard->getKey(),
            ])
            ->assertStatus(422);

        $this->assertSame($originalPhone, $guard->fresh()->phone);
        $this->assertSame($originalAdminPhone, $admin->fresh()->phone);
    }

    public function test_admin_user_management_remains_independent_from_profile_hardening(): void
    {
        $admin = $this->enableTwoFactor($this->adminUser());
        $target = $this->guardUser();
        $originalAdminPhone = $admin->phone;

        $this->actingAs($admin, 'api')
            ->patchJson('/api/users/'.$target->getKey(), [
                'phone' => '+60112223333',
            ])
            ->assertOk();

        $this->assertSame('+60112223333', $target->fresh()->phone);
        $this->assertSame($originalAdminPhone, $admin->fresh()->phone);
    }

    public function test_profile_password_change_cannot_target_another_user_via_payload(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());
        $other = $this->enableTwoFactor($this->securityOperatorUser());

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
                'target_user_id' => $other->getKey(),
            ])
            ->assertStatus(422);

        $this->assertTrue(Hash::check('password', $guard->fresh()->password));
        $this->assertTrue(Hash::check('password', $other->fresh()->password));
    }

    public function test_two_factor_disable_attempt_via_profile_patch_is_rejected(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->patchJson('/api/profile', [
                'phone' => '+60123456789',
                'two_factor_enabled' => false,
            ])
            ->assertStatus(422);

        $fresh = $guard->fresh();
        $this->assertTrue($fresh->two_factor_enabled);
        $this->assertNotNull($fresh->two_factor_secret);
    }

    public function test_m13_password_change_still_creates_single_blockchain_record(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/password/change', [
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'password' => 'newpassword12',
                'password_confirmation' => 'newpassword12',
            ])
            ->assertOk();

        $records = BlockchainRecord::query()
            ->where('entity_type', 'user_profile')
            ->where('entity_id', $guard->getKey())
            ->where('proof_type', 'profile_password_changed')
            ->get();

        $this->assertCount(1, $records);
        $summary = $records->first()->payload_summary;
        $this->assertSame('self_profile', $summary['source'] ?? null);
        $this->assertArrayNotHasKey('password', $summary);
        $this->assertArrayNotHasKey('otp', $summary);
    }

    public function test_m13_email_start_does_not_create_blockchain_record(): void
    {
        $guard = $this->enableTwoFactor($this->guardUser());

        $this->actingAs($guard, 'api')
            ->postJson('/api/profile/email/start', [
                'current_password' => 'password',
                'otp' => $this->currentTotp(),
                'new_email' => 'pending.blockchain@example.com',
            ])
            ->assertOk();

        $this->assertSame(
            0,
            BlockchainRecord::query()
                ->where('entity_type', 'user_profile')
                ->where('entity_id', $guard->getKey())
                ->count()
        );
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }
}
