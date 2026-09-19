<?php

namespace Tests\Feature\Profile;

use App\Models\AuthAuditLog;
use App\Models\ProfileChangeToken;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class ProfileReadUpdateTest extends TestCase
{
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_admin_can_retrieve_own_profile(): void
    {
        $admin = $this->adminUser();

        $this->actingAs($admin, 'api')
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Profile retrieved successfully.')
            ->assertJsonPath('data.user.id', $admin->id)
            ->assertJsonPath('data.user.role.name', 'Admin');
    }

    public function test_security_operator_can_retrieve_own_profile(): void
    {
        $operator = $this->securityOperatorUser();

        $this->actingAs($operator, 'api')
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.user.id', $operator->id)
            ->assertJsonPath('data.user.role.name', 'Security Operator');
    }

    public function test_guard_can_retrieve_own_profile(): void
    {
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.user.id', $guard->id)
            ->assertJsonPath('data.user.role.name', 'Guard');
    }

    public function test_unauthenticated_profile_read_returns_401(): void
    {
        $this->getJson('/api/profile')->assertUnauthorized();
    }

    public function test_unauthenticated_profile_update_returns_401(): void
    {
        $this->patchJson('/api/profile', [
            'phone' => '0123000000',
        ])->assertUnauthorized();
    }

    public function test_unknown_request_keys_return_422(): void
    {
        $guard = $this->guardUser();

        $response = $this->actingAs($guard, 'api')
            ->patchJson('/api/profile', [
                'phone' => '0123000000',
                'unexpected_field' => 'value',
            ])
            ->assertStatus(422);

        $errors = $response->json('data.errors');
        $this->assertIsArray($errors);
        $this->assertArrayHasKey('unexpected_field', $errors);
    }

    public function test_no_op_update_does_not_increment_profile_version_or_write_audit(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill([
            'phone' => '0123456789',
            'address' => 'Kuala Lumpur',
            'profile_version' => 6,
        ])->save();

        $this->actingAs($guard->fresh(), 'api')
            ->patchJson('/api/profile', [
                'phone' => '0123456789',
                'address' => 'Kuala Lumpur',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.profile_version', 6);

        $this->assertSame(6, $guard->fresh()->profile_version);

        $this->assertDatabaseMissing('auth_audit_logs', [
            'user_id' => $guard->id,
            'event_type' => AuthAuditService::EVENT_PROFILE_UPDATED,
        ]);
    }

    public function test_setup_required_user_cannot_access_profile(): void
    {
        $guard = User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'setup_required' => true,
            'two_factor_enabled' => true,
        ]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/profile')
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');
    }

    public function test_user_without_completed_two_factor_cannot_access_profile(): void
    {
        $guard = User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'setup_required' => false,
            'two_factor_enabled' => false,
        ]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/profile')
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');
    }

    public function test_profile_response_includes_safe_fields_and_role_summary(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill([
            'phone' => '0123456789',
            'address' => 'Kuala Lumpur',
            'profile_version' => 4,
            'profile_picture_url' => 'https://example.test/avatar.png',
        ])->save();

        $response = $this->actingAs($guard->fresh(), 'api')
            ->getJson('/api/profile')
            ->assertOk();

        $response->assertJsonStructure([
            'data' => [
                'user' => [
                    'id',
                    'name',
                    'email',
                    'phone',
                    'address',
                    'profile_picture_url',
                    'profile_version',
                    'two_factor_enabled',
                    'two_factor_confirmed_at',
                    'email_verified_at',
                    'last_password_changed_at',
                    'last_security_changed_at',
                    'role' => ['id', 'name'],
                    'created_at',
                    'updated_at',
                ],
            ],
        ]);

        $this->assertSame('0123456789', $response->json('data.user.phone'));
        $this->assertSame(4, $response->json('data.user.profile_version'));
    }

    public function test_profile_response_does_not_expose_secrets_or_deleted_metadata(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill([
            'password' => 'secret-password-value',
            'two_factor_secret' => 'JBSWY3DPEHPK3PXP',
        ])->save();

        ProfileChangeToken::factory()->for($guard)->create();

        $payload = json_encode(
            $this->actingAs($guard->fresh(), 'api')
                ->getJson('/api/profile')
                ->assertOk()
                ->json()
        );

        $this->assertStringNotContainsString('secret-password-value', $payload);
        $this->assertStringNotContainsString('JBSWY3DPEHPK3PXP', $payload);
        $this->assertStringNotContainsString('token_hash', $payload);
        $this->assertStringNotContainsString('deleted_at', $payload);
    }

    public function test_patch_profile_updates_phone_and_address(): void
    {
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')
            ->patchJson('/api/profile', [
                'phone' => '0111222333',
                'address' => 'Selangor',
            ])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Profile updated successfully.')
            ->assertJsonPath('data.user.phone', '0111222333')
            ->assertJsonPath('data.user.address', 'Selangor');

        $this->assertDatabaseHas('users', [
            'id' => $guard->id,
            'phone' => '0111222333',
            'address' => 'Selangor',
        ]);
    }

    public function test_successful_update_increments_profile_version(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill(['profile_version' => 7])->save();

        $this->actingAs($guard->fresh(), 'api')
            ->patchJson('/api/profile', [
                'phone' => '0999888777',
            ])
            ->assertOk()
            ->assertJsonPath('data.user.profile_version', 8);

        $this->assertSame(8, $guard->fresh()->profile_version);
    }

    public function test_successful_update_returns_profile_resource(): void
    {
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')
            ->patchJson('/api/profile', [
                'address' => 'Penang',
            ])
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'user' => [
                        'id',
                        'email',
                        'address',
                        'profile_version',
                        'role' => ['id', 'name'],
                    ],
                ],
            ])
            ->assertJsonPath('data.user.address', 'Penang');
    }

    public function test_stale_profile_version_returns_409(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill([
            'phone' => '0100000000',
            'profile_version' => 5,
        ])->save();

        $this->actingAs($guard->fresh(), 'api')
            ->patchJson('/api/profile', [
                'phone' => '0199999999',
                'profile_version' => 4,
            ])
            ->assertStatus(409)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Profile has been modified. Please refresh and try again.')
            ->assertJsonPath('data.code', 'profile_version_conflict')
            ->assertJsonPath('data.current_profile_version', 5)
            ->assertJsonPath('data.user.profile_version', 5)
            ->assertJsonPath('data.user.phone', '0100000000');

        $this->assertDatabaseHas('users', [
            'id' => $guard->id,
            'phone' => '0100000000',
            'profile_version' => 5,
        ]);
    }

    public function test_patch_with_only_profile_version_returns_422(): void
    {
        $guard = $this->guardUser();

        $response = $this->actingAs($guard, 'api')
            ->patchJson('/api/profile', [
                'profile_version' => 1,
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Validation failed.');

        $errors = $response->json('data.errors');
        $this->assertIsArray($errors);
        $this->assertArrayHasKey('phone', $errors);
    }

    public function test_prohibited_fields_return_422(): void
    {
        $guard = $this->guardUser();

        $response = $this->actingAs($guard, 'api')
            ->patchJson('/api/profile', [
                'phone' => '0123000000',
                'email' => 'hacker@example.com',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $errors = $response->json('data.errors');
        $this->assertIsArray($errors);
        $this->assertArrayHasKey('email', $errors);
    }

    public function test_prohibited_sensitive_fields_do_not_change_user_record(): void
    {
        $guard = $this->guardUser();
        $adminRoleId = $this->adminUser()->role_id;
        $originalEmail = $guard->email;
        $originalRoleId = $guard->role_id;
        $originalPicture = 'https://example.test/original.png';

        $guard->forceFill([
            'profile_picture_url' => $originalPicture,
            'profile_version' => 2,
        ])->save();

        $originalLastPasswordChanged = $guard->fresh()->last_password_changed_at;
        $originalLastSecurityChanged = $guard->fresh()->last_security_changed_at;

        $attempts = [
            ['phone' => '0123000001', 'email' => 'changed@example.com'],
            ['phone' => '0123000002', 'password' => 'NewPassword1!'],
            ['phone' => '0123000003', 'role_id' => $adminRoleId],
            ['phone' => '0123000004', 'two_factor_enabled' => false],
            ['phone' => '0123000005', 'two_factor_secret' => 'ABCDEFGHIJKLMNOP'],
            ['phone' => '0123000006', 'last_password_changed_at' => now()->toIso8601String()],
            ['phone' => '0123000007', 'last_security_changed_at' => now()->toIso8601String()],
            ['phone' => '0123000008', 'profile_picture_url' => 'https://example.test/new.png'],
        ];

        foreach ($attempts as $payload) {
            $this->actingAs($guard->fresh(), 'api')
                ->patchJson('/api/profile', $payload)
                ->assertStatus(422);
        }

        $fresh = $guard->fresh();

        $this->assertSame($originalEmail, $fresh->email);
        $this->assertSame($originalRoleId, $fresh->role_id);
        $this->assertSame($originalPicture, $fresh->profile_picture_url);
        $this->assertTrue($fresh->two_factor_enabled);
        $this->assertNull($fresh->two_factor_secret);
        $this->assertEquals($originalLastPasswordChanged, $fresh->last_password_changed_at);
        $this->assertEquals($originalLastSecurityChanged, $fresh->last_security_changed_at);
    }

    public function test_successful_update_writes_profile_updated_audit_log(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill(['profile_version' => 3])->save();

        $this->actingAs($guard->fresh(), 'api')
            ->patchJson('/api/profile', [
                'phone' => '0133333333',
                'address' => 'Johor',
            ])
            ->assertOk();

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_PROFILE_UPDATED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame(AuthAuditService::STATUS_SUCCESS, $audit->status);
        $this->assertSame(['phone', 'address'], $audit->metadata['changed_fields']);
        $this->assertSame(4, $audit->metadata['profile_version']);
        $this->assertSame('self_profile', $audit->metadata['source']);
    }

    public function test_audit_metadata_is_sanitized_and_excludes_raw_contact_values(): void
    {
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')
            ->patchJson('/api/profile', [
                'phone' => '0144444444',
            ])
            ->assertOk();

        $metadata = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_PROFILE_UPDATED)
            ->latest('occurred_at')
            ->value('metadata');

        $this->assertIsArray($metadata);
        $this->assertArrayHasKey('changed_fields', $metadata);
        $this->assertArrayNotHasKey('phone', $metadata);
        $this->assertArrayNotHasKey('address', $metadata);
        $this->assertArrayNotHasKey('password', $metadata);
        $this->assertArrayNotHasKey('token', $metadata);
    }

    public function test_stale_profile_version_writes_profile_update_failed_audit_log(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill(['profile_version' => 9])->save();

        $this->actingAs($guard->fresh(), 'api')
            ->patchJson('/api/profile', [
                'phone' => '0155555555',
                'profile_version' => 8,
            ])
            ->assertStatus(409);

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_PROFILE_UPDATE_FAILED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame('profile_version_conflict', $audit->metadata['reason']);
        $this->assertSame(8, $audit->metadata['submitted_profile_version']);
        $this->assertSame(9, $audit->metadata['current_profile_version']);
    }
}
