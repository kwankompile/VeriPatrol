<?php

namespace Tests\Feature;

use App\Models\BlockchainRecord;
use App\Models\Checkpoint;
use App\Models\CheckpointEvent;
use App\Models\CheckpointEventMetric;
use App\Models\LocationLog;
use App\Models\PatrolSession;
use App\Models\User;
use App\Models\Zone;
use Illuminate\Support\Str;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class AuthRouteGuardHardeningTest extends TestCase
{
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_unauthenticated_users_cannot_access_protected_apis(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
        $this->getJson('/api/patrol-sessions')->assertUnauthorized();
        $this->getJson('/api/anpr-events')->assertUnauthorized();
    }

    public function test_soft_deleted_users_cannot_access_protected_apis(): void
    {
        $guard = $this->guardUser();
        $guard->delete();

        $this->actingAs($guard, 'api')
            ->getJson('/api/auth/me')
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.')
            ->assertJsonMissing(['password' => true])
            ->assertJsonMissing(['two_factor_secret' => true]);
    }

    public function test_setup_required_users_cannot_access_protected_apis(): void
    {
        $guard = User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'setup_required' => true,
            'two_factor_enabled' => true,
        ]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/auth/me')
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');
    }

    public function test_users_without_completed_two_factor_cannot_access_protected_apis(): void
    {
        $guard = User::factory()->create([
            'role_id' => $this->guardUser()->role_id,
            'setup_required' => false,
            'two_factor_enabled' => false,
        ]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/auth/me')
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');
    }

    public function test_guard_cannot_access_admin_only_apis(): void
    {
        $guard = $this->guardUser();

        $this->actingAs($guard, 'api')->getJson('/api/users')->assertForbidden();
        $this->actingAs($guard, 'api')->getJson('/api/roles')->assertForbidden();
        $this->actingAs($guard, 'api')->getJson('/api/vehicles')->assertForbidden();
        $this->actingAs($guard, 'api')->getJson('/api/auth/audit-logs')->assertForbidden();
    }

    public function test_guard_cannot_access_monitoring_read_apis(): void
    {
        $guard = $this->guardUser();
        $patrol = PatrolSession::factory()->create();

        $this->actingAs($guard, 'api')
            ->getJson('/api/anpr-events')
            ->assertForbidden()
            ->assertJsonPath(
                'message',
                'Only administrators and security operators may perform this action.'
            );

        $this->actingAs($guard, 'api')
            ->getJson('/api/blockchain-records')
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->getJson('/api/patrol-sessions')
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->getJson('/api/patrol-sessions/'.$patrol->id)
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->getJson('/api/patrol-routes?patrol_session_id='.$patrol->id)
            ->assertForbidden();
    }

    public function test_security_operator_cannot_access_admin_only_mutation_apis(): void
    {
        $operator = $this->securityOperatorUser();

        $this->actingAs($operator, 'api')->getJson('/api/users')->assertForbidden();
        $this->actingAs($operator, 'api')->getJson('/api/vehicles')->assertForbidden();
        $this->actingAs($operator, 'api')->getJson('/api/auth/audit-logs')->assertForbidden();
        $this->actingAs($operator, 'api')->postJson('/api/anpr-events', [])->assertForbidden();
        $this->actingAs($operator, 'api')->postJson('/api/zones', [])->assertForbidden();
        $this->actingAs($operator, 'api')->postJson('/api/checkpoints', [])->assertForbidden();
        $this->actingAs($operator, 'api')->postJson('/api/cameras', [])->assertForbidden();
    }

    public function test_security_operator_can_access_monitoring_read_apis(): void
    {
        $operator = $this->securityOperatorUser();
        $patrol = PatrolSession::factory()->create();

        $this->actingAs($operator, 'api')->getJson('/api/anpr-events')->assertOk();
        $this->actingAs($operator, 'api')->getJson('/api/patrol-sessions')->assertOk();
        $this->actingAs($operator, 'api')->getJson('/api/patrol-sessions/'.$patrol->id)->assertOk();
    }

    public function test_security_operator_cannot_access_blockchain_monitoring_apis(): void
    {
        $operator = $this->securityOperatorUser();
        $record = BlockchainRecord::factory()->pending()->create();

        $this->actingAs($operator, 'api')->getJson('/api/blockchain-records')->assertForbidden();
        $this->actingAs($operator, 'api')->getJson('/api/blockchain-records/summary')->assertForbidden();
        $this->actingAs($operator, 'api')->getJson('/api/blockchain-records/'.$record->id)->assertForbidden();
        $this->actingAs($operator, 'api')->postJson('/api/blockchain-records/'.$record->id.'/verify')->assertForbidden();
        $this->actingAs($operator, 'api')->postJson('/api/blockchain-records/'.$record->id.'/refresh')->assertForbidden();
    }

    public function test_guard_can_perform_patrol_operational_flow(): void
    {
        $guard = $this->guardUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $guard->id]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/patrol-sessions/'.$patrol->id.'/summary')
            ->assertOk();

        $this->actingAs($guard, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        $this->actingAs($guard, 'api')
            ->getJson('/api/zones')
            ->assertOk();

        $this->actingAs($guard, 'api')
            ->getJson('/api/checkpoints')
            ->assertOk();

        $this->actingAs($guard, 'api')
            ->postJson('/api/patrol-sessions', [
                'user_id' => $guard->id,
                'zone_id' => $patrol->zone_id,
                'status' => 'active',
                'started_at' => now()->toIso8601String(),
            ])
            ->assertCreated();
    }

    public function test_admin_can_access_admin_only_apis(): void
    {
        $admin = $this->adminUser();

        $this->actingAs($admin, 'api')->getJson('/api/users')->assertOk();
        $this->actingAs($admin, 'api')->getJson('/api/vehicles')->assertOk();
        $this->actingAs($admin, 'api')->getJson('/api/auth/audit-logs')->assertOk();
        $this->actingAs($admin, 'api')->getJson('/api/anpr-events')->assertOk();
    }

    public function test_security_operator_cannot_retry_blockchain_records(): void
    {
        $operator = $this->securityOperatorUser();
        $record = BlockchainRecord::factory()->failed()->create();

        $this->actingAs($operator, 'api')
            ->postJson('/api/blockchain-records/'.$record->id.'/retry')
            ->assertForbidden();
    }

    public function test_guard_cannot_create_patrol_session_for_another_user(): void
    {
        $guard = $this->guardUser();
        $otherUser = User::factory()->create();
        $zone = Zone::factory()->create();

        $response = $this->actingAs($guard, 'api')
            ->postJson('/api/patrol-sessions', [
                'user_id' => $otherUser->id,
                'zone_id' => $zone->id,
                'status' => 'active',
                'started_at' => now()->toIso8601String(),
            ])
            ->assertCreated();

        $this->assertSame($guard->id, PatrolSession::query()->find($response->json('data.id'))?->user_id);
        $this->assertDatabaseHas('patrol_sessions', [
            'id' => $response->json('data.id'),
            'user_id' => $guard->id,
        ]);
    }

    public function test_guard_cannot_operate_on_another_users_patrol_session(): void
    {
        $guard = $this->guardUser();
        $otherUser = User::factory()->create();
        $otherPatrol = PatrolSession::factory()->create(['user_id' => $otherUser->id]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/patrol-sessions/'.$otherPatrol->id.'/summary')
            ->assertForbidden()
            ->assertJsonPath('message', 'Forbidden.');

        $this->actingAs($guard, 'api')
            ->postJson('/api/patrol-sessions/'.$otherPatrol->id.'/validate')
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->patchJson('/api/patrol-sessions/'.$otherPatrol->id, ['status' => 'completed'])
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->deleteJson('/api/patrol-sessions/'.$otherPatrol->id)
            ->assertForbidden();
    }

    public function test_guard_cannot_create_patrol_route_for_another_users_session(): void
    {
        $guard = $this->guardUser();
        $otherUser = User::factory()->create();
        $otherPatrol = PatrolSession::factory()->create(['user_id' => $otherUser->id]);
        $ownPatrol = PatrolSession::factory()->create(['user_id' => $guard->id]);

        $this->actingAs($guard, 'api')
            ->postJson('/api/patrol-routes', [
                'patrol_session_id' => $otherPatrol->id,
                'latitude' => 3.139,
                'longitude' => 101.6869,
            ])
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->postJson('/api/patrol-routes', [
                'patrol_session_id' => $ownPatrol->id,
                'latitude' => 3.139,
                'longitude' => 101.6869,
            ])
            ->assertCreated();
    }

    public function test_guard_cannot_mutate_checkpoint_events_for_another_users_patrol_session(): void
    {
        $guard = $this->guardUser();
        $otherUser = User::factory()->create();
        $otherPatrol = PatrolSession::factory()->create(['user_id' => $otherUser->id]);
        $ownPatrol = PatrolSession::factory()->create(['user_id' => $guard->id]);
        $checkpoint = Checkpoint::factory()->create(['zone_id' => $ownPatrol->zone_id]);
        $otherEvent = CheckpointEvent::factory()->create([
            'patrol_session_id' => $otherPatrol->id,
            'checkpoint_id' => $checkpoint->id,
        ]);

        $this->actingAs($guard, 'api')
            ->postJson('/api/checkpoint-events', [
                'patrol_session_id' => $otherPatrol->id,
                'checkpoint_id' => $checkpoint->id,
            ])
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->patchJson('/api/checkpoint-events/'.$otherEvent->id, ['status' => 'verified'])
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->deleteJson('/api/checkpoint-events/'.$otherEvent->id)
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->postJson('/api/checkpoint-events', [
                'patrol_session_id' => $ownPatrol->id,
                'checkpoint_id' => $checkpoint->id,
            ])
            ->assertCreated();
    }

    public function test_guard_pwa_sync_rejects_cross_user_payloads(): void
    {
        $guard = $this->guardUser();
        $otherUser = User::factory()->create();
        $otherPatrol = PatrolSession::factory()->create(['user_id' => $otherUser->id]);
        $ownPatrol = PatrolSession::factory()->create(['user_id' => $guard->id]);

        $this->actingAs($guard, 'api')
            ->postJson('/api/pwa/sync', [
                'type' => 'location_log',
                'locationLogId' => (string) \Illuminate\Support\Str::uuid(),
                'patrolId' => $otherPatrol->id,
                'userId' => $guard->id,
                'timestamp' => now()->getTimestampMs(),
                'lat' => 3.139,
                'lng' => 101.6869,
                'source' => 'live',
                'trackingState' => 'active',
            ])
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->postJson('/api/pwa/sync', [
                'type' => 'location_log',
                'locationLogId' => (string) \Illuminate\Support\Str::uuid(),
                'patrolId' => $ownPatrol->id,
                'userId' => $otherUser->id,
                'timestamp' => now()->getTimestampMs(),
                'lat' => 3.139,
                'lng' => 101.6869,
                'source' => 'live',
                'trackingState' => 'active',
            ])
            ->assertForbidden();

        $this->actingAs($guard, 'api')
            ->postJson('/api/pwa/sync', [
                'type' => 'location_log',
                'locationLogId' => (string) \Illuminate\Support\Str::uuid(),
                'patrolId' => $ownPatrol->id,
                'userId' => $guard->id,
                'timestamp' => now()->getTimestampMs(),
                'lat' => 3.139,
                'lng' => 101.6869,
                'source' => 'live',
                'trackingState' => 'active',
            ])
            ->assertCreated();
    }

    public function test_guard_cannot_read_another_users_location_log(): void
    {
        $guard = $this->guardUser();
        $otherUser = User::factory()->create();
        $otherPatrol = PatrolSession::factory()->create(['user_id' => $otherUser->id]);
        $log = LocationLog::query()->create([
            'id' => (string) Str::uuid(),
            'patrol_session_id' => $otherPatrol->id,
            'user_id' => $otherPatrol->user_id,
            'latitude' => 3.139,
            'longitude' => 101.6869,
            'accuracy' => 10,
            'timestamp' => now()->getTimestampMs(),
            'server_received_at' => now(),
            'source' => 'live',
            'tracking_state' => 'active',
        ]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/location-logs/'.$log->id)
            ->assertForbidden();
    }

    public function test_guard_cannot_reassign_patrol_session_owner_on_update(): void
    {
        $guardA = $this->guardUser();
        $guardB = $this->guardUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $guardA->id, 'status' => 'active']);

        $this->actingAs($guardA, 'api')
            ->patchJson('/api/patrol-sessions/'.$patrol->id, [
                'user_id' => $guardB->id,
                'status' => 'completed',
            ])
            ->assertForbidden();

        $patrol->refresh();
        $this->assertSame($guardA->id, $patrol->user_id);
        $this->assertSame('active', $patrol->status);
    }

    public function test_guard_can_update_own_patrol_session_without_reassigning_owner(): void
    {
        $guard = $this->guardUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $guard->id, 'status' => 'active']);

        $this->actingAs($guard, 'api')
            ->patchJson('/api/patrol-sessions/'.$patrol->id, ['status' => 'completed'])
            ->assertOk();

        $patrol->refresh();
        $this->assertSame($guard->id, $patrol->user_id);
        $this->assertSame('completed', $patrol->status);
    }

    public function test_guard_cannot_move_checkpoint_event_to_another_users_patrol_session_on_update(): void
    {
        $guardA = $this->guardUser();
        $guardB = $this->guardUser();
        $patrolA = PatrolSession::factory()->create(['user_id' => $guardA->id]);
        $patrolB = PatrolSession::factory()->create(['user_id' => $guardB->id]);
        $checkpoint = Checkpoint::factory()->create(['zone_id' => $patrolA->zone_id]);
        $event = CheckpointEvent::factory()->create([
            'patrol_session_id' => $patrolA->id,
            'checkpoint_id' => $checkpoint->id,
            'status' => 'pending',
        ]);

        $this->actingAs($guardA, 'api')
            ->patchJson('/api/checkpoint-events/'.$event->id, [
                'patrol_session_id' => $patrolB->id,
                'status' => 'verified',
            ])
            ->assertForbidden();

        $event->refresh();
        $this->assertSame($patrolA->id, $event->patrol_session_id);
        $this->assertSame('pending', $event->status);
    }

    public function test_guard_cannot_move_checkpoint_event_metric_to_another_users_event_on_update(): void
    {
        $guardA = $this->guardUser();
        $guardB = $this->guardUser();
        $patrolA = PatrolSession::factory()->create(['user_id' => $guardA->id]);
        $patrolB = PatrolSession::factory()->create(['user_id' => $guardB->id]);
        $eventA = CheckpointEvent::factory()->create(['patrol_session_id' => $patrolA->id]);
        $eventB = CheckpointEvent::factory()->create(['patrol_session_id' => $patrolB->id]);
        $metric = CheckpointEventMetric::factory()->create([
            'checkpoint_event_id' => $eventA->id,
            'distance_score' => 75,
        ]);
        $originalDistance = (float) $metric->distance_score;

        $this->actingAs($guardA, 'api')
            ->patchJson('/api/checkpoint-event-metrics/'.$metric->id, [
                'checkpoint_event_id' => $eventB->id,
                'distance_score' => 90,
            ])
            ->assertForbidden();

        $metric->refresh();
        $this->assertSame($eventA->id, $metric->checkpoint_event_id);
        $this->assertSame($originalDistance, (float) $metric->distance_score);
    }

    public function test_guard_can_update_own_patrol_session_when_same_user_id_is_resubmitted(): void
    {
        $guard = $this->guardUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $guard->id, 'status' => 'active']);

        $this->actingAs($guard, 'api')
            ->patchJson('/api/patrol-sessions/'.$patrol->id, [
                'user_id' => $guard->id,
                'status' => 'completed',
            ])
            ->assertOk();

        $patrol->refresh();
        $this->assertSame($guard->id, $patrol->user_id);
        $this->assertSame('completed', $patrol->status);
    }

    public function test_guard_can_update_own_checkpoint_event_when_same_patrol_session_id_is_resubmitted(): void
    {
        $guard = $this->guardUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $guard->id]);
        $checkpoint = Checkpoint::factory()->create(['zone_id' => $patrol->zone_id]);
        $event = CheckpointEvent::factory()->create([
            'patrol_session_id' => $patrol->id,
            'checkpoint_id' => $checkpoint->id,
            'status' => 'pending',
        ]);

        $this->actingAs($guard, 'api')
            ->patchJson('/api/checkpoint-events/'.$event->id, [
                'patrol_session_id' => $patrol->id,
                'status' => 'verified',
            ])
            ->assertOk();

        $event->refresh();
        $this->assertSame($patrol->id, $event->patrol_session_id);
        $this->assertSame('verified', $event->status);
    }

    public function test_guard_can_update_own_checkpoint_event_metric_when_same_checkpoint_event_id_is_resubmitted(): void
    {
        $guard = $this->guardUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $guard->id]);
        $event = CheckpointEvent::factory()->create(['patrol_session_id' => $patrol->id]);
        $metric = CheckpointEventMetric::factory()->create([
            'checkpoint_event_id' => $event->id,
            'distance_score' => 70,
        ]);

        $this->actingAs($guard, 'api')
            ->patchJson('/api/checkpoint-event-metrics/'.$metric->id, [
                'checkpoint_event_id' => $event->id,
                'distance_score' => 85,
            ])
            ->assertOk();

        $metric->refresh();
        $this->assertSame($event->id, $metric->checkpoint_event_id);
        $this->assertSame(85.0, (float) $metric->distance_score);
    }
}
