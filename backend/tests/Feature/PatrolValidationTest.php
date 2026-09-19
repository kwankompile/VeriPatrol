<?php

namespace Tests\Feature;

use App\Models\Checkpoint;
use App\Models\CheckpointEvent;
use App\Models\CheckpointEventMetric;
use App\Models\LocationLog;
use App\Models\PatrolSession;
use App\Models\User;
use App\Models\Zone;
use App\Services\PatrolValidationService;
use Carbon\Carbon;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\Concerns\CreatesPatrolFixtures;
use Tests\TestCase;

class PatrolValidationTest extends TestCase
{
    use CreatesPatrolFixtures;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_continuous_checkpoint_stay_at_least_three_seconds_becomes_verified(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        $this->assertSame('verified', $result['checkpoint_results'][0]['status']);
        $this->assertSame('continuous', $result['checkpoint_results'][0]['detection_type']);
        $this->assertGreaterThanOrEqual(80, $result['checkpoint_results'][0]['confidence_score']);
    }

    public function test_short_stay_below_three_seconds_is_missed_or_needs_review(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 1500],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        $status = $result['checkpoint_results'][0]['status'];

        $this->assertContains($status, ['missed', 'needs_review', 'partial']);
        $this->assertLessThan(80, $result['checkpoint_results'][0]['confidence_score']);
    }

    public function test_road_following_route_with_realistic_gps_noise_is_not_marked_suspicious(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $cp1 = Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'name' => 'Gate A',
            'latitude' => 3.1390,
            'longitude' => 101.6869,
            'radius' => 30,
        ]);
        $cp2 = Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'name' => 'Block B',
            'latitude' => 3.1408,
            'longitude' => 101.6885,
            'radius' => 30,
        ]);
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
            'status' => 'completed',
        ]);

        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        // Realistic patrol: dwell at CP1, walk road path, one poor-accuracy drift spike mid-route,
        // dwell at CP2. Poor GPS drift must not escalate to suspicious checkpoint status.
        $path = [
            ['offset_ms' => 0, 'lat' => 3.1390, 'lng' => 101.6869, 'accuracy' => 12],
            ['offset_ms' => 2000, 'lat' => 3.1390, 'lng' => 101.6869, 'accuracy' => 15],
            ['offset_ms' => 4000, 'lat' => 3.1391, 'lng' => 101.6870, 'accuracy' => 18],
            ['offset_ms' => 6000, 'lat' => 3.1393, 'lng' => 101.6872, 'accuracy' => 20],
            ['offset_ms' => 10000, 'lat' => 3.1396, 'lng' => 101.6875, 'accuracy' => 22],
            // Poor-accuracy drift spike (common urban multipath) — not a real teleport
            ['offset_ms' => 14000, 'lat' => 3.1405, 'lng' => 101.6883, 'accuracy' => 85],
            ['offset_ms' => 18000, 'lat' => 3.1402, 'lng' => 101.6880, 'accuracy' => 25],
            ['offset_ms' => 22000, 'lat' => 3.1405, 'lng' => 101.6882, 'accuracy' => 20],
            ['offset_ms' => 26000, 'lat' => 3.1407, 'lng' => 101.6884, 'accuracy' => 18],
            ['offset_ms' => 30000, 'lat' => 3.1408, 'lng' => 101.6885, 'accuracy' => 14],
            ['offset_ms' => 32000, 'lat' => 3.1408, 'lng' => 101.6885, 'accuracy' => 16],
            ['offset_ms' => 34000, 'lat' => 3.1408, 'lng' => 101.6885, 'accuracy' => 12],
        ];

        $this->seedLocationLogs($patrol, $user, $baseTs, $path);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        foreach ($result['checkpoint_results'] as $checkpointResult) {
            $this->assertNotSame(
                'suspicious',
                $checkpointResult['status'],
                'Checkpoint '.$checkpointResult['checkpoint_name'].' should not be suspicious for road-following patrol with GPS noise'
            );
            $this->assertContains(
                $checkpointResult['status'],
                ['verified', 'partial', 'needs_review'],
                'Checkpoint status should reflect evidence strength without punitive suspicious flag'
            );
        }

        $majorMovementAnomalies = array_filter(
            $result['anomalies']['items'] ?? [],
            fn (array $item) => in_array($item['type'], ['gps_jump', 'speed_anomaly'], true)
                && ($item['severity'] ?? '') === 'major'
        );
        $this->assertEmpty(
            $majorMovementAnomalies,
            'Poor-accuracy drift spike must not create major movement anomalies'
        );
    }

    public function test_resume_detection_inside_radius_is_partial_with_capped_confidence(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            [
                'offset_ms' => 0,
                'source' => 'resume',
                'tracking_state' => 'resumed',
            ],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        $this->assertSame('resume', $result['checkpoint_results'][0]['detection_type']);
        $this->assertContains($result['checkpoint_results'][0]['status'], ['partial', 'needs_review']);
        $this->assertLessThanOrEqual(79, $result['checkpoint_results'][0]['confidence_score']);
    }

    public function test_large_gap_reduces_gap_factor_in_checkpoint_results(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 50000],
            ['offset_ms' => 52000],
            ['offset_ms' => 54000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        $this->assertLessThan(1.0, $result['checkpoint_results'][0]['gap_factor']);
    }

    public function test_gps_jump_creates_anomaly_item(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
        ]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'accuracy' => 10,
            'timestamp' => $baseTs,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.141,
            'longitude' => 101.6969,
            'accuracy' => 10,
            'timestamp' => $baseTs + 3000,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        $jumpItems = array_filter(
            $result['anomalies']['items'] ?? [],
            fn (array $item) => $item['type'] === 'gps_jump'
        );

        $this->assertNotEmpty($jumpItems);
    }

    public function test_poor_accuracy_creates_anomaly_item(): void
    {
        ['user' => $user, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0, 'accuracy' => 80],
            ['offset_ms' => 2000, 'accuracy' => 85],
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        $items = array_filter(
            $result['anomalies']['items'] ?? [],
            fn (array $item) => $item['type'] === 'poor_accuracy'
        );

        $this->assertNotEmpty($items);
    }

    public function test_validation_upserts_checkpoint_event_metrics(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $service = app(PatrolValidationService::class);
        $service->validatePatrolSession($patrol);

        $this->assertSame(1, CheckpointEvent::query()->where('patrol_session_id', $patrol->id)->count());
        $this->assertSame(1, CheckpointEventMetric::query()->count());

        $service->validatePatrolSession($patrol);

        $this->assertSame(1, CheckpointEvent::query()->where('patrol_session_id', $patrol->id)->count());
        $this->assertSame(1, CheckpointEventMetric::query()->count());
    }

    public function test_re_running_validation_updates_existing_event_instead_of_duplicating(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $service = app(PatrolValidationService::class);
        $service->validatePatrolSession($patrol);
        $eventId = CheckpointEvent::query()
            ->where('patrol_session_id', $patrol->id)
            ->value('id');

        $service->validatePatrolSession($patrol);

        $this->assertSame(
            $eventId,
            CheckpointEvent::query()->where('patrol_session_id', $patrol->id)->value('id')
        );
    }

    public function test_validate_patrol_session_via_service_detects_continuous_checkpoint(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $checkpoint = Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'radius' => 30,
        ]);
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
            'status' => 'active',
        ]);

        $baseTs = now()->getTimestampMs();

        foreach ([0, 2000, 4000, 6000] as $offsetMs) {
            LocationLog::query()->create([
                'id' => (string) Str::uuid(),
                'patrol_session_id' => $patrol->id,
                'user_id' => $user->id,
                'latitude' => $checkpoint->latitude,
                'longitude' => $checkpoint->longitude,
                'accuracy' => 10,
                'timestamp' => $baseTs + $offsetMs,
                'server_received_at' => now(),
                'source' => 'live',
                'tracking_state' => 'active',
            ]);
        }

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        $this->assertSame(4, $result['total_location_logs']);
        $this->assertSame('verified', $result['checkpoint_results'][0]['status']);
        $this->assertSame('continuous', $result['checkpoint_results'][0]['detection_type']);

        $event = CheckpointEvent::query()
            ->where('patrol_session_id', $patrol->id)
            ->where('checkpoint_id', $checkpoint->id)
            ->first();

        $this->assertNotNull($event);
        $this->assertSame('continuous', $event->detection_type);
    }

    public function test_validate_endpoint_returns_json_envelope(): void
    {
        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Patrol session validation completed.');
    }

    public function test_validate_route_requires_authentication(): void
    {
        $patrol = PatrolSession::factory()->create();

        $this->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertUnauthorized();
    }

    public function test_validate_flags_duplicate_device_timestamps_in_movement_segment(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
        ]);

        $sharedTs = now()->getTimestampMs();

        foreach ([0, 1] as $offset) {
            LocationLog::query()->create([
                'id' => (string) Str::uuid(),
                'patrol_session_id' => $patrol->id,
                'user_id' => $user->id,
                'latitude' => 3.139 + ($offset * 0.0001),
                'longitude' => 101.6869,
                'accuracy' => 10,
                'timestamp' => $sharedTs,
                'server_received_at' => now(),
                'source' => 'live',
                'tracking_state' => 'active',
            ]);
        }

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        $duplicateIds = $result['anomalies']['timestamp_issues']['duplicate_ids'] ?? [];
        $this->assertNotEmpty($duplicateIds);

        $segmentItems = array_values(array_filter(
            $result['anomalies']['items'] ?? [],
            fn (array $item) => $item['type'] === 'timestamp_issue'
                && str_starts_with($item['id'], 'timestamp-segment-')
        ));
        $this->assertNotEmpty($segmentItems);
        $this->assertStringContainsString('Timestamp integrity issue', $segmentItems[0]['message']);
    }

    public function test_validate_returns_flat_anomaly_items_for_speed_anomaly(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
        ]);

        $baseTs = now()->getTimestampMs();

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'accuracy' => 10,
            'timestamp' => $baseTs,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.1412,
            'longitude' => 101.6895,
            'accuracy' => 10,
            'timestamp' => $baseTs + 4000,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        $items = $result['anomalies']['items'] ?? [];
        $movementItems = array_values(array_filter(
            $items,
            fn (array $item) => in_array($item['type'], ['speed_anomaly', 'gps_jump'], true)
        ));

        $this->assertNotEmpty($movementItems);
        $this->assertSame('major', $movementItems[0]['severity']);
        $this->assertArrayHasKey('start_log_id', $movementItems[0]);
        $this->assertArrayHasKey('end_latitude', $movementItems[0]);
        $this->assertArrayHasKey('speed_mps', $movementItems[0]);
    }

    public function test_poor_accuracy_spike_does_not_mark_checkpoint_suspicious(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0, 'accuracy' => 15],
            ['offset_ms' => 2000, 'accuracy' => 80],
            ['offset_ms' => 4000, 'accuracy' => 18],
            ['offset_ms' => 6000, 'accuracy' => 16],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        $this->assertNotSame('suspicious', $result['checkpoint_results'][0]['status']);
    }

    public function test_extremely_low_quality_points_are_ignored_for_movement_anomalies(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
        ]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'accuracy' => 10,
            'timestamp' => $baseTs,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.150,
            'longitude' => 101.7000,
            'accuracy' => 200,
            'timestamp' => $baseTs + 3000,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.1395,
            'longitude' => 101.6875,
            'accuracy' => 12,
            'timestamp' => $baseTs + 6000,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        $movementItems = array_filter(
            $result['anomalies']['items'] ?? [],
            fn (array $item) => in_array($item['type'], ['gps_jump', 'speed_anomaly'], true)
        );

        $this->assertEmpty($movementItems);
    }

    public function test_gps_gap_does_not_create_fake_impossible_speed(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
        ]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'accuracy' => 10,
            'timestamp' => $baseTs,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.149,
            'longitude' => 101.6969,
            'accuracy' => 10,
            'timestamp' => $baseTs + 120000,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        $speedItems = array_filter(
            $result['anomalies']['items'] ?? [],
            fn (array $item) => $item['type'] === 'speed_anomaly'
        );

        $this->assertEmpty($speedItems);
    }

    public function test_good_accuracy_impossible_jump_is_flagged(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
        ]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'accuracy' => 10,
            'timestamp' => $baseTs,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.145,
            'longitude' => 101.7100,
            'accuracy' => 12,
            'timestamp' => $baseTs + 4000,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        $jumpItems = array_filter(
            $result['anomalies']['items'] ?? [],
            fn (array $item) => $item['type'] === 'gps_jump' && $item['severity'] === 'major'
        );

        $this->assertNotEmpty($jumpItems);
    }

    public function test_no_checkpoint_evidence_becomes_missed(): void
    {
        ['user' => $user, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0, 'lat' => 3.200, 'lng' => 101.800],
            ['offset_ms' => 5000, 'lat' => 3.201, 'lng' => 101.801],
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);

        $this->assertSame('missed', $result['checkpoint_results'][0]['status']);
    }

    public function test_ordered_checkpoints_follow_created_at_then_id(): void
    {
        $zone = Zone::factory()->create();
        $older = Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'created_at' => now()->subDays(2),
        ]);
        $newer = Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'created_at' => now()->subDay(),
        ]);

        $service = app(PatrolValidationService::class);
        $reflection = new \ReflectionClass($service);
        $method = $reflection->getMethod('orderedCheckpoints');
        $method->setAccessible(true);

        $ordered = $method->invoke($service, collect([$newer, $older]));

        $this->assertSame($older->id, $ordered[0]->id);
        $this->assertSame($newer->id, $ordered[1]->id);
    }

    public function test_route_corridor_allows_points_on_segment_within_buffer(): void
    {
        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $cp1 = Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'latitude' => 3.1390,
            'longitude' => 101.6869,
            'radius' => 20,
            'created_at' => now()->subDays(2),
        ]);
        $cp2 = Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'latitude' => 3.1410,
            'longitude' => 101.6889,
            'radius' => 20,
            'created_at' => now()->subDay(),
        ]);
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
        ]);

        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $midLat = ($cp1->latitude + $cp2->latitude) / 2;
        $midLng = ($cp1->longitude + $cp2->longitude) / 2;

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0, 'lat' => $midLat, 'lng' => $midLng, 'accuracy' => 15],
            ['offset_ms' => 5000, 'lat' => $midLat + 0.00005, 'lng' => $midLng + 0.00005, 'accuracy' => 15],
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        $routeSummary = $result['anomalies']['route_corridor'] ?? [];

        $this->assertSame(0, $routeSummary['deviation_point_count'] ?? -1);
        $routeItems = array_filter(
            $result['anomalies']['items'] ?? [],
            fn (array $item) => $item['type'] === 'route_deviation'
        );
        $this->assertEmpty($routeItems);
    }

    public function test_route_corridor_flags_severe_deviation_outside_buffer(): void
    {
        config(['patrol_validation.route_corridor.min_consecutive_deviation_points' => 1]);

        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'latitude' => 3.1390,
            'longitude' => 101.6869,
            'radius' => 20,
            'created_at' => now()->subDays(2),
        ]);
        Checkpoint::factory()->create([
            'zone_id' => $zone->id,
            'latitude' => 3.1410,
            'longitude' => 101.6889,
            'radius' => 20,
            'created_at' => now()->subDay(),
        ]);
        $patrol = PatrolSession::factory()->create([
            'user_id' => $user->id,
            'zone_id' => $zone->id,
        ]);

        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0, 'lat' => 3.2000, 'lng' => 101.8000, 'accuracy' => 15],
            ['offset_ms' => 5000, 'lat' => 3.2001, 'lng' => 101.8001, 'accuracy' => 15],
            ['offset_ms' => 10000, 'lat' => 3.2002, 'lng' => 101.8002, 'accuracy' => 15],
        ]);

        $result = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        $routeSummary = $result['anomalies']['route_corridor'] ?? [];

        $this->assertGreaterThan(0, $routeSummary['deviation_point_count'] ?? 0);
        $this->assertTrue($routeSummary['severe_deviation'] ?? false);
    }
}
