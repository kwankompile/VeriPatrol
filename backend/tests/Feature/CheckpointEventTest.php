<?php

namespace Tests\Feature;

use App\Models\Checkpoint;
use App\Models\CheckpointEvent;
use App\Models\PatrolSession;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class CheckpointEventTest extends TestCase
{
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    /**
     * @return array{user: User, patrol: PatrolSession, checkpoint: Checkpoint}
     */
    private function guardPatrolContext(): array
    {
        $user = $this->guardUser();
        $patrol = PatrolSession::factory()->create(['user_id' => $user->id]);
        $checkpoint = Checkpoint::factory()->create(['zone_id' => $patrol->zone_id]);

        return compact('user', 'patrol', 'checkpoint');
    }

    public function test_store_persists_m8_statuses(): void
    {
        ['user' => $user, 'patrol' => $patrol] = $this->guardPatrolContext();

        foreach (['partial', 'needs_review', 'missed'] as $status) {
            $checkpoint = Checkpoint::factory()->create([
                'zone_id' => $patrol->zone_id,
                'name' => 'CP '.$status.' '.uniqid(),
            ]);

            $this->actingAs($user, 'api')
                ->postJson('/api/checkpoint-events', [
                    'patrol_session_id' => $patrol->id,
                    'checkpoint_id' => $checkpoint->id,
                    'status' => $status,
                ])
                ->assertCreated()
                ->assertJsonPath('data.status', $status);

            $this->assertDatabaseHas('checkpoint_events', [
                'patrol_session_id' => $patrol->id,
                'checkpoint_id' => $checkpoint->id,
                'status' => $status,
            ]);
        }
    }

    public function test_store_normalizes_legacy_uncertain_to_needs_review(): void
    {
        ['user' => $user, 'patrol' => $patrol, 'checkpoint' => $checkpoint] = $this->guardPatrolContext();

        $this->actingAs($user, 'api')
            ->postJson('/api/checkpoint-events', [
                'patrol_session_id' => $patrol->id,
                'checkpoint_id' => $checkpoint->id,
                'status' => 'uncertain',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'needs_review');

        $this->assertDatabaseHas('checkpoint_events', [
            'patrol_session_id' => $patrol->id,
            'status' => 'needs_review',
        ]);
        $this->assertDatabaseMissing('checkpoint_events', [
            'patrol_session_id' => $patrol->id,
            'status' => 'uncertain',
        ]);
    }

    public function test_store_normalizes_legacy_rejected_to_missed(): void
    {
        ['user' => $user, 'patrol' => $patrol, 'checkpoint' => $checkpoint] = $this->guardPatrolContext();

        $this->actingAs($user, 'api')
            ->postJson('/api/checkpoint-events', [
                'patrol_session_id' => $patrol->id,
                'checkpoint_id' => $checkpoint->id,
                'status' => 'rejected',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'missed');
    }

    public function test_update_normalizes_legacy_status_before_persisting(): void
    {
        ['user' => $user, 'patrol' => $patrol, 'checkpoint' => $checkpoint] = $this->guardPatrolContext();

        $event = CheckpointEvent::factory()->create([
            'patrol_session_id' => $patrol->id,
            'checkpoint_id' => $checkpoint->id,
            'status' => 'pending',
        ]);

        $this->actingAs($user, 'api')
            ->patchJson('/api/checkpoint-events/'.$event->id, ['status' => 'uncertain'])
            ->assertOk()
            ->assertJsonPath('data.status', 'needs_review');

        $this->assertSame('needs_review', $event->fresh()->status);
    }

    public function test_store_rejects_non_scalar_status_with_validation_error(): void
    {
        ['user' => $user, 'patrol' => $patrol, 'checkpoint' => $checkpoint] = $this->guardPatrolContext();

        $response = $this->actingAs($user, 'api')
            ->postJson('/api/checkpoint-events', [
                'patrol_session_id' => $patrol->id,
                'checkpoint_id' => $checkpoint->id,
                'status' => [],
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'Validation failed.')
            ->assertJsonStructure(['data' => ['errors' => ['status']]]);

        $this->assertNotEmpty($response->json('data.errors.status'));
    }

    public function test_index_filter_normalizes_legacy_uncertain_to_needs_review(): void
    {
        $admin = $this->adminUser();
        $patrol = PatrolSession::factory()->create();

        CheckpointEvent::factory()->create([
            'patrol_session_id' => $patrol->id,
            'status' => 'needs_review',
        ]);
        CheckpointEvent::factory()->create([
            'patrol_session_id' => $patrol->id,
            'status' => 'verified',
        ]);

        $this->actingAs($admin, 'api')
            ->getJson('/api/checkpoint-events?status=uncertain&patrol_session_id='.$patrol->id)
            ->assertOk()
            ->assertJsonCount(1, 'data.data');
    }
}
