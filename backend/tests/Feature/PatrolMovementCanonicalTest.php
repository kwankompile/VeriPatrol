<?php

namespace Tests\Feature;

use App\Events\Patrol\PatrolRouteUpdated;
use App\Models\LocationLog;
use App\Models\PatrolRoute;
use App\Models\PatrolSession;
use App\Models\User;
use App\Services\PatrolMovementService;
use Carbon\Carbon;
use Database\Seeders\RoleSeeder;
use Illuminate\Broadcasting\BroadcastException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Mockery;
use Tests\Concerns\CreatesPatrolFixtures;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class PatrolMovementCanonicalTest extends TestCase
{
    use CreatesPatrolFixtures;
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_route_endpoint_returns_ordered_location_logs(): void
    {
        $user = $this->securityOperatorUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 5000, 'lat' => 3.140, 'lng' => 101.687],
            ['offset_ms' => 1000, 'lat' => 3.139, 'lng' => 101.686],
        ]);

        PatrolRoute::factory()->create([
            'patrol_session_id' => $patrol->id,
            'latitude' => 9.999,
            'longitude' => 9.999,
            'recorded_at' => Carbon::parse('2026-05-20 10:00:00'),
        ]);

        $rows = $this->actingAs($user, 'api')
            ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id)
            ->assertOk()
            ->json('data.data');

        $this->assertCount(2, $rows);
        $this->assertSame(3.139, (float) $rows[0]['latitude']);
        $this->assertSame(3.14, (float) $rows[1]['latitude']);
        $this->assertTrue(
            Carbon::parse($rows[0]['recorded_at'])->lt(Carbon::parse($rows[1]['recorded_at']))
        );
        $this->assertSame(
            PatrolMovementService::SOURCE_LOCATION_LOGS,
            app(PatrolMovementService::class)->resolveMovementSourceForSession($patrol)
        );
    }

    public function test_offline_synced_points_ordered_by_recorded_time_not_upload_time(): void
    {
        $user = $this->securityOperatorUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $earlierDeviceTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $laterDeviceTs = Carbon::parse('2026-05-20 10:05:00')->getTimestampMs();

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.14,
            'longitude' => 101.69,
            'accuracy' => 8,
            'timestamp' => $laterDeviceTs,
            'server_received_at' => Carbon::parse('2026-05-20 09:00:00'),
            'source' => 'sync',
            'tracking_state' => 'offline',
            'created_at' => Carbon::parse('2026-05-20 09:00:00'),
        ]);

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 3.139,
            'longitude' => 101.686,
            'accuracy' => 8,
            'timestamp' => $earlierDeviceTs,
            'server_received_at' => Carbon::parse('2026-05-20 11:00:00'),
            'source' => 'sync',
            'tracking_state' => 'offline',
            'created_at' => Carbon::parse('2026-05-20 11:00:00'),
        ]);

        $rows = $this->actingAs($user, 'api')
            ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id)
            ->assertOk()
            ->json('data.data');

        $this->assertCount(2, $rows);
        $this->assertSame(3.139, (float) $rows[0]['latitude']);
        $this->assertSame(3.14, (float) $rows[1]['latitude']);
    }

    public function test_location_log_create_does_not_create_patrol_route_row(): void
    {
        Config::set('broadcasting.default', 'null');
        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user, 'api')
            ->postJson('/api/location-logs', [
                'patrol_session_id' => $patrol->id,
                'user_id' => $user->id,
                'latitude' => 3.139,
                'longitude' => 101.6869,
                'accuracy' => 10,
                'timestamp' => Carbon::parse('2026-05-20 10:00:00')->getTimestampMs(),
                'source' => 'live',
                'tracking_state' => 'active',
            ])
            ->assertCreated();

        $this->assertSame(1, LocationLog::query()->where('patrol_session_id', $patrol->id)->count());
        $this->assertSame(0, PatrolRoute::query()->where('patrol_session_id', $patrol->id)->count());
    }

    public function test_pwa_sync_emits_compact_realtime_event_from_location_log(): void
    {
        Config::set('broadcasting.default', 'reverb');
        Event::fake([PatrolRouteUpdated::class]);

        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);
        $locationLogId = (string) Str::uuid();
        $timestamp = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->actingAs($user, 'api')
            ->postJson('/api/pwa/sync', [
                'type' => 'location_log',
                'locationLogId' => $locationLogId,
                'patrolId' => $patrol->id,
                'userId' => $user->id,
                'lat' => 3.139,
                'lng' => 101.6869,
                'accuracy' => 10.5,
                'timestamp' => $timestamp,
                'source' => 'live',
                'trackingState' => 'active',
            ])
            ->assertCreated();

        Event::assertDispatched(PatrolRouteUpdated::class, function (PatrolRouteUpdated $event) use ($patrol, $locationLogId) {
            $payload = $event->broadcastWith();

            $this->assertSame((string) $patrol->id, $payload['patrol_session_id']);
            $this->assertSame($locationLogId, $payload['id']);
            $this->assertSame($locationLogId, $payload['location_log_id']);
            $this->assertSame(3.139, $payload['latitude']);
            $this->assertSame(101.6869, $payload['longitude']);
            $this->assertSame(10.5, $payload['accuracy']);
            $this->assertArrayHasKey('recorded_at', $payload);
            $this->assertCount(7, $payload);

            $encoded = json_encode($payload, JSON_THROW_ON_ERROR);
            $this->assertLessThan(2 * 1024, strlen($encoded));

            return true;
        });

        $this->assertSame(0, PatrolRoute::query()->count());
    }

    public function test_location_log_persists_when_broadcast_throws(): void
    {
        $this->registerThrowingBroadcaster();
        Log::spy();

        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user, 'api')
            ->postJson('/api/location-logs', [
                'patrol_session_id' => $patrol->id,
                'user_id' => $user->id,
                'latitude' => 3.139,
                'longitude' => 101.6869,
                'accuracy' => 10,
                'timestamp' => Carbon::parse('2026-05-20 10:00:00')->getTimestampMs(),
                'source' => 'live',
                'tracking_state' => 'active',
            ])
            ->assertCreated();

        $this->assertSame(1, LocationLog::query()->where('patrol_session_id', $patrol->id)->count());
        Log::shouldHaveReceived('warning')->once();
    }

    public function test_guard_cannot_read_another_patrol_movement_via_route_endpoint(): void
    {
        $owner = $this->guardUser();
        $other = $this->guardUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $owner->id]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $owner, $baseTs, [['offset_ms' => 0]]);

        $this->actingAs($other, 'api')
            ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id)
            ->assertForbidden();

        $this->actingAs($other, 'api')
            ->getJson('/api/location-logs?patrol_session_id='.$patrol->id)
            ->assertForbidden();
    }

    public function test_legacy_session_without_location_logs_falls_back_to_patrol_routes(): void
    {
        $user = $this->securityOperatorUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        PatrolRoute::factory()->create([
            'patrol_session_id' => $patrol->id,
            'latitude' => 3.2,
            'longitude' => 101.7,
            'recorded_at' => Carbon::parse('2026-05-20 10:00:00'),
        ]);

        $rows = $this->actingAs($user, 'api')
            ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id)
            ->assertOk()
            ->json('data.data');

        $this->assertCount(1, $rows);
        $this->assertSame(3.2, (float) $rows[0]['latitude']);
        $this->assertSame(
            PatrolMovementService::SOURCE_LEGACY_PATROL_ROUTES,
            app(PatrolMovementService::class)->resolveMovementSourceForSession($patrol)
        );
    }

    public function test_session_with_both_tables_uses_only_location_logs(): void
    {
        $user = $this->securityOperatorUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0, 'lat' => 3.139, 'lng' => 101.686],
        ]);
        PatrolRoute::factory()->create([
            'patrol_session_id' => $patrol->id,
            'latitude' => 1.0,
            'longitude' => 1.0,
            'recorded_at' => Carbon::parse('2026-05-20 10:00:00'),
        ]);

        $rows = $this->actingAs($user, 'api')
            ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id)
            ->assertOk()
            ->json('data.data');

        $this->assertCount(1, $rows);
        $this->assertSame(3.139, (float) $rows[0]['latitude']);
    }

    public function test_invalid_coordinates_are_not_returned_as_drawable_points(): void
    {
        $user = $this->securityOperatorUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $patrol->id,
            'user_id' => $user->id,
            'latitude' => 999,
            'longitude' => 101.6869,
            'accuracy' => 10,
            'timestamp' => $baseTs,
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 1000, 'lat' => 3.139, 'lng' => 101.686],
        ]);

        $rows = $this->actingAs($user, 'api')
            ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id)
            ->assertOk()
            ->json('data.data');

        $this->assertCount(1, $rows);
        $this->assertSame(3.139, (float) $rows[0]['latitude']);
        $this->assertSame(2, LocationLog::query()->where('patrol_session_id', $patrol->id)->count());
    }

    public function test_validation_and_route_endpoint_share_canonical_movement_source(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $operator = $this->securityOperatorUser();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $routeIds = collect(
            $this->actingAs($operator, 'api')
                ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id)
                ->assertOk()
                ->json('data.data')
        )->pluck('id')->sort()->values()->all();

        $logIds = app(PatrolMovementService::class)
            ->orderedLocationLogsForSession($patrol)
            ->pluck('id')
            ->sort()
            ->values()
            ->all();

        $this->assertSame($logIds, $routeIds);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk()
            ->assertJsonPath('data.total_location_logs', 3);
    }

    public function test_backfill_command_is_idempotent(): void
    {
        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);
        $route = PatrolRoute::factory()->create([
            'patrol_session_id' => $patrol->id,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'recorded_at' => Carbon::parse('2026-05-20 10:00:00'),
        ]);

        Artisan::call('patrol:backfill-location-logs-from-routes', [
            '--session' => $patrol->id,
            '--limit' => 10,
        ]);
        $this->assertSame(1, LocationLog::query()->where('patrol_session_id', $patrol->id)->count());

        Artisan::call('patrol:backfill-location-logs-from-routes', [
            '--session' => $patrol->id,
            '--limit' => 10,
        ]);
        $this->assertSame(1, LocationLog::query()->where('patrol_session_id', $patrol->id)->count());
        $this->assertNotNull($route->fresh());
    }

    public function test_deprecated_patrol_route_store_sets_deprecation_headers(): void
    {
        Config::set('broadcasting.default', 'null');
        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-routes', [
                'patrol_session_id' => $patrol->id,
                'latitude' => 3.139,
                'longitude' => 101.6869,
            ])
            ->assertCreated()
            ->assertHeader('Deprecation', 'true')
            ->assertJsonPath('deprecated', true);
    }

    public function test_route_endpoint_paginates_more_than_one_thousand_location_logs(): void
    {
        $user = $this->securityOperatorUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $total = 1205;
        $perPage = 500;

        $this->insertOrderedLocationLogs($patrol, $user, $baseTs, $total);

        PatrolRoute::factory()->create([
            'patrol_session_id' => $patrol->id,
            'latitude' => 9.999,
            'longitude' => 9.999,
            'recorded_at' => Carbon::parse('2026-05-20 09:00:00'),
        ]);

        $collected = [];
        $lastPage = (int) ceil($total / $perPage);

        for ($page = 1; $page <= $lastPage; $page++) {
            $response = $this->actingAs($user, 'api')
                ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id.'&per_page='.$perPage.'&page='.$page)
                ->assertOk();

            $this->assertSame($page, (int) $response->json('data.meta.current_page'));
            $this->assertSame($lastPage, (int) $response->json('data.meta.last_page'));
            $this->assertSame($total, (int) $response->json('data.meta.total'));
            $this->assertSame($perPage, (int) $response->json('data.meta.per_page'));

            $rows = $response->json('data.data');
            $this->assertNotEmpty($rows);
            $collected = array_merge($collected, $rows);
        }

        $this->assertCount($total, $collected);
        $this->assertCount($total, collect($collected)->pluck('id')->unique());

        for ($i = 1; $i < count($collected); $i++) {
            $previous = Carbon::parse($collected[$i - 1]['recorded_at']);
            $current = Carbon::parse($collected[$i]['recorded_at']);
            $this->assertTrue(
                $previous->lte($current),
                "Point {$i} is out of device-time order."
            );
        }

        $this->assertSame(3.139, (float) $collected[0]['latitude']);
        $this->assertNotSame(9.999, (float) $collected[0]['latitude']);
        $this->assertSame(
            PatrolMovementService::SOURCE_LOCATION_LOGS,
            app(PatrolMovementService::class)->resolveMovementSourceForSession($patrol)
        );
    }

    public function test_legacy_only_session_paginates_patrol_routes_fallback(): void
    {
        $user = $this->securityOperatorUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);
        $total = 12;
        $perPage = 5;

        for ($i = 0; $i < $total; $i++) {
            PatrolRoute::factory()->create([
                'patrol_session_id' => $patrol->id,
                'latitude' => 3.1 + ($i * 0.001),
                'longitude' => 101.6,
                'recorded_at' => Carbon::parse('2026-05-20 10:00:00')->addSeconds($i),
            ]);
        }

        $collected = [];
        $lastPage = (int) ceil($total / $perPage);

        for ($page = 1; $page <= $lastPage; $page++) {
            $response = $this->actingAs($user, 'api')
                ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id.'&per_page='.$perPage.'&page='.$page)
                ->assertOk();

            $this->assertSame($page, (int) $response->json('data.meta.current_page'));
            $this->assertSame($lastPage, (int) $response->json('data.meta.last_page'));
            $collected = array_merge($collected, $response->json('data.data'));
        }

        $this->assertCount($total, $collected);
        $this->assertSame(
            PatrolMovementService::SOURCE_LEGACY_PATROL_ROUTES,
            app(PatrolMovementService::class)->resolveMovementSourceForSession($patrol)
        );
    }

    /**
     * @param  positive-int  $count
     */
    protected function insertOrderedLocationLogs(
        PatrolSession $patrol,
        User $user,
        int $baseTs,
        int $count,
    ): void {
        $now = now()->toDateTimeString();
        $rows = [];

        for ($i = 0; $i < $count; $i++) {
            $rows[] = [
                'id' => (string) Str::uuid(),
                'patrol_session_id' => $patrol->id,
                'user_id' => $user->id,
                'latitude' => 3.139 + ($i * 0.000001),
                'longitude' => 101.6869,
                'accuracy' => 10,
                'timestamp' => $baseTs + ($i * 1000),
                'server_received_at' => $now,
                'source' => 'live',
                'tracking_state' => 'active',
                'speed' => null,
                'heading' => null,
                'created_at' => $now,
            ];

            if (count($rows) >= 200) {
                LocationLog::query()->insert($rows);
                $rows = [];
            }
        }

        if ($rows !== []) {
            LocationLog::query()->insert($rows);
        }
    }

    protected function registerThrowingBroadcaster(): void
    {
        Config::set('broadcasting.default', 'reverb');

        $manager = Mockery::mock($this->app->make(\Illuminate\Broadcasting\BroadcastManager::class))->makePartial();
        $manager->shouldReceive('event')
            ->andThrow(new BroadcastException('Payload too large.'));

        $this->app->instance(\Illuminate\Broadcasting\BroadcastManager::class, $manager);
    }
}
