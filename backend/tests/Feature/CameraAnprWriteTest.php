<?php

namespace Tests\Feature;

use App\Jobs\AnchorBlockchainRecordJob;
use App\Models\AnprEvent;
use App\Models\AnprImage;
use App\Models\BlockchainRecord;
use App\Models\Camera;
use App\Models\User;
use App\Models\Vehicle;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Hash;
use Tests\Concerns\AuthenticatesCameras;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\Concerns\EnablesTwoFactorAuth;
use Tests\TestCase;

class CameraAnprWriteTest extends TestCase
{
    use AuthenticatesCameras;
    use CreatesPatrolUsers;
    use EnablesTwoFactorAuth;
    use RefreshDatabase;

    private string $imageRoot;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->imageRoot = storage_path('framework/testing/camera-anpr-write');
        File::ensureDirectoryExists($this->imageRoot);
        config(['anpr.image_roots' => [$this->imageRoot]]);

        config([
            'jwt.secret' => 'test-jwt-secret-key-for-camera-anpr-write-tests',
            'auth_security.password_min_length' => 12,
            'auth_security.camera_token_ttl_minutes' => 60,
            'blockchain.enabled' => false,
        ]);
    }

    protected function tearDown(): void
    {
        if (File::isDirectory($this->imageRoot)) {
            File::deleteDirectory($this->imageRoot);
        }

        parent::tearDown();
    }

    public function test_camera_token_creates_anpr_event_without_camera_id(): void
    {
        $camera = $this->createLoginReadyCamera(['last_seen_at' => null]);
        $token = $this->cameraAccessToken($camera);

        $response = $this->withCameraToken($token)
            ->postJson('/api/anpr-events', $this->cameraAnprEventPayload([
                'plate_number' => 'ABC-5678',
            ]))
            ->assertCreated()
            ->assertJsonPath('data.camera_id', $camera->id)
            ->assertJsonPath('data.plate_number', 'ABC5678');

        $this->assertDatabaseHas('anpr_events', [
            'id' => $response->json('data.id'),
            'camera_id' => $camera->id,
            'plate_number' => 'ABC5678',
        ]);

        $this->assertNotNull($camera->fresh()->last_seen_at);
    }

    public function test_camera_token_cannot_create_event_for_another_camera(): void
    {
        $camera = $this->createLoginReadyCamera();
        $otherCamera = $this->createLoginReadyCamera(['name' => 'Other Camera']);
        $token = $this->cameraAccessToken($camera);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-events', $this->cameraAnprEventPayload([
                'camera_id' => $otherCamera->id,
            ]))
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');
    }

    public function test_camera_event_store_auto_links_vehicle(): void
    {
        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-events', $this->cameraAnprEventPayload([
                'plate_number' => 'XYZ-9900',
            ]))
            ->assertCreated()
            ->assertJsonPath('data.vehicle.plate_number', 'XYZ9900')
            ->assertJsonPath('data.vehicle.source', 'auto_detected');

        $this->assertDatabaseCount('vehicles', 1);
        $this->assertDatabaseHas('vehicles', [
            'plate_number' => 'XYZ9900',
            'source' => 'auto_detected',
        ]);
    }

    public function test_camera_event_store_sets_is_flagged_from_linked_vehicle(): void
    {
        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);

        Vehicle::factory()->create([
            'plate_number' => 'FLAG001',
            'status' => 'flagged',
        ]);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-events', $this->cameraAnprEventPayload([
                'plate_number' => 'flag-001',
            ]))
            ->assertCreated()
            ->assertJsonPath('data.is_flagged', true);
    }

    public function test_camera_event_store_creates_blockchain_record_when_enabled(): void
    {
        Bus::fake();
        config(['blockchain.enabled' => true]);

        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);

        $response = $this->withCameraToken($token)
            ->postJson('/api/anpr-events', $this->cameraAnprEventPayload([
                'plate_number' => 'BCM2001',
            ]))
            ->assertCreated();

        $eventId = $response->json('data.id');

        $this->assertDatabaseHas('blockchain_records', [
            'entity_type' => 'anpr_event',
            'entity_id' => $eventId,
            'proof_type' => 'entity_created',
        ]);

        Bus::assertDispatched(AnchorBlockchainRecordJob::class);
    }

    public function test_camera_token_uploads_valid_image_for_own_event(): void
    {
        $camera = $this->createLoginReadyCamera(['last_seen_at' => null]);
        $token = $this->cameraAccessToken($camera);
        $event = AnprEvent::factory()->create(['camera_id' => $camera->id]);
        $file = UploadedFile::fake()->create('full.jpg', 200, 'image/jpeg');

        $response = $this->withCameraToken($token)
            ->post("/api/anpr-events/{$event->id}/images/upload", [
                'image_type' => 'full',
                'image' => $file,
            ])
            ->assertOk()
            ->assertJsonPath('data.anpr_event_id', $event->id)
            ->assertJsonPath('data.image_type', 'full');

        $this->assertDatabaseHas('anpr_images', [
            'id' => $response->json('data.id'),
            'anpr_event_id' => $event->id,
            'image_type' => 'full',
        ]);

        $this->assertNotNull($camera->fresh()->last_seen_at);
    }

    public function test_camera_token_receives_403_when_uploading_to_another_cameras_event(): void
    {
        $camera = $this->createLoginReadyCamera();
        $otherCamera = Camera::factory()->create();
        $token = $this->cameraAccessToken($camera);
        $event = AnprEvent::factory()->create(['camera_id' => $otherCamera->id]);
        $file = UploadedFile::fake()->create('full.jpg', 200, 'image/jpeg');

        $this->withCameraToken($token)
            ->post("/api/anpr-events/{$event->id}/images/upload", [
                'image_type' => 'full',
                'image' => $file,
            ])
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');
    }

    public function test_camera_token_image_upload_rejects_invalid_image_type(): void
    {
        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);
        $event = AnprEvent::factory()->create(['camera_id' => $camera->id]);
        $file = UploadedFile::fake()->create('full.jpg', 200, 'image/jpeg');

        $this->withCameraToken($token)
            ->post("/api/anpr-events/{$event->id}/images/upload", [
                'image_type' => 'invalid',
                'image' => $file,
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Validation failed.');
    }

    public function test_camera_token_can_store_image_metadata_for_own_event(): void
    {
        $camera = $this->createLoginReadyCamera(['last_seen_at' => null]);
        $token = $this->cameraAccessToken($camera);
        $event = AnprEvent::factory()->create(['camera_id' => $camera->id]);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-images', [
                'anpr_event_id' => $event->id,
                'image_type' => 'plate',
                'file_path' => 'events/'.$event->id.'/plate.jpg',
            ])
            ->assertCreated()
            ->assertJsonPath('data.anpr_event_id', $event->id)
            ->assertJsonPath('data.image_type', 'plate');

        $this->assertNotNull($camera->fresh()->last_seen_at);
    }

    public function test_camera_token_receives_403_for_another_cameras_image_metadata(): void
    {
        $camera = $this->createLoginReadyCamera();
        $otherCamera = Camera::factory()->create();
        $token = $this->cameraAccessToken($camera);
        $event = AnprEvent::factory()->create(['camera_id' => $otherCamera->id]);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-images', [
                'anpr_event_id' => $event->id,
                'image_type' => 'plate',
                'file_path' => 'events/'.$event->id.'/plate.jpg',
            ])
            ->assertForbidden();
    }

    public function test_camera_token_creates_event_log_for_own_event(): void
    {
        $camera = $this->createLoginReadyCamera(['last_seen_at' => null]);
        $token = $this->cameraAccessToken($camera);
        $event = AnprEvent::factory()->create(['camera_id' => $camera->id]);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-event-logs', [
                'anpr_event_id' => $event->id,
                'stage' => 'detection',
                'message' => 'Plate captured.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.anpr_event_id', $event->id)
            ->assertJsonPath('data.stage', 'detection');

        $this->assertNotNull($camera->fresh()->last_seen_at);
    }

    public function test_camera_token_receives_403_for_another_cameras_event_log(): void
    {
        $camera = $this->createLoginReadyCamera();
        $otherCamera = Camera::factory()->create();
        $token = $this->cameraAccessToken($camera);
        $event = AnprEvent::factory()->create(['camera_id' => $otherCamera->id]);

        $this->withCameraToken($token)
            ->postJson('/api/anpr-event-logs', [
                'anpr_event_id' => $event->id,
                'stage' => 'detection',
                'message' => 'Should be blocked.',
            ])
            ->assertForbidden();
    }

    public function test_camera_heartbeat_post_updates_last_seen_at(): void
    {
        $camera = $this->createLoginReadyCamera(['last_seen_at' => null]);
        $token = $this->cameraAccessToken($camera);

        $this->withCameraToken($token)
            ->postJson('/api/camera-auth/heartbeat')
            ->assertOk()
            ->assertJsonPath('data.camera_id', $camera->id)
            ->assertJsonStructure(['data' => ['last_seen_at']]);

        $this->assertNotNull($camera->fresh()->last_seen_at);
    }

    public function test_camera_token_is_rejected_from_user_admin_routes(): void
    {
        $token = $this->cameraAccessToken();

        foreach ([
            ['GET', '/api/profile'],
            ['GET', '/api/users'],
            ['GET', '/api/blockchain-records'],
            ['GET', '/api/patrol-sessions'],
            ['GET', '/api/cameras'],
        ] as [$method, $uri]) {
            $this->withCameraToken($token)
                ->json($method, $uri)
                ->assertUnauthorized();
        }
    }

    public function test_admin_user_can_still_create_anpr_events_with_camera_id(): void
    {
        $admin = $this->adminUser();
        $camera = Camera::factory()->create();

        $this->actingAs($admin, 'api')
            ->postJson('/api/anpr-events', [
                'camera_id' => $camera->id,
                'plate_number' => 'ADM1001',
                'confidence' => 0.9,
                'detection_time' => now()->toIso8601String(),
                'is_valid' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.camera_id', $camera->id)
            ->assertJsonPath('data.plate_number', 'ADM1001');
    }

    public function test_normal_user_login_still_requires_otp(): void
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
            ->assertJsonPath('data.next_step', 'otp_required');
    }

    public function test_camera_image_upload_blockchain_proof_when_enabled(): void
    {
        Bus::fake();
        config(['blockchain.enabled' => true]);

        $camera = $this->createLoginReadyCamera();
        $token = $this->cameraAccessToken($camera);
        $event = AnprEvent::factory()->create(['camera_id' => $camera->id]);
        $file = UploadedFile::fake()->create('plate.jpg', 200, 'image/jpeg');

        $response = $this->withCameraToken($token)
            ->post("/api/anpr-events/{$event->id}/images/upload", [
                'image_type' => 'plate',
                'image' => $file,
            ])
            ->assertOk();

        $imageId = $response->json('data.id');

        $this->assertDatabaseHas('blockchain_records', [
            'entity_type' => 'anpr_image',
            'entity_id' => $imageId,
            'proof_type' => 'evidence_file',
        ]);

        Bus::assertDispatched(AnchorBlockchainRecordJob::class);
    }
}
