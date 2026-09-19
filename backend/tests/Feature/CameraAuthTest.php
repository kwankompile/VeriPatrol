<?php

namespace Tests\Feature;

use App\Models\Camera;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class CameraAuthTest extends TestCase
{
    use CreatesPatrolUsers;
    use EnablesTwoFactorAuth;
    use RefreshDatabase;

    private const CAMERA_PASSWORD = 'CameraPassword1!';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-camera-auth-tests-32',
            'auth_security.password_min_length' => 12,
            'auth_security.camera_token_ttl_minutes' => 60,
            'auth_security.camera_login_max_attempts' => 5,
            'auth_security.camera_login_lock_minutes' => 15,
            'auth_security.access_token_ttl_minutes' => 30,
            'auth_security.refresh_cookie_name' => 'refresh_token',
            'auth_security.refresh_cookie_path' => '/api/auth',
            'auth_security.otp_challenge_ttl_minutes' => 5,
            'auth_security.otp_max_attempts' => 5,
            'auth_security.two_factor_setup_ttl_minutes' => 10,
        ]);
    }

    public function test_valid_camera_credentials_return_jwt(): void
    {
        $camera = $this->createLoginReadyCamera();

        $response = $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::CAMERA_PASSWORD,
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Camera authenticated successfully.')
            ->assertJsonStructure([
                'data' => [
                    'access_token',
                    'token_type',
                    'expires_in',
                    'camera' => ['id', 'name', 'rtsp_url'],
                ],
            ])
            ->assertJsonPath('data.token_type', 'bearer')
            ->assertJsonPath('data.expires_in', 3600)
            ->assertJsonPath('data.camera.id', $camera->id)
            ->assertJsonPath('data.camera.name', $camera->name);
    }

    public function test_camera_login_response_does_not_expose_password_or_hash(): void
    {
        $camera = $this->createLoginReadyCamera();

        $response = $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::CAMERA_PASSWORD,
        ]);

        $encoded = json_encode($response->json());
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString(self::CAMERA_PASSWORD, $encoded);
        $this->assertStringNotContainsString('$2y$', $encoded);
    }

    public function test_camera_login_updates_last_login_at(): void
    {
        $camera = $this->createLoginReadyCamera(['last_login_at' => null]);

        $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::CAMERA_PASSWORD,
        ])->assertOk();

        $this->assertNotNull($camera->fresh()->last_login_at);
    }

    public function test_camera_login_with_rtsp_url_updates_reported_fields(): void
    {
        $camera = $this->createLoginReadyCamera(['rtsp_url' => null, 'rtsp_reported_at' => null]);
        $rtspUrl = 'rtsp://192.168.1.50:554/stream1';

        $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::CAMERA_PASSWORD,
            'rtsp_url' => $rtspUrl,
        ])
            ->assertOk()
            ->assertJsonPath('data.camera.rtsp_url', $rtspUrl);

        $camera->refresh();
        $this->assertSame($rtspUrl, $camera->rtsp_url);
        $this->assertNotNull($camera->rtsp_reported_at);
    }

    public function test_invalid_camera_password_returns_safe_401(): void
    {
        $camera = $this->createLoginReadyCamera();

        $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => 'WrongPassword1!',
        ])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Invalid credentials.');
    }

    public function test_unknown_camera_email_returns_safe_401(): void
    {
        $this->postJson('/api/camera-auth/login', [
            'email' => 'missing@cameras.local',
            'password' => self::CAMERA_PASSWORD,
        ])
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Invalid credentials.');
    }

    public function test_disabled_camera_credentials_return_403(): void
    {
        $camera = $this->createLoginReadyCamera(['credential_enabled' => false]);

        $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::CAMERA_PASSWORD,
        ])
            ->assertForbidden()
            ->assertJsonPath('message', 'Camera access is disabled.');
    }

    public function test_inactive_camera_returns_403(): void
    {
        $camera = $this->createLoginReadyCamera(['is_active' => false]);

        $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::CAMERA_PASSWORD,
        ])
            ->assertForbidden()
            ->assertJsonPath('message', 'Camera access is disabled.');
    }

    public function test_camera_login_does_not_require_otp_or_issue_refresh_cookie(): void
    {
        $camera = $this->createLoginReadyCamera();

        $response = $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::CAMERA_PASSWORD,
        ]);

        $response->assertOk()
            ->assertJsonMissing(['data' => ['otp_challenge_token' => true]])
            ->assertJsonMissing(['data' => ['next_step' => 'otp_required']])
            ->assertCookieMissing('refresh_token');
    }

    public function test_normal_user_login_still_branches_through_otp_flow(): void
    {
        $user = $this->enableTwoFactor(User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'setup_required' => false,
            'password' => Hash::make('UserPassword1!'),
        ]));

        $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'UserPassword1!',
        ])
            ->assertOk()
            ->assertJsonPath('data.next_step', 'otp_required')
            ->assertJsonStructure(['data' => ['login_challenge_id']]);
    }

    public function test_camera_token_cannot_access_user_protected_routes(): void
    {
        $token = $this->cameraAccessToken();

        $protectedRoutes = [
            ['GET', '/api/profile'],
            ['GET', '/api/users'],
            ['GET', '/api/blockchain-records'],
            ['GET', '/api/patrol-sessions'],
            ['GET', '/api/cameras'],
        ];

        foreach ($protectedRoutes as [$method, $uri]) {
            $this->withHeader('Authorization', 'Bearer '.$token)
                ->json($method, $uri)
                ->assertUnauthorized();
        }
    }

    public function test_user_token_cannot_access_camera_only_heartbeat_route(): void
    {
        $admin = $this->adminUser();
        $token = auth('api')->login($admin);

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/camera-auth/heartbeat')
            ->assertUnauthorized();
    }

    public function test_camera_token_can_access_camera_only_heartbeat_route(): void
    {
        $token = $this->cameraAccessToken();
        $camera = Camera::query()->firstOrFail();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/camera-auth/heartbeat')
            ->assertOk()
            ->assertJsonPath('data.camera_id', $camera->id);
    }

    public function test_repeated_failed_camera_login_attempts_are_rate_limited(): void
    {
        $camera = $this->createLoginReadyCamera();
        $server = $this->transformHeadersToServerVars([
            'CONTENT_TYPE' => 'application/json',
            'Accept' => 'application/json',
        ]);

        for ($i = 0; $i < 4; $i++) {
            $this->call(
                'POST',
                '/api/camera-auth/login',
                [],
                [],
                [],
                array_merge($server, ['REMOTE_ADDR' => '203.0.113.50']),
                json_encode([
                    'email' => $camera->email,
                    'password' => 'WrongPassword1!',
                ]),
            )->assertUnauthorized();
        }

        $this->call(
            'POST',
            '/api/camera-auth/login',
            [],
            [],
            [],
            array_merge($server, ['REMOTE_ADDR' => '203.0.113.50']),
            json_encode([
                'email' => $camera->email,
                'password' => 'WrongPassword1!',
            ]),
        )
            ->assertStatus(429)
            ->assertJsonPath('message', 'Too many attempts. Try again later.')
            ->assertJsonStructure(['data' => ['retry_after_seconds']]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function createLoginReadyCamera(array $overrides = []): Camera
    {
        return Camera::factory()
            ->withCredentials(self::CAMERA_PASSWORD)
            ->create(array_merge([
                'name' => 'Gate Camera 1',
                'credential_enabled' => true,
                'is_active' => true,
            ], $overrides));
    }

    private function cameraAccessToken(): string
    {
        $camera = $this->createLoginReadyCamera();

        $token = $this->postJson('/api/camera-auth/login', [
            'email' => $camera->email,
            'password' => self::CAMERA_PASSWORD,
        ])->json('data.access_token');

        $this->assertIsString($token);
        $this->assertNotSame('', $token);

        return $token;
    }
}
