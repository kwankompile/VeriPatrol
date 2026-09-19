<?php

namespace Tests\Feature\Blockchain;

use App\Models\BlockchainRecord;
use App\Services\Blockchain\BlockchainHashService;
use App\Services\Blockchain\BlockchainRecordService;
use App\Services\Profile\ProfileBlockchainService;
use Carbon\Carbon;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CreatesPatrolFixtures;
use Tests\Concerns\CreatesPatrolUsers;
use Tests\TestCase;

/**
 * M13 regression coverage for cross-module blockchain invariants.
 */
class BlockchainM13RegressionTest extends TestCase
{
    use CreatesPatrolFixtures;
    use CreatesPatrolUsers;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        config([
            'blockchain.enabled' => false,
            'blockchain.canonical_version' => 'v1',
            'blockchain.hash_algorithm' => 'sha256',
            'blockchain.network' => 'ganache',
            'blockchain.environment' => 'local',
            'blockchain.private_key' => '0x'.str_repeat('d', 64),
        ]);
    }

    public function test_multiple_user_profile_proof_types_coexist_for_same_user(): void
    {
        $userId = '01940000-0000-7000-8000-000000000707';
        $service = app(BlockchainRecordService::class);
        $changedAt = Carbon::parse('2026-06-29T10:00:00Z');

        $proofs = [
            [
                'entity_type' => ProfileBlockchainService::ENTITY_TYPE,
                'entity_id' => $userId,
                'proof_type' => ProfileBlockchainService::PROOF_PASSWORD_CHANGED,
                'profile_version' => 2,
                'changed_at' => $changedAt,
                'actor_user_id' => $userId,
                'revoked_count' => 1,
                'source' => 'self_profile',
            ],
            [
                'entity_type' => ProfileBlockchainService::ENTITY_TYPE,
                'entity_id' => $userId,
                'proof_type' => ProfileBlockchainService::PROOF_EMAIL_CHANGED,
                'profile_version' => 3,
                'changed_at' => $changedAt,
                'actor_user_id' => $userId,
                'revoked_count' => 1,
                'source' => 'self_profile',
                'old_email_hash' => hash('sha256', 'old@example.com'),
                'new_email_hash' => hash('sha256', 'new@example.com'),
            ],
            [
                'entity_type' => ProfileBlockchainService::ENTITY_TYPE,
                'entity_id' => $userId,
                'proof_type' => ProfileBlockchainService::PROOF_TWO_FACTOR_RECONFIGURED,
                'profile_version' => 4,
                'changed_at' => $changedAt,
                'actor_user_id' => $userId,
                'revoked_count' => 1,
                'source' => 'self_profile',
            ],
        ];

        foreach ($proofs as $payload) {
            $service->createForPayload($payload, $payload);
        }

        $this->assertSame(3, BlockchainRecord::query()
            ->where('entity_type', ProfileBlockchainService::ENTITY_TYPE)
            ->where('entity_id', $userId)
            ->count());

        $this->assertSame(
            3,
            BlockchainRecord::query()
                ->where('entity_type', ProfileBlockchainService::ENTITY_TYPE)
                ->where('entity_id', $userId)
                ->distinct('proof_type')
                ->count('proof_type')
        );
    }

    public function test_patrol_canonical_payload_excludes_volatile_and_gps_fields(): void
    {
        ['user' => $user, 'checkpoint' => $checkpoint, 'patrol' => $patrol] = $this->patrolValidationContext();
        $baseTs = Carbon::parse('2026-05-20 10:00:00')->getTimestampMs();
        $this->seedLocationLogs($patrol, $user, $baseTs, [
            ['offset_ms' => 0],
            ['offset_ms' => 2000],
            ['offset_ms' => 4000],
            ['offset_ms' => 6000],
        ], (float) $checkpoint->latitude, (float) $checkpoint->longitude);

        app(\App\Services\PatrolValidationService::class)->validatePatrolSession($patrol);

        Carbon::setTestNow('2026-05-20 10:05:00');
        $movement = app(\App\Services\PatrolValidationService::class)->collectMovementAnomalySummary($patrol->fresh());
        $payload = app(BlockchainHashService::class)->buildPatrolSessionValidationPayloadFromDatabase(
            $patrol->fresh(),
            $movement,
        );
        Carbon::setTestNow();

        $this->assertArrayNotHasKey('validated_at', $payload);
        $encoded = json_encode($payload);
        $this->assertIsString($encoded);
        foreach (['latitude', 'longitude', 'altitude', 'processed_at', 'route'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, strtolower($encoded));
        }
    }

    public function test_blockchain_monitoring_api_responses_do_not_expose_private_key_or_rpc_secrets(): void
    {
        $admin = $this->adminUser();
        $record = BlockchainRecord::factory()->confirmed()->create([
            'network' => 'ganache',
            'environment' => 'local',
            'last_error' => 'RPC failed at http://127.0.0.1:7545',
        ]);

        $privateKey = (string) config('blockchain.private_key');

        $listResponse = $this->actingAs($admin, 'api')
            ->getJson('/api/blockchain-records')
            ->assertOk();

        $detailResponse = $this->actingAs($admin, 'api')
            ->getJson('/api/blockchain-records/'.$record->id)
            ->assertOk();

        $summaryResponse = $this->actingAs($admin, 'api')
            ->getJson('/api/blockchain-records/summary')
            ->assertOk();

        foreach ([$listResponse->getContent(), $detailResponse->getContent(), $summaryResponse->getContent()] as $body) {
            $this->assertStringNotContainsString($privateKey, $body);
            $this->assertStringNotContainsString('private_key', strtolower($body));
            $this->assertStringNotContainsString('rpc_url', strtolower($body));
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }
}
