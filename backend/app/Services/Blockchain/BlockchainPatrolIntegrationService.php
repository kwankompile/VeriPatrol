<?php

namespace App\Services\Blockchain;

use App\Models\BlockchainRecord;
use App\Models\PatrolSession;
use Illuminate\Support\Facades\Log;
use Throwable;

class BlockchainPatrolIntegrationService
{
    public const ENTITY_TYPE = 'patrol_session';

    public const PROOF_VALIDATION_RESULT = 'validation_result';

    public function __construct(
        private readonly BlockchainRecordService $recordService,
        private readonly BlockchainHashService $hashService,
        private readonly BlockchainRetryService $retryService,
    ) {}

    /**
     * @param  array<string, mixed>  $validationResult
     */
    public function anchorValidationResult(PatrolSession $patrolSession, array $validationResult): ?BlockchainRecord
    {
        if (! config('blockchain.enabled')) {
            return null;
        }

        try {
            $movementSummary = [
                'total_location_logs' => (int) ($validationResult['total_location_logs'] ?? 0),
                'total_gaps' => (int) ($validationResult['total_gaps'] ?? 0),
                'total_anomalies' => count($validationResult['anomalies']['items'] ?? []),
            ];

            $payload = $this->hashService->buildPatrolSessionValidationPayloadFromDatabase(
                $patrolSession->fresh(),
                $movementSummary,
            );

            $record = $this->recordService->createForPayload(
                $payload,
                $this->hashService->buildPatrolSessionValidationPayloadSummary($payload),
            );

            $this->linkPatrolSessionIfAppropriate($patrolSession, $record);

            return $record;
        } catch (Throwable $exception) {
            Log::warning('Patrol blockchain record creation failed.', [
                'patrol_session_id' => (string) $patrolSession->getKey(),
                'proof_type' => self::PROOF_VALIDATION_RESULT,
                'error' => $this->retryService->sanitizeError($exception->getMessage()),
            ]);

            return null;
        }
    }

    private function linkPatrolSessionIfAppropriate(PatrolSession $patrolSession, BlockchainRecord $record): void
    {
        if ($patrolSession->blockchain_record_id !== null) {
            return;
        }

        $patrolSession->update([
            'blockchain_record_id' => $record->id,
        ]);
    }
}
