<?php

namespace Tests\Feature;

use App\Models\Camera;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\AuthenticatesCameras;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class CameraTokenSecurityTest extends TestCase
{
    use AuthenticatesCameras;
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-camera-token-security',
            'auth_security.password_min_length' => 12,
            'auth_security.camera_token_ttl_minutes' => 60,
        ]);
    }

    public function test_disabled_camera_token_is_rejected_from_heartbeat(): void
    {
        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);

        $camera->update(['credential_enabled' => false]);

        $this->withCameraToken($token)
            ->postJson('/api/camera-auth/heartbeat')
            ->assertForbidden()
            ->assertJsonPath('message', 'Camera access is disabled.');
    }

    public function test_disabled_camera_token_is_rejected_from_anpr_write(): void
    {
        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);

        $camera->update(['credential_enabled' => false]);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-events', $this->cameraAnprEventPayload())
            ->assertForbidden()
            ->assertJsonPath('message', 'Camera access is disabled.');
    }

    public function test_inactive_camera_token_is_rejected_from_heartbeat(): void
    {
        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);

        $camera->update(['is_active' => false]);

        $this->withCameraToken($token)
            ->postJson('/api/camera-auth/heartbeat')
            ->assertForbidden()
            ->assertJsonPath('message', 'Camera access is disabled.');
    }

    public function test_inactive_camera_token_is_rejected_from_anpr_write(): void
    {
        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);

        $camera->update(['is_active' => false]);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-events', $this->cameraAnprEventPayload())
            ->assertForbidden()
            ->assertJsonPath('message', 'Camera access is disabled.');
    }

    public function test_rotated_camera_credentials_invalidate_existing_token(): void
    {
        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);

        sleep(1);

        $this->actingAs($this->adminUser(), 'api')
            ->patchJson('/api/cameras/'.$camera->id, [
                'password' => 'RotatedCameraPass1!',
            ])
            ->assertOk();

        $this->withCameraToken($token)
            ->postJson('/api/camera-auth/heartbeat')
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');

        $newToken = $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => 'RotatedCameraPass1!',
        ])
            ->assertOk()
            ->json('data.access_token');

        $this->assertIsString($newToken);

        $this->withCameraToken($newToken)
            ->postJson('/api/camera-auth/heartbeat')
            ->assertOk();
    }

    public function test_camera_token_cannot_access_user_routes_when_uuid_collides_with_user(): void
    {
        $sharedId = (string) Str::uuid();
        $guardRoleId = $this->guardUser()->role_id;

        User::factory()->create([
            'id' => $sharedId,
            'role_id' => $guardRoleId,
            'setup_required' => false,
            'two_factor_enabled' => true,
        ]);

        $camera = Camera::factory()->withCredentials()->create([
            'id' => $sharedId,
            'credential_enabled' => true,
            'is_active' => true,
        ]);

        $token = $this->cameraAccessToken($camera);

        foreach ([
            '/api/profile',
            '/api/users',
            '/api/patrol-sessions',
            '/api/blockchain-records',
            '/api/cameras',
        ] as $uri) {
            $response = $this->withCameraToken($token)->getJson($uri);
            $this->assertContains(
                $response->status(),
                [401, 403],
                'Expected camera token to be rejected from '.$uri.' but got '.$response->status()
            );
        }
    }
}
