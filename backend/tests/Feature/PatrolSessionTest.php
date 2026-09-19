<?php

namespace Tests\Feature;

use App\Models\Checkpoint;
use App\Models\CheckpointEvent;
use App\Models\PatrolSession;
use App\Models\User;
use App\Models\Zone;
use Carbon\Carbon;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

class PatrolSessionTest extends TestCase
{
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_store_persists_started_at_from_iso8601_utc_payload(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-06-12T08:30:00Z'));

        $user = User::factory()->create();
        $zone = Zone::factory()->create();
        $startedAt = '2026-06-12T00:30:00.000Z';

        $response = $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions', [
                'user_id' => $user->id,
                'zone_id' => $zone->id,
                'started_at' => $startedAt,
                'status' => 'active',
            ])
            ->assertCreated()
            ->assertJsonPath('success', true);

        $sessionId = $response->json('data.id');
        $this->assertNotEmpty($sessionId);

        $responseStartedAt = $response->json('data.started_at');
        $this->assertIsString($responseStartedAt);
        $this->assertStringContainsString('T', $responseStartedAt);
        $this->assertTrue(
            str_ends_with($responseStartedAt, 'Z') || preg_match('/[+-]\d{2}:\d{2}$/', $responseStartedAt) === 1,
            'API started_at must be ISO-8601 with explicit timezone offset'
        );

        $parsedResponse = Carbon::parse($responseStartedAt);
        $this->assertSame(
            Carbon::parse($startedAt)->getTimestamp(),
            $parsedResponse->getTimestamp(),
            'Response started_at must represent the same instant as the request payload'
        );

        $session = PatrolSession::query()->findOrFail($sessionId);
        $this->assertSame(
            Carbon::parse($startedAt)->getTimestamp(),
            $session->started_at?->getTimestamp(),
            'Database started_at must represent the same instant as the request payload'
        );

        Carbon::setTestNow();
    }

    public function test_active_returns_guard_own_in_progress_session_with_checkpoint_events(): void
    {
        $guard = $this->guardUser();
        $zone = Zone::factory()->create();
        $checkpoint = Checkpoint::factory()->create(['zone_id' => $zone->id]);

        $session = PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
        ]);

        CheckpointEvent::factory()->create([
            'patrol_session_id' => $session->id,
            'checkpoint_id' => $checkpoint->id,
            'status' => 'pending',
        ]);

        $response = $this->actingAs($guard, 'api')
            ->getJson('/api/patrol-sessions/active')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $session->id)
            ->assertJsonPath('data.zone_id', $zone->id)
            ->assertJsonPath('data.status', 'active');

        $this->assertCount(1, $response->json('data.checkpoint_events'));
        $this->assertSame($checkpoint->id, $response->json('data.checkpoint_events.0.checkpoint.id'));
        $this->assertSame($checkpoint->id, $response->json('data.checkpoint_events.0.checkpoint_id'));
    }

    public function test_active_returns_null_when_guard_has_no_active_session(): void
    {
        $guard = $this->guardUser();
        $zone = Zone::factory()->create();

        // A completed session must not be treated as active.
        PatrolSession::factory()->create([
            'user_id' => $guard->id,
            'zone_id' => $zone->id,
            'status' => 'completed',
        ]);

        $this->actingAs($guard, 'api')
            ->getJson('/api/patrol-sessions/active')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data', null);
    }

    public function test_active_is_scoped_to_the_authenticated_user(): void
    {
        $guard = $this->guardUser();
        $otherGuard = $this->guardUser();
        $zone = Zone::factory()->create();

        PatrolSession::factory()->create([
            'user_id' => $otherGuard->id,
            'zone_id' => $zone->id,
            'status' => 'active',
        ]);

        // The requesting guard has no active session of their own.
        $this->actingAs($guard, 'api')
            ->getJson('/api/patrol-sessions/active')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data', null);
    }
}
