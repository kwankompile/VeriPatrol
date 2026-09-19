<?php

namespace Tests\Feature;

use App\Models\AnprEvent;
use App\Models\AnprImage;
use App\Models\AuthAuditLog;
use App\Models\BlockchainRecord;
use App\Models\Camera;
use App\Models\Checkpoint;
use App\Models\CheckpointEvent;
use App\Models\PatrolRoute;
use App\Models\PatrolSession;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\Zone;
use App\Services\Auth\AuthAuditService;
use Database\Seeders\RoleSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class DashboardSummaryTest extends TestCase
{
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
        config(['app.timezone' => 'Asia/Kuala_Lumpur']);
    }

    public function test_unauthenticated_request_returns_401(): void
    {
        $this->getJson('/api/dashboard/summary')
            ->assertUnauthorized();
    }

    public function test_setup_incomplete_user_is_blocked_by_active_user_middleware(): void
    {
        $guard = User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'setup_required' => true,
            'two_factor_enabled' => true,
        ]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertForbidden();
    }

    public function test_admin_receives_full_operational_summary(): void
    {
        $admin = $this->adminUser();
        $zone = Zone::factory()->create();
        $guard = $this->guardUser();

        PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
        ]);

        $reviewSession = PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'completed',
        ]);
        $checkpoint = Checkpoint::factory()->create(['zone_id' => $zone->id]);
        CheckpointEvent::factory()->create([
            'patrol_session_id' => $reviewSession->id,
            'checkpoint_id' => $checkpoint->id,
            'status' => 'needs_review',
        ]);

        $camera = Camera::factory()->withCredentials()->create([
            'last_seen_at' => now()->subMinute(),
            'is_active' => true,
            'credential_enabled' => true,
        ]);

        AnprEvent::factory()->create([
            'camera_id' => $camera->id,
            'detection_time' => now('Asia/Kuala_Lumpur'),
            'is_flagged' => true,
        ]);

        BlockchainRecord::factory()->create(['status' => 'failed']);
        BlockchainRecord::factory()->create(['status' => 'confirmed']);

        AuthAuditLog::query()->create([
            'event_type' => AuthAuditService::EVENT_LOGIN_PASSWORD_FAILURE,
            'status' => AuthAuditService::STATUS_FAILURE,
            'email' => 'test@example.com',
            'occurred_at' => now()->subHour(),
        ]);

        $response = $this->actingAs($admin, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.role', 'Admin')
            ->assertJsonPath('data.timezone', 'Asia/Kuala_Lumpur');

        $response->assertJsonStructure([
            'data' => [
                'summary' => [
                    'total_users',
                    'active_patrols',
                    'patrols_needing_review',
                    'today_anpr_detections',
                    'flagged_anpr_detections',
                    'camera_health' => ['online', 'recently_seen', 'offline', 'inactive', 'total'],
                    'blockchain' => ['pending', 'failed', 'confirmed', 'in_flight'],
                    'auth_alerts' => ['failed_attempts_24h', 'suspicious_events_24h'],
                ],
                'sections' => [
                    'recent_anpr_events',
                    'active_patrol_sessions',
                    'patrol_sessions_needing_review',
                    'camera_health',
                    'blockchain_health',
                    'auth_alerts',
                ],
            ],
        ]);

        $this->assertGreaterThanOrEqual(2, $response->json('data.summary.total_users'));
        $this->assertSame(1, $response->json('data.summary.active_patrols'));
        $this->assertSame(1, $response->json('data.summary.patrols_needing_review'));
        $this->assertSame(1, $response->json('data.summary.today_anpr_detections'));
        $this->assertSame(1, $response->json('data.summary.flagged_anpr_detections'));
    }

    public function test_admin_recent_anpr_events_include_vehicle_type_status_and_thumbnail(): void
    {
        $admin = $this->adminUser();

        $vehicle = Vehicle::factory()->create([
            'vehicle_type' => 'car',
            'status' => 'normal',
        ]);

        $event = AnprEvent::factory()->create([
            'vehicle_id' => $vehicle->id,
            'detection_time' => now('Asia/Kuala_Lumpur'),
            'is_flagged' => false,
            'is_valid' => true,
        ]);

        AnprImage::factory()->create([
            'anpr_event_id' => $event->id,
            'image_type' => 'plate',
        ]);

        $response = $this->actingAs($admin, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $recent = $response->json('data.sections.recent_anpr_events.0');
        $this->assertSame('car', $recent['vehicle_type']);
        $this->assertSame('valid', $recent['status']);
        $this->assertIsString($recent['plate_image_url']);
        $this->assertStringContainsString('/api/anpr-images/', $recent['plate_image_url']);
        $this->assertStringContainsString('/file', $recent['plate_image_url']);
    }

    public function test_admin_active_patrol_locations_expose_only_coordinates(): void
    {
        $admin = $this->adminUser();
        $zone = Zone::factory()->create(['name' => 'North Zone']);
        $guard = $this->guardUser();

        $session = PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
        ]);

        PatrolRoute::factory()->create([
            'patrol_session_id' => $session->id,
            'latitude' => 3.1500000,
            'longitude' => 101.6500000,
            'recorded_at' => now()->subMinute(),
        ]);

        $response = $this->actingAs($admin, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $locations = $response->json('data.sections.active_patrol_locations');
        $this->assertCount(1, $locations);
        $this->assertSame($session->id, $locations[0]['session_id']);
        $this->assertEqualsWithDelta(3.15, $locations[0]['latitude'], 0.0001);
        $this->assertEqualsWithDelta(101.65, $locations[0]['longitude'], 0.0001);
        $this->assertSame('North Zone', $locations[0]['zone_name']);
    }

    public function test_admin_blockchain_summary_includes_network(): void
    {
        config(['blockchain.network' => 'ganache', 'blockchain.enabled' => true]);

        $response = $this->actingAs($this->adminUser(), 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $this->assertSame('ganache', $response->json('data.summary.blockchain.network'));
        $this->assertTrue($response->json('data.summary.blockchain.enabled'));
        $this->assertSame('ganache', $response->json('data.sections.blockchain_health.network'));
    }

    public function test_admin_auth_alerts_include_severity(): void
    {
        $admin = $this->adminUser();

        AuthAuditLog::query()->create([
            'event_type' => AuthAuditService::EVENT_LOGIN_RATE_LIMITED,
            'status' => AuthAuditService::STATUS_BLOCKED,
            'email' => 'attacker@example.com',
            'occurred_at' => now()->subHour(),
        ]);

        $response = $this->actingAs($admin, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $alert = $response->json('data.sections.auth_alerts.0');
        $this->assertNotNull($alert);
        $this->assertSame('high', $alert['severity']);
        $this->assertArrayNotHasKey('password', $alert);
    }

    public function test_operator_receives_active_patrol_locations_but_not_admin_only_sections(): void
    {
        $operator = $this->securityOperatorUser();
        $zone = Zone::factory()->create();
        $guard = $this->guardUser();

        $session = PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
        ]);

        PatrolRoute::factory()->create([
            'patrol_session_id' => $session->id,
            'recorded_at' => now(),
        ]);

        $response = $this->actingAs($operator, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('data.role', 'Security Operator');

        $sections = $response->json('data.sections');
        $this->assertArrayHasKey('active_patrol_locations', $sections);
        $this->assertArrayNotHasKey('blockchain_health', $sections);
        $this->assertArrayNotHasKey('auth_alerts', $sections);
    }

    public function test_guard_does_not_receive_active_patrol_locations_section(): void
    {
        $guard = $this->guardUser();
        $zone = Zone::factory()->create();

        PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
            'started_at' => now('Asia/Kuala_Lumpur'),
        ]);

        $response = $this->actingAs($guard, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $sections = $response->json('data.sections');
        $this->assertArrayNotHasKey('active_patrol_locations', $sections);
        $this->assertArrayNotHasKey('recent_anpr_events', $sections);
        $this->assertArrayHasKey('recent_patrol_sessions', $sections);
    }

    public function test_security_operator_receives_monitoring_summary_without_admin_fields(): void
    {
        $operator = $this->securityOperatorUser();
        $zone = Zone::factory()->create();
        $guard = $this->guardUser();

        PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
        ]);

        AnprEvent::factory()->create([
            'detection_time' => now('Asia/Kuala_Lumpur'),
        ]);

        $response = $this->actingAs($operator, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('data.role', 'Security Operator');

        $summary = $response->json('data.summary');
        $this->assertArrayNotHasKey('total_users', $summary);
        $this->assertArrayNotHasKey('blockchain', $summary);
        $this->assertArrayNotHasKey('auth_alerts', $summary);
        $this->assertArrayHasKey('active_patrols', $summary);
        $this->assertArrayHasKey('today_anpr_detections', $summary);

        $sections = $response->json('data.sections');
        $this->assertArrayNotHasKey('blockchain_health', $sections);
        $this->assertArrayNotHasKey('auth_alerts', $sections);
        $this->assertArrayHasKey('recent_anpr_events', $sections);
    }

    public function test_guard_receives_only_own_patrol_data(): void
    {
        $guard = $this->guardUser();
        $otherGuard = $this->userWithRole('Guard');
        $zone = Zone::factory()->create();

        $ownPatrol = PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
            'started_at' => now('Asia/Kuala_Lumpur'),
        ]);

        PatrolSession::factory()->create([
            'user_id' => $otherGuard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
        ]);

        $response = $this->actingAs($guard, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('data.role', 'Guard')
            ->assertJsonPath('data.summary.has_active_patrol', true)
            ->assertJsonPath('data.summary.active_patrol_session_id', $ownPatrol->id)
            ->assertJsonPath('data.summary.today_patrol_status', 'active');

        $summary = $response->json('data.summary');
        $this->assertArrayNotHasKey('total_users', $summary);
        $this->assertArrayNotHasKey('today_anpr_detections', $summary);
        $this->assertArrayNotHasKey('camera_health', $summary);

        $sections = $response->json('data.sections');
        $this->assertArrayNotHasKey('recent_anpr_events', $sections);
        $this->assertSame($ownPatrol->id, $sections['active_patrol']['id']);

        $recentIds = collect($sections['recent_patrol_sessions'])->pluck('id')->all();
        $this->assertContains($ownPatrol->id, $recentIds);
        $this->assertNotContains(
            PatrolSession::query()->where('user_id', $otherGuard->id)->value('id'),
            $recentIds
        );
    }

    public function test_dashboard_summary_does_not_expose_secrets(): void
    {
        $admin = $this->adminUser();

        $camera = Camera::factory()->withCredentials()->create([
            'password' => bcrypt('CameraPassword1!'),
            'username' => 'rtsp-user',
            'rtsp_url' => 'rtsp://user:secret@192.168.1.1/stream',
            'last_seen_at' => now(),
        ]);

        AnprEvent::factory()->create([
            'camera_id' => $camera->id,
            'detection_time' => now('Asia/Kuala_Lumpur'),
        ]);

        BlockchainRecord::factory()->create([
            'status' => 'failed',
            'payload_summary' => ['private_key' => 'should-not-leak'],
        ]);

        $response = $this->actingAs($admin, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $encoded = json_encode($response->json());
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString('CameraPassword1!', $encoded);
        $this->assertStringNotContainsString('rtsp-user', $encoded);
        $this->assertStringNotContainsString('secret@', $encoded);
        $this->assertStringNotContainsString('private_key', $encoded);
        $this->assertStringNotContainsString('two_factor_secret', $encoded);
        $this->assertStringNotContainsString('refresh_token', $encoded);
    }

    public function test_today_anpr_counts_use_application_timezone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-07-02 01:30:00', 'Asia/Kuala_Lumpur'));

        $admin = $this->adminUser();

        AnprEvent::factory()->create([
            'detection_time' => Carbon::parse('2026-07-01 23:30:00', 'Asia/Kuala_Lumpur'),
        ]);
        AnprEvent::factory()->create([
            'detection_time' => Carbon::parse('2026-07-02 00:30:00', 'Asia/Kuala_Lumpur'),
        ]);

        $response = $this->actingAs($admin, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $this->assertSame(1, $response->json('data.summary.today_anpr_detections'));

        Carbon::setTestNow();
    }

    public function test_empty_database_returns_safe_zero_counts_and_empty_arrays(): void
    {
        $admin = $this->adminUser();

        $response = $this->actingAs($admin, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk();

        $this->assertSame(1, $response->json('data.summary.total_users'));
        $this->assertSame(0, $response->json('data.summary.active_patrols'));
        $this->assertSame(0, $response->json('data.summary.today_anpr_detections'));
        $this->assertSame([], $response->json('data.sections.recent_anpr_events'));
        $this->assertSame([], $response->json('data.sections.active_patrol_sessions'));
    }

    public function test_all_roles_receive_200_on_seeded_like_minimal_data(): void
    {
        foreach ([
            'Admin' => $this->adminUser(),
            'Security Operator' => $this->securityOperatorUser(),
            'Guard' => $this->guardUser(),
        ] as $roleName => $user) {
            $response = $this->actingAs($user, 'api')
                ->getJson('/api/dashboard/summary')
                ->assertOk()
                ->assertJsonPath('success', true)
                ->assertJsonPath('data.role', $roleName);

            $this->assertIsArray($response->json('data.summary'));
            $this->assertIsArray($response->json('data.sections'));
        }
    }

    public function test_dashboard_tolerates_legacy_cameras_table_without_credential_enabled(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'sqlite') {
            $this->markTestSkipped('Legacy camera schema simulation runs on sqlite test database only.');
        }

        if (! Schema::hasColumn('cameras', 'credential_enabled')) {
            $this->markTestSkipped('credential_enabled column already absent in test schema.');
        }

        Camera::factory()->create([
            'is_active' => true,
            'credential_enabled' => true,
            'last_seen_at' => now()->subMinute(),
        ]);

        Schema::table('cameras', function (Blueprint $table): void {
            $table->dropColumn('credential_enabled');
        });

        $response = $this->actingAs($this->adminUser(), 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSame(1, $response->json('data.summary.camera_health.total'));
        $this->assertSame(1, $response->json('data.summary.camera_health.online'));
    }

    public function test_dashboard_handles_null_and_legacy_field_values_without_500(): void
    {
        $admin = $this->adminUser();
        $zone = Zone::factory()->create();

        $camera = Camera::factory()->create([
            'last_seen_at' => null,
            'is_active' => false,
            'credential_enabled' => false,
        ]);

        PatrolSession::factory()->create([
            'user_id' => $this->guardUser()->id,
            'zone_id' => $zone->id,
            'status' => 'completed',
            'ended_at' => null,
        ]);

        AnprEvent::factory()->create([
            'camera_id' => $camera->id,
            'is_flagged' => false,
        ]);

        AuthAuditLog::query()->create([
            'event_type' => AuthAuditService::EVENT_LOGIN_PASSWORD_FAILURE,
            'status' => AuthAuditService::STATUS_FAILURE,
            'email' => null,
            'occurred_at' => now()->subHour(),
        ]);

        $response = $this->actingAs($admin, 'api')
            ->getJson('/api/dashboard/summary')
            ->assertOk()
            ->assertJsonPath('success', true);

        $recentAnpr = $response->json('data.sections.recent_anpr_events.0');
        $this->assertNotNull($recentAnpr);
        $this->assertArrayHasKey('plate_number', $recentAnpr);

        $encoded = json_encode($response->json());
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString('CameraPassword1!', $encoded);
        $this->assertStringNotContainsString('two_factor_secret', $encoded);
    }
}
