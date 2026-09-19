<?php

namespace App\Services\Blockchain;

use App\Jobs\AnchorBlockchainRecordJob;
use App\Models\AnprEvent;
use App\Models\AnprImage;
use App\Models\BlockchainJob;
use App\Models\BlockchainRecord;
use App\Support\BlockchainCanonicalJson;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

class BlockchainRecordService
{
    public function __construct(
        private readonly BlockchainHashService $hashService,
        private readonly BlockchainRetryService $retryService,
    ) {}

    public function createForEntity(Model $entity, string $proofType = 'entity_created'): BlockchainRecord
    {
        $hashResult = $this->hashService->hashEntity($entity, $proofType);
        $canonicalPayload = $hashResult['canonical_payload'];
        $canonicalVersion = $hashResult['canonical_version'];
        $environment = (string) config('blockchain.environment', 'local');

        $existing = $this->findExistingProof(
            $canonicalPayload,
            $canonicalVersion,
            $environment,
            $hashResult['record_hash'],
        );
        if ($existing !== null) {
            $this->linkAnprEventIfAppropriate($entity, $existing);
            $this->maybeQueueForAnchoring($existing);

            return $existing;
        }

        $record = BlockchainRecord::query()->create([
            'entity_type' => (string) $canonicalPayload['entity_type'],
            'entity_id' => (string) $canonicalPayload['entity_id'],
            'proof_type' => (string) $canonicalPayload['proof_type'],
            'canonical_version' => $canonicalVersion,
            'hash_algorithm' => $hashResult['hash_algorithm'],
            'record_hash' => $hashResult['record_hash'],
            'payload_summary' => $this->buildPayloadSummary($entity, $proofType),
            'network' => (string) config('blockchain.network', 'ganache'),
            'environment' => $environment,
            'chain_id' => $this->configuredChainId(),
            'contract_address' => config('blockchain.contract_address'),
            'status' => 'pending',
        ]);

        $this->linkAnprEventIfAppropriate($entity, $record);
        $this->maybeQueueForAnchoring($record);

        return $record;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, mixed>|null  $payloadSummary
     */
    public function createForPayload(array $payload, ?array $payloadSummary = null): BlockchainRecord
    {
        foreach (['entity_type', 'entity_id', 'proof_type'] as $requiredKey) {
            if (! isset($payload[$requiredKey]) || $payload[$requiredKey] === '') {
                throw new InvalidArgumentException("Missing {$requiredKey} in blockchain payload.");
            }
        }

        $hashResult = $this->hashService->hashPayload($payload);
        $canonicalPayload = $hashResult['canonical_payload'];
        $canonicalVersion = $hashResult['canonical_version'];
        $environment = (string) config('blockchain.environment', 'local');

        $summary = $payloadSummary === null
            ? $canonicalPayload
            : BlockchainCanonicalJson::normalize($payloadSummary);

        if (! is_array($summary)) {
            throw new InvalidArgumentException('Blockchain payload summary must normalize to an array.');
        }

        $existing = $this->findExistingProof(
            $canonicalPayload,
            $canonicalVersion,
            $environment,
            $hashResult['record_hash'],
        );

        if ($existing !== null) {
            $this->maybeQueueForAnchoring($existing);

            return $existing;
        }

        $record = BlockchainRecord::query()->create([
            'entity_type' => (string) $canonicalPayload['entity_type'],
            'entity_id' => (string) $canonicalPayload['entity_id'],
            'proof_type' => (string) $canonicalPayload['proof_type'],
            'canonical_version' => $canonicalVersion,
            'hash_algorithm' => $hashResult['hash_algorithm'],
            'record_hash' => $hashResult['record_hash'],
            'payload_summary' => $summary,
            'network' => (string) config('blockchain.network', 'ganache'),
            'environment' => $environment,
            'chain_id' => $this->configuredChainId(),
            'contract_address' => config('blockchain.contract_address'),
            'status' => 'pending',
        ]);

        $this->maybeQueueForAnchoring($record);

        return $record;
    }

    /**
     * @param  array<string, mixed>  $canonicalPayload
     */
    public function findExistingProof(
        array $canonicalPayload,
        string $canonicalVersion,
        string $environment,
        string $recordHash,
    ): ?BlockchainRecord {
        return BlockchainRecord::query()
            ->where('entity_type', (string) ($canonicalPayload['entity_type'] ?? ''))
            ->where('entity_id', (string) ($canonicalPayload['entity_id'] ?? ''))
            ->where('proof_type', (string) ($canonicalPayload['proof_type'] ?? ''))
            ->where('canonical_version', $canonicalVersion)
            ->where('environment', $environment)
            ->where('record_hash', $recordHash)
            ->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function buildPayloadSummary(Model $entity, string $proofType): array
    {
        if ($entity instanceof AnprEvent) {
            return $this->buildAnprEventPayloadSummary($entity, $proofType);
        }

        if ($entity instanceof AnprImage) {
            return $this->buildAnprImagePayloadSummary($entity, $proofType);
        }

        return [
            'entity_type' => class_basename($entity),
            'entity_id' => (string) $entity->getKey(),
            'proof_type' => $proofType,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildAnprEventPayloadSummary(AnprEvent $event, string $proofType): array
    {
        return [
            'module' => 'anpr',
            'entity_type' => 'anpr_event',
            'entity_id' => (string) $event->id,
            'proof_type' => $proofType,
            'plate_number' => (string) $event->plate_number,
            'camera_id' => (string) $event->camera_id,
            'detection_time' => BlockchainCanonicalJson::normalize($event->detection_time),
            'confidence' => number_format((float) $event->confidence, 4, '.', ''),
            'is_valid' => (bool) $event->is_valid,
            'is_flagged' => (bool) $event->is_flagged,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function buildAnprImagePayloadSummary(AnprImage $image, string $proofType): array
    {
        $evidence = $this->hashService->resolveImageEvidenceMetadata($image);

        return [
            'module' => 'anpr',
            'entity_type' => 'anpr_image',
            'entity_id' => (string) $image->id,
            'proof_type' => $proofType,
            'anpr_event_id' => (string) $image->anpr_event_id,
            'image_type' => (string) $image->image_type,
            'file_path' => $evidence['relative_path'],
            'file_sha256' => $evidence['file_sha256'],
            'file_size' => $evidence['file_size'],
            'resolution' => $evidence['resolution'],
            'evidence_hash_source' => $evidence['evidence_hash_source'],
        ];
    }

    private function configuredChainId(): ?int
    {
        $chainId = config('blockchain.chain_id');

        if ($chainId === null || $chainId === '') {
            return null;
        }

        if (is_int($chainId)) {
            return $chainId > 0 ? $chainId : null;
        }

        if (is_string($chainId) && preg_match('/^[1-9][0-9]*$/', $chainId) === 1) {
            return (int) $chainId;
        }

        return null;
    }

    private function linkAnprEventIfAppropriate(Model $entity, BlockchainRecord $record): void
    {
        if (! $entity instanceof AnprEvent) {
            return;
        }

        if ($entity->blockchain_record_id !== null) {
            return;
        }

        $entity->update([
            'blockchain_record_id' => $record->id,
        ]);
    }

    public function retryFailedRecord(BlockchainRecord $record): BlockchainRecord
    {
        if (! $record->isFailed()) {
            throw new InvalidArgumentException('Only failed blockchain records can be retried.');
        }

        $maxAttempts = max(1, (int) config('blockchain.max_retries', 5));
        $staleTxHash = is_string($record->tx_hash) ? strtolower(trim($record->tx_hash)) : null;

        $this->retryService->cancelQueuedRetryJobs($record->id);
        $this->retryService->cancelQueuedRefreshJobs($record->id);

        $queuedJob = BlockchainJob::query()->create([
            'blockchain_record_id' => $record->id,
            'job_type' => 'retry_anchor',
            'status' => 'queued',
            'attempts' => 1,
            'max_attempts' => $maxAttempts,
            'next_attempt_at' => now(),
            'context_tx_hash' => $staleTxHash,
        ]);

        $record->update([
            'status' => 'processing',
            'last_error' => null,
        ]);

        AnchorBlockchainRecordJob::dispatch(
            $record->id,
            isRetryAttempt: true,
            expectedBlockchainJobId: $queuedJob->id,
            isManualAdminRetry: true,
        );

        return $record->fresh([
            'jobs' => fn ($query) => $query->latest('created_at'),
        ]);
    }

    private function maybeQueueForAnchoring(BlockchainRecord $record): void
    {
        if (! config('blockchain.enabled')) {
            return;
        }

        if (in_array($record->status, ['queued', 'processing', 'submitted', 'confirmed'], true)) {
            return;
        }

        if ($record->status !== 'pending') {
            return;
        }

        $record->markAsQueued();

        AnchorBlockchainRecordJob::dispatch($record->id);
    }
}
