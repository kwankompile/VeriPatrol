<?php

namespace Tests\Feature;

use App\Events\Patrol\PatrolCheckpointSuspicious;
use App\Events\Patrol\PatrolRouteUpdated;
use App\Events\Patrol\PatrolSessionStarted;
use App\Events\Patrol\PatrolValidationCompleted;
use App\Models\CheckpointEvent;
use App\Models\PatrolRoute;
use App\Models\PatrolSession;
use App\Models\User;
use App\Services\PatrolBroadcastService;
use App\Services\PatrolValidationService;
use Carbon\Carbon;
use Database\Seeders\RoleSeeder;
use Illuminate\Broadcasting\BroadcastException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Mockery;
use RuntimeException;
use Tests\Concerns\CreatesPatrolFixtures;
use Tests\TestCase;

class PatrolBroadcastTest extends TestCase
{
    use CreatesPatrolFixtures;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_session_started_dispatches_when_broadcasting_enabled(): void
    {
        Config::set('broadcasting.default', 'reverb');
        Event::fake([PatrolSessionStarted::class]);

        $session = PatrolSession::factory()->create();
        app(PatrolBroadcastService::class)->sessionStarted($session);

        Event::assertDispatched(PatrolSessionStarted::class);
    }

    public function test_route_creation_does_not_fail_when_broadcasting_disabled(): void
    {
        Config::set('broadcasting.default', 'null');
        Event::fake();

        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-routes', [
                'patrol_session_id' => $patrol->id,
                'latitude' => 3.139,
                'longitude' => 101.6869,
            ])
            ->assertCreated();

        Event::assertNotDispatched(PatrolRouteUpdated::class);
    }

    public function test_validation_completion_does_not_fail_when_broadcasting_disabled(): void
    {
        Config::set('broadcasting.default', 'null');
        Event::fake();

        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        Event::assertNotDispatched(PatrolValidationCompleted::class);
    }

    public function test_checkpoint_suspicious_broadcast_does_not_fail_when_broadcasting_disabled(): void
    {
        Config::set('broadcasting.default', 'null');
        Event::fake();

        $patrol = PatrolSession::factory()->create();
        $event = CheckpointEvent::factory()->create([
            'patrol_session_id' => $patrol->id,
            'status' => 'suspicious',
        ]);

        app(PatrolBroadcastService::class)->checkpointUpdated($event->fresh());

        Event::assertNotDispatched(PatrolCheckpointSuspicious::class);
    }

    public function test_route_updated_service_does_not_throw_when_broadcasting_disabled(): void
    {
        Config::set('broadcasting.default', 'null');

        $route = PatrolRoute::factory()->create();

        app(PatrolBroadcastService::class)->routeUpdated($route);

        $this->assertTrue(true);
    }

    public function test_validation_completed_broadcasts_compact_payload_without_large_arrays(): void
    {
        Config::set('broadcasting.default', 'reverb');
        Event::fake([PatrolValidationCompleted::class]);

        $session = PatrolSession::factory()->create();
        $largeResult = $this->largeValidationResultFixture((string) $session->id);

        app(PatrolBroadcastService::class)->validationCompleted($session, $largeResult);

        Event::assertDispatched(PatrolValidationCompleted::class, function (PatrolValidationCompleted $event) use ($session, $largeResult) {
            $payload = $event->broadcastWith();

            $this->assertSame((string) $session->id, $payload['patrol_session_id']);
            $this->assertSame([
                'summary' => true,
                'checkpoint_events' => true,
                'session' => true,
            ], $payload['refresh']);

            $validation = $payload['validation'];
            $this->assertSame('completed', $validation['status']);
            $this->assertArrayHasKey('validated_at', $validation);
            $this->assertArrayNotHasKey('checkpoint_results', $validation);
            $this->assertArrayNotHasKey('anomalies', $validation);

            $encoded = json_encode($payload, JSON_THROW_ON_ERROR);
            $this->assertLessThan(9 * 1024, strlen($encoded));

            return true;
        });
    }

    public function test_validate_endpoint_returns_full_result_while_broadcast_is_compact(): void
    {
        Config::set('broadcasting.default', 'reverb');
        Event::fake([PatrolValidationCompleted::class]);

        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();

        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $response = $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertNotEmpty($response->json('data.checkpoint_results'));
        $this->assertArrayHasKey('anomalies', $response->json('data'));

        Event::assertDispatched(PatrolValidationCompleted::class, function (PatrolValidationCompleted $event) {
            $payload = $event->broadcastWith();

            $this->assertArrayNotHasKey('checkpoint_results', $payload['validation']);
            $this->assertArrayNotHasKey('anomalies', $payload['validation']);

            return true;
        });
    }

    public function test_validation_completed_catches_broadcast_exception_at_service_level(): void
    {
        $this->registerThrowingBroadcaster();
        Log::spy();

        $session = PatrolSession::factory()->create();
        $largeResult = $this->largeValidationResultFixture((string) $session->id);

        app(PatrolBroadcastService::class)->validationCompleted($session, $largeResult);

        Log::shouldHaveReceived('warning')
            ->once()
            ->with('Patrol validation broadcast failed.', [
                'patrol_session_id' => (string) $session->id,
                'event' => 'PatrolValidationCompleted',
            ]);
    }

    public function test_validate_endpoint_succeeds_when_broadcaster_throws(): void
    {
        $this->registerThrowingBroadcaster();
        Log::spy();

        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Patrol session validation completed.');

        Log::shouldHaveReceived('warning')
            ->once()
            ->with('Patrol validation broadcast failed.', [
                'patrol_session_id' => (string) $patrol->id,
                'event' => 'PatrolValidationCompleted',
            ]);
    }

    public function test_validate_endpoint_still_fails_when_validation_service_throws(): void
    {
        Config::set('broadcasting.default', 'null');

        $user = User::factory()->create();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);

        $this->mock(PatrolValidationService::class, function ($mock) {
            $mock->shouldReceive('validatePatrolSession')
                ->once()
                ->andThrow(new RuntimeException('Validation engine failure'));
        });

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertStatus(500)
            ->assertJsonPath('success', false);
    }

    /**
     * @return array<string, mixed>
     */
    protected function largeValidationResultFixture(string $patrolSessionId): array
    {
        return [
            'patrol_session_id' => $patrolSessionId,
            'total_location_logs' => 500,
            'total_segments' => 200,
            'total_gaps' => 50,
            'anomalies' => [
                'items' => array_map(
                    fn (int $index) => [
                        'type' => 'gps_gap',
                        'detail' => str_repeat('x', 256),
                        'index' => $index,
                    ],
                    range(1, 500)
                ),
            ],
            'checkpoint_results' => array_map(
                fn (int $index) => [
                    'checkpoint_id' => $index,
                    'checkpoint_name' => 'Checkpoint '.$index,
                    'status' => 'verified',
                    'confidence_score' => 95.5,
                    'distance_score' => 1.0,
                    'accuracy_score' => 1.0,
                    'time_score' => 1.0,
                    'stability_score' => 1.0,
                ],
                range(1, 200)
            ),
        ];
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
