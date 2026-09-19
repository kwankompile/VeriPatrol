<?php

namespace Tests\Feature\Profile;

use App\Models\AuthAuditLog;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class ProfilePictureTest extends TestCase
{
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        Storage::fake('public');
        config([
            'profile.profile_picture.disk' => 'public',
            'profile.profile_picture.directory' => 'profile-pictures',
            'profile.profile_picture.max_size_kb' => 2048,
            'profile.profile_picture.allowed_mimes' => ['jpg', 'jpeg', 'png', 'webp'],
        ]);
    }

    public function test_admin_can_upload_own_profile_picture(): void
    {
        $admin = $this->adminUser();

        $this->uploadProfilePicture($admin, $this->validImage())
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.id', $admin->id);
    }

    public function test_security_operator_can_upload_own_profile_picture(): void
    {
        $operator = $this->securityOperatorUser();

        $this->uploadProfilePicture($operator, $this->validImage())
            ->assertOk()
            ->assertJsonPath('data.user.id', $operator->id);
    }

    public function test_guard_can_upload_own_profile_picture(): void
    {
        $guard = $this->guardUser();

        $this->uploadProfilePicture($guard, $this->validImage())
            ->assertOk()
            ->assertJsonPath('data.user.id', $guard->id);
    }

    public function test_unauthenticated_upload_returns_401(): void
    {
        $this->withHeaders(['Accept' => 'application/json'])
            ->post('/api/profile/picture', [
                'image' => $this->validImage(),
            ])
            ->assertUnauthorized();
    }

    public function test_unauthenticated_delete_returns_401(): void
    {
        $this->deleteJson('/api/profile/picture')->assertUnauthorized();
    }

    public function test_setup_required_user_cannot_upload_profile_picture(): void
    {
        $guard = User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'setup_required' => true,
            'two_factor_enabled' => true,
        ]);

        $this->uploadProfilePicture($guard, $this->validImage())
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');
    }

    public function test_user_without_completed_two_factor_cannot_upload_profile_picture(): void
    {
        $guard = User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'setup_required' => false,
            'two_factor_enabled' => false,
        ]);

        $this->uploadProfilePicture($guard, $this->validImage())
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');
    }

    public function test_valid_upload_stores_file_updates_user_and_writes_audit(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill(['profile_version' => 2])->save();

        $response = $this->uploadProfilePicture($guard->fresh(), $this->validImage())
            ->assertOk()
            ->assertJsonPath('message', 'Profile picture uploaded successfully.')
            ->assertJsonStructure([
                'data' => [
                    'user' => [
                        'id',
                        'profile_picture_url',
                        'profile_version',
                        'role' => ['id', 'name'],
                    ],
                ],
            ]);

        $fresh = $guard->fresh();
        $this->assertNotNull($fresh->profile_picture_url);
        $this->assertStringStartsWith('profile-pictures/', $fresh->profile_picture_url);
        $this->assertTrue(Storage::disk('public')->exists($fresh->profile_picture_url));
        $this->assertSame(3, $fresh->profile_version);

        $publicUrl = $response->json('data.user.profile_picture_url');
        $this->assertIsString($publicUrl);
        $this->assertStringStartsWith('/storage/profile-pictures/', $publicUrl);
        $this->assertStringNotContainsString(storage_path(), $publicUrl);
        $this->assertStringNotContainsString(':\\', $publicUrl);

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_PROFILE_PICTURE_UPLOADED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame(AuthAuditService::STATUS_SUCCESS, $audit->status);
        $this->assertSame(3, $audit->metadata['profile_version']);
        $this->assertSame('self_profile', $audit->metadata['source']);
        $this->assertArrayHasKey('file_size', $audit->metadata);
        $this->assertArrayHasKey('mime_type', $audit->metadata);
    }

    public function test_invalid_mime_returns_422_and_does_not_update_database(): void
    {
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')
            ->post('/api/profile/picture', [
                'image' => UploadedFile::fake()->create('avatar.bmp', 100, 'image/bmp'),
            ])
            ->assertStatus(422);

        $this->assertNull($guard->fresh()->profile_picture_url);
        Storage::disk('public')->assertDirectoryEmpty('profile-pictures');
    }

    public function test_oversized_image_returns_422_and_does_not_update_database(): void
    {
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')
            ->post('/api/profile/picture', [
                'image' => $this->oversizedImage(),
            ])
            ->assertStatus(422);

        $this->assertNull($guard->fresh()->profile_picture_url);
    }

    public function test_spoofed_non_image_named_jpg_returns_422(): void
    {
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')
            ->post('/api/profile/picture', [
                'image' => UploadedFile::fake()->create('avatar.jpg', 100, 'text/plain'),
            ])
            ->assertStatus(422);

        $this->assertNull($guard->fresh()->profile_picture_url);
    }

    public function test_replacing_managed_profile_picture_deletes_old_file(): void
    {
        $guard = $this->guardUser();

        $this->uploadProfilePicture($guard, $this->validImage())->assertOk();
        $firstPath = $guard->fresh()->profile_picture_url;
        $this->assertTrue(Storage::disk('public')->exists($firstPath));

        $this->uploadProfilePicture($guard->fresh(), $this->validImage('replacement.jpg'))->assertOk();
        $secondPath = $guard->fresh()->profile_picture_url;

        $this->assertNotSame($firstPath, $secondPath);
        $this->assertFalse(Storage::disk('public')->exists($firstPath));
        $this->assertTrue(Storage::disk('public')->exists($secondPath));
    }

    public function test_replacing_legacy_external_url_does_not_attempt_unsafe_file_deletion(): void
    {
        $guard = $this->guardUser();
        $legacyUrl = 'https://cdn.example.test/legacy-avatar.jpg';
        $guard->forceFill(['profile_picture_url' => $legacyUrl])->save();

        Storage::disk('public')->put('profile-pictures/should-not-delete.jpg', 'keep');

        $this->uploadProfilePicture($guard->fresh(), $this->validImage())->assertOk();

        $this->assertTrue(Storage::disk('public')->exists('profile-pictures/should-not-delete.jpg'));
        $this->assertStringStartsWith('profile-pictures/', $guard->fresh()->profile_picture_url);
    }

    public function test_deleting_managed_profile_picture_removes_file_and_writes_audit(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill(['profile_version' => 4])->save();

        $this->uploadProfilePicture($guard->fresh(), $this->validImage())->assertOk();
        $storedPath = $guard->fresh()->profile_picture_url;

        $this->actingAs($guard->fresh(), 'api')
            ->deleteJson('/api/profile/picture')
            ->assertOk()
            ->assertJsonPath('message', 'Profile picture removed successfully.')
            ->assertJsonPath('data.user.profile_picture_url', null);

        $fresh = $guard->fresh();
        $this->assertNull($fresh->profile_picture_url);
        $this->assertSame(6, $fresh->profile_version);
        $this->assertFalse(Storage::disk('public')->exists($storedPath));

        $audit = AuthAuditLog::query()
            ->where('user_id', $guard->id)
            ->where('event_type', AuthAuditService::EVENT_PROFILE_PICTURE_REMOVED)
            ->latest('occurred_at')
            ->first();

        $this->assertNotNull($audit);
        $this->assertSame(6, $audit->metadata['profile_version']);
    }

    public function test_deleting_when_no_picture_exists_is_idempotent(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill(['profile_version' => 3, 'profile_picture_url' => null])->save();

        $this->actingAs($guard->fresh(), 'api')
            ->deleteJson('/api/profile/picture')
            ->assertOk()
            ->assertJsonPath('data.user.profile_picture_url', null);

        $this->assertSame(3, $guard->fresh()->profile_version);

        $this->assertDatabaseMissing('auth_audit_logs', [
            'user_id' => $guard->id,
            'event_type' => AuthAuditService::EVENT_PROFILE_PICTURE_REMOVED,
        ]);
    }

    public function test_deleting_external_legacy_url_clears_database_without_file_deletion(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill([
            'profile_picture_url' => 'https://cdn.example.test/avatar.jpg',
            'profile_version' => 2,
        ])->save();

        $this->actingAs($guard->fresh(), 'api')
            ->deleteJson('/api/profile/picture')
            ->assertOk()
            ->assertJsonPath('data.user.profile_picture_url', null);

        $this->assertNull($guard->fresh()->profile_picture_url);
        $this->assertSame(3, $guard->fresh()->profile_version);
    }

    public function test_auth_me_returns_resolved_public_profile_picture_url_after_upload(): void
    {
        $guard = $this->guardUser();

        $this->uploadProfilePicture($guard, $this->validImage())->assertOk();
        $storedPath = $guard->fresh()->profile_picture_url;

        $meResponse = $this->actingAs($guard->fresh(), 'api')
            ->getJson('/api/auth/me')
            ->assertOk();

        $publicUrl = $meResponse->json('data.user.profile_picture_url');
        $expectedPublicUrl = '/storage/'.$storedPath;

        $this->assertIsString($publicUrl);
        $this->assertSame($expectedPublicUrl, $publicUrl);
        $this->assertNotSame($storedPath, $publicUrl);
        $this->assertStringNotContainsString(storage_path(), $publicUrl);
    }

    public function test_legacy_absolute_localhost_storage_url_is_normalized_to_relative_path(): void
    {
        $guard = $this->guardUser();
        $legacyUrl = 'http://localhost/storage/profile-pictures/legacy/avatar.jpg';
        $guard->forceFill(['profile_picture_url' => $legacyUrl])->save();

        $response = $this->actingAs($guard->fresh(), 'api')
            ->getJson('/api/profile')
            ->assertOk();

        $this->assertSame('/storage/profile-pictures/legacy/avatar.jpg', $response->json('data.user.profile_picture_url'));
    }

    public function test_resolved_profile_picture_url_matches_existing_managed_file(): void
    {
        $guard = $this->guardUser();

        $this->uploadProfilePicture($guard, $this->validImage())->assertOk();
        $storedPath = $guard->fresh()->profile_picture_url;

        $resolver = app(\App\Support\Profile\ProfilePictureUrlResolver::class);
        $this->assertTrue($resolver->fileExists($storedPath));
        $this->assertSame('/storage/'.$storedPath, $resolver->resolvePublicUrl($storedPath));
    }

    public function test_upload_and_delete_do_not_expose_secrets(): void
    {
        $guard = $this->guardUser();
        $guard->forceFill([
            'password' => 'secret-password',
            'two_factor_secret' => 'JBSWY3DPEHPK3PXP',
        ])->save();

        $uploadPayload = json_encode(
            $this->uploadProfilePicture($guard->fresh(), $this->validImage())->assertOk()->json()
        );

        $this->assertStringNotContainsString('secret-password', $uploadPayload);
        $this->assertStringNotContainsString('JBSWY3DPEHPK3PXP', $uploadPayload);
        $this->assertStringNotContainsString('deleted_at', $uploadPayload);

        $deletePayload = json_encode(
            $this->actingAs($guard->fresh(), 'api')
                ->deleteJson('/api/profile/picture')
                ->assertOk()
                ->json()
        );

        $this->assertStringNotContainsString('secret-password', $deletePayload);
        $this->assertStringNotContainsString('JBSWY3DPEHPK3PXP', $deletePayload);
        $this->assertStringNotContainsString('deleted_at', $deletePayload);
    }

    private function validImage(string $name = 'avatar.jpg'): UploadedFile
    {
        $temp = tempnam(sys_get_temp_dir(), 'profile-pic-test-');
        copy(base_path('tests/Fixtures/minimal.jpg'), $temp);

        return new UploadedFile($temp, $name, 'image/jpeg', UPLOAD_ERR_OK, true);
    }

    private function oversizedImage(): UploadedFile
    {
        $temp = tempnam(sys_get_temp_dir(), 'profile-large-');
        copy(base_path('tests/Fixtures/minimal.jpg'), $temp);
        file_put_contents($temp, str_repeat("\0", 2049 * 1024), FILE_APPEND);

        return new UploadedFile($temp, 'large.jpg', 'image/jpeg', UPLOAD_ERR_OK, true);
    }

    private function uploadProfilePicture(User $user, UploadedFile $file)
    {
        return $this->actingAs($user, 'api')
            ->withHeaders(['Accept' => 'application/json'])
            ->post('/api/profile/picture', [
                'image' => $file,
            ]);
    }
}
