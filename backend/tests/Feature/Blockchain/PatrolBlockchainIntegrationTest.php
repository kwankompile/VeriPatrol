<?php

namespace Tests\Feature\Blockchain;

use App\Jobs\AnchorBlockchainRecordJob;
use App\Models\BlockchainRecord;
use App\Models\CheckpointEvent;
use App\Models\PatrolSession;
use App\Services\Blockchain\BlockchainHashService;
use App\Services\Blockchain\BlockchainPatrolIntegrationService;
use App\Services\Blockchain\BlockchainRecordService;
use App\Services\PatrolValidationService;
use Carbon\Carbon;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Tests\Concerns\CreatesPatrolFixtures;
use Tests\TestCase;

class PatrolBlockchainIntegrationTest extends TestCase
{
    use CreatesPatrolFixtures;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);

        config([
            'blockchain.canonical_version' => 'v1',
            'blockchain.hash_algorithm' => 'sha256',
            'blockchain.network' => 'ganache',
            'blockchain.environment' => 'local',
            'blockchain.chain_id' => 1337,
            'blockchain.contract_address' => '0x'.str_repeat('a', 40),
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    public function test_patrol_validation_with_blockchain_enabled_creates_pending_record(): void
    {
        Bus::fake();
        Http::fake();
        config(['blockchain.enabled' => true]);

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

        $this->assertNotNull($response->json('data.patrol_session_id'));

        $record = BlockchainRecord::query()
            ->where('entity_type', BlockchainPatrolIntegrationService::ENTITY_TYPE)
            ->where('entity_id', $patrol->id)
            ->where('proof_type', BlockchainPatrolIntegrationService::PROOF_VALIDATION_RESULT)
            ->first();

        $this->assertNotNull($record);
        $this->assertSame('queued', $record->status);
        $this->assertSame($patrol->id, $record->entity_id);
        $this->assertPayloadSummaryIsSafe($record->payload_summary);
        $this->assertSame($record->id, $patrol->fresh()->blockchain_record_id);

        Bus::assertDispatched(AnchorBlockchainRecordJob::class, function (AnchorBlockchainRecordJob $job) use ($record): bool {
            return $job->blockchainRecordId === $record->id;
        });
        Http::assertNothingSent();
    }

    public function test_patrol_validation_does_not_wait_for_on_chain_confirmation(): void
    {
        Bus::fake();
        config(['blockchain.enabled' => true]);

        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $startedAt = microtime(true);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        $elapsedMs = (microtime(true) - $startedAt) * 1000;
        $this->assertLessThan(2000, $elapsedMs);

        $record = BlockchainRecord::query()
            ->where('entity_type', 'patrol_session')
            ->where('entity_id', $patrol->id)
            ->first();

        $this->assertNotNull($record);
        $this->assertNotSame('confirmed', $record->status);
    }

    public function test_patrol_validation_with_blockchain_disabled_does_not_create_record(): void
    {
        Bus::fake();
        config(['blockchain.enabled' => false]);

        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        $this->assertDatabaseCount('blockchain_records', 0);
        Bus::assertNotDispatched(AnchorBlockchainRecordJob::class);
    }

    public function test_repeated_validation_with_same_result_does_not_create_duplicate_records(): void
    {
        Bus::fake();
        config(['blockchain.enabled' => true]);

        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        $this->assertSame(1, $this->patrolValidationProofCount($patrol));
    }

    public function test_repeated_validation_minutes_apart_with_same_result_reuses_single_proof(): void
    {
        Bus::fake();
        config(['blockchain.enabled' => true]);

        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        Carbon::setTestNow('2026-05-20 10:00:00');

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        Carbon::setTestNow('2026-05-20 10:05:00');

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        Carbon::setTestNow();

        $this->assertSame(1, $this->patrolValidationProofCount($patrol));
    }

    public function test_changed_validation_result_creates_new_hash_distinct_record(): void
    {
        Bus::fake();
        config(['blockchain.enabled' => true]);

        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $validationResult = app(PatrolValidationService::class)->validatePatrolSession($patrol);
        app(BlockchainPatrolIntegrationService::class)->anchorValidationResult($patrol, $validationResult);

        $this->assertSame(1, $this->patrolValidationProofCount($patrol));

        $patrol->checkpointEvents()->firstOrFail()->update(['status' => 'suspicious']);

        $movementSummary = app(PatrolValidationService::class)->collectMovementAnomalySummary($patrol->fresh());
        $secondResult = [
            'total_location_logs' => $movementSummary['total_location_logs'],
            'total_gaps' => $movementSummary['total_gaps'],
            'anomalies' => ['items' => array_fill(0, $movementSummary['total_anomalies'], ['type' => 'demo'])],
        ];
        app(BlockchainPatrolIntegrationService::class)->anchorValidationResult($patrol->fresh(), $secondResult);

        $hashes = BlockchainRecord::query()
            ->where('entity_type', 'patrol_session')
            ->where('entity_id', $patrol->id)
            ->where('proof_type', 'validation_result')
            ->pluck('record_hash')
            ->all();

        $this->assertCount(2, $hashes);
        $this->assertCount(2, array_unique($hashes));
    }

    public function test_blockchain_failure_does_not_break_patrol_validation(): void
    {
        Log::spy();
        Bus::fake();
        config([
            'blockchain.enabled' => true,
            'blockchain.private_key' => '0x'.str_repeat('d', 64),
        ]);

        $privateKey = (string) config('blockchain.private_key');
        $sensitiveMessage = 'RPC failed at http://127.0.0.1:7545 key='.$privateKey;

        $this->mock(BlockchainRecordService::class, function ($mock) use ($sensitiveMessage): void {
            $mock->shouldReceive('createForPayload')
                ->andThrow(new RuntimeException($sensitiveMessage));
        });

        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseCount('blockchain_records', 0);
        $this->assertGreaterThan(
            0,
            CheckpointEvent::query()->where('patrol_session_id', $patrol->id)->count()
        );

        Log::shouldHaveReceived('warning')
            ->once()
            ->withArgs(function (string $message, array $context) use ($privateKey, $sensitiveMessage): bool {
                return $message === 'Patrol blockchain record creation failed.'
                    && isset($context['error'])
                    && is_string($context['error'])
                    && ! str_contains($context['error'], 'http://127.0.0.1:7545')
                    && ! str_contains($context['error'], $privateKey)
                    && ! str_contains($context['error'], $sensitiveMessage);
            });
    }

    public function test_patrol_payload_summary_excludes_gps_and_personal_data(): void
    {
        Bus::fake();
        config(['blockchain.enabled' => true]);

        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        $this->actingAs($user, 'api')
            ->postJson('/api/patrol-sessions/'.$patrol->id.'/validate')
            ->assertOk();

        $record = BlockchainRecord::query()
            ->where('entity_type', 'patrol_session')
            ->where('entity_id', $patrol->id)
            ->firstOrFail();

        $encoded = json_encode($record->payload_summary);
        $this->assertIsString($encoded);
        $this->assertStringNotContainsString((string) $user->email, $encoded);
        $this->assertStringNotContainsString('latitude', strtolower($encoded));
        $this->assertStringNotContainsString('longitude', strtolower($encoded));
        $this->assertStringNotContainsString('altitude', strtolower($encoded));
        $this->assertStringNotContainsString($checkpoint->name, $encoded);
    }

    private function patrolValidationProofCount(PatrolSession $patrol): int
    {
        return BlockchainRecord::query()
            ->where('entity_type', 'patrol_session')
            ->where('entity_id', $patrol->id)
            ->where('proof_type', 'validation_result')
            ->count();
    }

    /**
     * @param  array<string, mixed>|null  $payloadSummary
     */
    private function assertPayloadSummaryIsSafe(?array $payloadSummary): void
    {
        $this->assertIsArray($payloadSummary);
        $encoded = json_encode($payloadSummary);
        $this->assertIsString($encoded);

        foreach (['password', 'email', 'phone', 'address', 'latitude', 'longitude', 'altitude', 'token', 'secret'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, strtolower($encoded));
        }

        $this->assertSame('patrol', $payloadSummary['module'] ?? null);
        $this->assertSame('patrol_session', $payloadSummary['entity_type'] ?? null);
        $this->assertSame('validation_result', $payloadSummary['proof_type'] ?? null);
    }
}
