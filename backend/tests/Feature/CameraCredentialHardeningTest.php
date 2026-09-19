<?php

namespace Tests\Feature;

use App\Models\Camera;
use App\Support\LegacyCameraCredentialSanitizer;
use Database\Seeders\CameraSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class CameraCredentialHardeningTest extends TestCase
{
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-camera-hardening-tests',
            'auth_security.password_min_length' => 12,
        ]);
    }

    public function test_camera_seeder_does_not_persist_plaintext_passwords(): void
    {
        $this->seed(CameraSeeder::class);

        $cameras = Camera::query()->get();

        $this->assertNotEmpty($cameras);

        foreach ($cameras as $camera) {
            $this->assertNull($camera->password);
            $this->assertFalse($camera->credential_enabled);
            $this->assertNull($camera->email);
        }
    }

    public function test_legacy_plaintext_passwords_are_sanitized_to_null(): void
    {
        $camera = Camera::factory()->create();

        DB::table('cameras')->where('id', $camera->id)->update([
            'password' => 'plaintext-rtsp-password',
            'credential_enabled' => true,
        ]);

        LegacyCameraCredentialSanitizer::sanitize();

        $camera->refresh();

        $this->assertNull($camera->password);
        $this->assertFalse($camera->credential_enabled);
    }

    public function test_legacy_plaintext_passwords_are_not_login_capable(): void
    {
        $camera = Camera::factory()->create([
            'email' => 'legacy@cameras.local',
            'credential_enabled' => true,
            'is_active' => true,
        ]);

        DB::table('cameras')->where('id', $camera->id)->update([
            'password' => 'plaintext-rtsp-password',
        ]);

        LegacyCameraCredentialSanitizer::sanitize();

        $this->postJson('/api/camera-auth/login', [
            'email' => 'legacy@cameras.local',
            'password' => 'plaintext-rtsp-password',
        ])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Invalid credentials.');
    }

    public function test_bcrypt_passwords_survive_sanitization(): void
    {
        $camera = Camera::factory()->withCredentials('CameraPassword1!')->create();
        $originalHash = $camera->password;

        LegacyCameraCredentialSanitizer::sanitize();

        $camera->refresh();

        $this->assertSame($originalHash, $camera->password);
        $this->assertTrue(LegacyCameraCredentialSanitizer::isBcryptHash($camera->password));
    }

    public function test_camera_resource_masks_embedded_rtsp_credentials(): void
    {
        $camera = Camera::factory()->create([
            'rtsp_url' => 'rtsp://admin:secretpass@192.168.1.11:554/stream1',
        ]);

        $response = $this->actingAs($this->adminUser(), 'api')
            ->getJson('/api/cameras/'.$camera->id);

        $response->assertOk()
            ->assertJsonPath('data.rtsp_url', 'rtsp://192.168.1.11:554/stream1')
            ->assertJsonPath('data.rtsp_url_masked', 'rtsp://192.168.1.11:554/stream1');

        $encoded = json_encode($response->json());
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString('secretpass', $encoded);
        $this->assertStringNotContainsString('admin:secretpass', $encoded);
    }

    public function test_camera_resource_does_not_expose_password_hash(): void
    {
        $camera = Camera::factory()->withCredentials()->create([
            'rtsp_url' => 'rtsp://192.168.1.50:554/stream1',
        ]);

        $response = $this->actingAs($this->adminUser(), 'api')
            ->getJson('/api/cameras/'.$camera->id);

        $response->assertOk();

        $encoded = json_encode($response->json());
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString('$2y$', $encoded);
        $this->assertArrayNotHasKey('password', $response->json('data'));
    }
}
