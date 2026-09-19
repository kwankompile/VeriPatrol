<?php

namespace Tests\Feature;

use App\Models\Camera;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class CameraCrudTest extends TestCase
{
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        config([
            'auth_security.password_min_length' => 12,
        ]);
    }

    public function test_migration_supports_camera_credential_fields(): void
    {
        $this->assertTrue(Schema::hasColumn('cameras', 'email'));
        $this->assertTrue(Schema::hasColumn('cameras', 'credential_enabled'));
        $this->assertTrue(Schema::hasColumn('cameras', 'last_login_at'));
        $this->assertTrue(Schema::hasColumn('cameras', 'rtsp_reported_at'));
        $this->assertTrue(Schema::hasColumn('cameras', 'credential_rotated_at'));
    }

    public function test_camera_factory_can_create_cameras_with_credentials(): void
    {
        $camera = Camera::factory()->withCredentials()->create([
            'name' => 'Gate Camera',
        ]);

        $this->assertNotNull($camera->email);
        $this->assertTrue($camera->credential_enabled);
        $this->assertNotNull($camera->password);
    }

    public function test_camera_model_hides_password_in_json(): void
    {
        $camera = Camera::factory()->withCredentials()->create();

        $json = $camera->toArray();

        $this->assertArrayNotHasKey('password', $json);
    }

    public function test_admin_camera_list_does_not_leak_password_hash(): void
    {
        Camera::factory()->withCredentials()->create();

        $response = $this->actingAs($this->adminUser(), 'api')
            ->getJson('/api/cameras');

        $response->assertOk();
        $encoded = json_encode($response->json());
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString('CameraPassword1!', $encoded);
        $this->assertStringNotContainsString('$2y$', $encoded);
    }

    public function test_admin_can_create_camera_with_credentials(): void
    {
        $response = $this->actingAs($this->adminUser(), 'api')
            ->postJson('/api/cameras', [
                'name' => 'Gate Camera 1',
                'email' => 'gate-cam-1@cameras.local',
                'password' => 'StrongCameraPass1!',
                'credential_enabled' => true,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.name', 'Gate Camera 1')
            ->assertJsonPath('data.email', 'gate-cam-1@cameras.local')
            ->assertJsonPath('data.credential_enabled', true)
            ->assertJsonMissing(['password' => true]);

        $camera = Camera::query()->where('email', 'gate-cam-1@cameras.local')->first();
        $this->assertNotNull($camera);
        $this->assertTrue(Hash::check('StrongCameraPass1!', (string) $camera->password));
    }

    public function test_invalid_email_returns_422_on_create(): void
    {
        $this->actingAs($this->adminUser(), 'api')
            ->postJson('/api/cameras', [
                'name' => 'Gate Camera',
                'email' => 'not-an-email',
                'password' => 'StrongCameraPass1!',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Validation failed.');
    }

    public function test_duplicate_email_returns_422_on_create(): void
    {
        Camera::factory()->withCredentials()->create(['email' => 'duplicate@cameras.local']);

        $this->actingAs($this->adminUser(), 'api')
            ->postJson('/api/cameras', [
                'name' => 'Another Camera',
                'email' => 'duplicate@cameras.local',
                'password' => 'StrongCameraPass1!',
            ])
            ->assertUnprocessable();
    }

    public function test_missing_create_password_returns_422(): void
    {
        $this->actingAs($this->adminUser(), 'api')
            ->postJson('/api/cameras', [
                'name' => 'Gate Camera',
                'email' => 'gate@cameras.local',
            ])
            ->assertUnprocessable();
    }

    public function test_admin_update_with_empty_password_keeps_existing_hash(): void
    {
        $camera = Camera::factory()->withCredentials('OriginalCameraPass1!')->create();
        $originalHash = $camera->password;

        $this->actingAs($this->adminUser(), 'api')
            ->patchJson('/api/cameras/'.$camera->id, [
                'password' => '',
                'name' => 'Updated Name',
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Updated Name');

        $camera->refresh();
        $this->assertSame($originalHash, $camera->password);
    }

    public function test_admin_update_with_new_password_rotates_hash(): void
    {
        $camera = Camera::factory()->withCredentials('OriginalCameraPass1!')->create();
        $originalHash = $camera->password;

        $this->actingAs($this->adminUser(), 'api')
            ->patchJson('/api/cameras/'.$camera->id, [
                'password' => 'NewCameraPassword1!',
            ])
            ->assertOk();

        $camera->refresh();
        $this->assertNotSame($originalHash, $camera->password);
        $this->assertTrue(Hash::check('NewCameraPassword1!', (string) $camera->password));
        $this->assertNotNull($camera->credential_rotated_at);
    }

    public function test_admin_cannot_set_rtsp_url_through_camera_crud(): void
    {
        $camera = Camera::factory()->create();

        $this->actingAs($this->adminUser(), 'api')
            ->postJson('/api/cameras', [
                'name' => 'Blocked RTSP Create',
                'email' => 'blocked@cameras.local',
                'password' => 'StrongCameraPass1!',
                'rtsp_url' => 'rtsp://192.168.1.10/stream',
            ])
            ->assertUnprocessable();

        $this->actingAs($this->adminUser(), 'api')
            ->patchJson('/api/cameras/'.$camera->id, [
                'rtsp_url' => 'rtsp://192.168.1.20/stream',
            ])
            ->assertUnprocessable();
    }

    public function test_non_admin_cannot_create_update_or_delete_cameras(): void
    {
        $camera = Camera::factory()->create();
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')
            ->getJson('/api/cameras')
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->postJson('/api/cameras', [
                'name' => 'Guard Camera',
                'email' => 'guard@cameras.local',
                'password' => 'StrongCameraPass1!',
            ])
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->patchJson('/api/cameras/'.$camera->id, ['name' => 'Renamed'])
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->deleteJson('/api/cameras/'.$camera->id)
            ->assertForbidden();
    }
}
