<?php

namespace App\Services\Blockchain;

use App\Models\AnprEvent;
use App\Models\AnprImage;
use App\Models\CheckpointEvent;
use App\Models\PatrolSession;
use App\Services\Anpr\AnprImageFileService;
use App\Support\BlockchainCanonicalJson;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

class BlockchainHashService
{
    public function __construct(
        private readonly AnprImageFileService $imageFileService,
    ) {}
    /**
     * @param  array<string, mixed>  $payload
     * @return array{
     *     canonical_version: string,
     *     hash_algorithm: string,
     *     canonical_payload: array<string, mixed>,
     *     canonical_json: string,
     *     record_hash: string
     * }
     */
    public function hashPayload(array $payload): array
    {
        $canonicalVersion = (string) config('blockchain.canonical_version', 'v1');
        $hashAlgorithm = (string) config('blockchain.hash_algorithm', 'sha256');

        if ($hashAlgorithm !== 'sha256') {
            throw new InvalidArgumentException(
                "Unsupported blockchain hash algorithm: {$hashAlgorithm}"
            );
        }

        $canonicalPayload = BlockchainCanonicalJson::normalize($payload);
        if (! is_array($canonicalPayload)) {
            throw new InvalidArgumentException('Canonical payload must normalize to an array.');
        }

        $canonicalJson = BlockchainCanonicalJson::encode($payload);
        $recordHash = hash('sha256', $canonicalJson);

        return [
            'canonical_version' => $canonicalVersion,
            'hash_algorithm' => $hashAlgorithm,
            'canonical_payload' => $canonicalPayload,
            'canonical_json' => $canonicalJson,
            'record_hash' => $recordHash,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function buildCanonicalPayloadForEntity(Model $entity, string $proofType = 'entity_created'): array
    {
        if ($entity instanceof AnprEvent) {
            return $this->buildAnprEventPayload($entity, $proofType);
        }

        if ($entity instanceof AnprImage) {
            return $this->buildAnprImagePayload($entity, $proofType);
        }

        throw new InvalidArgumentException(
            'Unsupported entity class for blockchain hashing: '.$entity::class
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function buildAnprEventPayload(AnprEvent $event, string $proofType = 'entity_created'): array
    {
        return [
            'entity_type' => 'anpr_event',
            'entity_id' => (string) $event->id,
            'proof_type' => $proofType,
            'camera_id' => (string) $event->camera_id,
            'plate_number' => (string) $event->plate_number,
            'confidence' => number_format((float) $event->confidence, 4, '.', ''),
            'detection_time' => BlockchainCanonicalJson::normalize($event->detection_time),
            'is_flagged' => (bool) $event->is_flagged,
            'is_valid' => (bool) $event->is_valid,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function buildAnprImagePayload(AnprImage $image, string $proofType = 'evidence_file'): array
    {
        $evidence = $this->resolveImageEvidenceMetadata($image);

        return [
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

    /**
     * @return array{
     *     relative_path: ?string,
     *     file_sha256: ?string,
     *     file_size: ?int,
     *     resolution: ?string,
     *     evidence_hash_source: 'file'|'metadata'
     * }
     */
    public function resolveImageEvidenceMetadata(AnprImage $image): array
    {
        $relativePath = $this->normalizeRelativeFilePath($image->file_path);
        $fileSize = is_numeric($image->file_size) ? (int) $image->file_size : null;
        $resolution = is_string($image->resolution) && trim($image->resolution) !== ''
            ? trim($image->resolution)
            : null;

        $absolutePath = is_string($image->file_path) && $image->file_path !== ''
            ? $this->imageFileService->resolveAbsolutePath($image->file_path)
            : null;

        if ($absolutePath !== null) {
            return [
                'relative_path' => $relativePath,
                'file_sha256' => strtolower(hash_file('sha256', $absolutePath)),
                'file_size' => $fileSize ?? (int) filesize($absolutePath),
                'resolution' => $resolution,
                'evidence_hash_source' => 'file',
            ];
        }

        return [
            'relative_path' => $relativePath,
            'file_sha256' => null,
            'file_size' => $fileSize,
            'resolution' => $resolution,
            'evidence_hash_source' => 'metadata',
        ];
    }

    private function normalizeRelativeFilePath(mixed $filePath): ?string
    {
        if (! is_string($filePath) || trim($filePath) === '') {
            return null;
        }

        $normalized = str_replace('\\', '/', trim($filePath));

        if ($this->isAbsolutePath($normalized) || str_contains($normalized, '..')) {
            return null;
        }

        return $normalized;
    }

    private function isAbsolutePath(string $path): bool
    {
        if (str_starts_with($path, '/') || str_starts_with($path, '\\')) {
            return true;
        }

        return (bool) preg_match('/^[A-Za-z]:[\\\\\\/]/', $path);
    }

    /**
     * @param  array{total_location_logs: int, total_gaps: int, total_anomalies: int}  $movementSummary
     * @return array<string, mixed>
     */
    public function buildPatrolSessionValidationPayloadFromDatabase(
        PatrolSession $patrolSession,
        array $movementSummary,
        string $proofType = 'validation_result',
    ): array {
        $patrolSession->loadMissing(['zone.checkpoints', 'checkpointEvents.metric']);

        $checkpointSummaries = $this->buildPatrolCheckpointSummariesFromDatabase($patrolSession);

        return [
            'module' => 'patrol',
            'entity_type' => 'patrol_session',
            'entity_id' => (string) $patrolSession->id,
            'proof_type' => $proofType,
            'patrol_session_id' => (string) $patrolSession->id,
            'zone_id' => (string) $patrolSession->zone_id,
            'user_id' => (string) $patrolSession->user_id,
            'status' => (string) $patrolSession->status,
            'started_at' => BlockchainCanonicalJson::normalize($patrolSession->started_at),
            'ended_at' => BlockchainCanonicalJson::normalize($patrolSession->ended_at),
            'total_location_logs' => (int) ($movementSummary['total_location_logs'] ?? 0),
            'total_checkpoint_count' => (int) ($patrolSession->zone?->checkpoints->count() ?? 0),
            'total_checkpoint_result_count' => count($checkpointSummaries),
            'total_gaps' => (int) ($movementSummary['total_gaps'] ?? 0),
            'total_anomalies' => (int) ($movementSummary['total_anomalies'] ?? 0),
            'checkpoint_results' => $checkpointSummaries,
        ];
    }

    /**
     * @param  array<string, mixed>  $canonicalPayload
     * @return array<string, mixed>
     */
    public function buildPatrolSessionValidationPayloadSummary(array $canonicalPayload): array
    {
        $summary = [
            'module' => 'patrol',
            'entity_type' => 'patrol_session',
            'entity_id' => (string) ($canonicalPayload['entity_id'] ?? ''),
            'proof_type' => (string) ($canonicalPayload['proof_type'] ?? 'validation_result'),
            'patrol_session_id' => (string) ($canonicalPayload['patrol_session_id'] ?? ''),
            'zone_id' => (string) ($canonicalPayload['zone_id'] ?? ''),
            'user_id' => (string) ($canonicalPayload['user_id'] ?? ''),
            'status' => (string) ($canonicalPayload['status'] ?? ''),
            'started_at' => $canonicalPayload['started_at'] ?? null,
            'ended_at' => $canonicalPayload['ended_at'] ?? null,
            'total_location_logs' => (int) ($canonicalPayload['total_location_logs'] ?? 0),
            'total_checkpoint_count' => (int) ($canonicalPayload['total_checkpoint_count'] ?? 0),
            'total_checkpoint_result_count' => (int) ($canonicalPayload['total_checkpoint_result_count'] ?? 0),
            'total_gaps' => (int) ($canonicalPayload['total_gaps'] ?? 0),
            'total_anomalies' => (int) ($canonicalPayload['total_anomalies'] ?? 0),
        ];

        $checkpointResults = $canonicalPayload['checkpoint_results'] ?? [];
        if (is_array($checkpointResults)) {
            $summary['checkpoint_results'] = array_map(
                fn (array $result): array => [
                    'checkpoint_id' => (string) ($result['checkpoint_id'] ?? ''),
                    'status' => (string) ($result['status'] ?? ''),
                    'detection_type' => $result['detection_type'] ?? null,
                    'confidence_score' => (string) ($result['confidence_score'] ?? '0.00'),
                ],
                $checkpointResults,
            );
        }

        return $summary;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function buildPatrolCheckpointSummariesFromDatabase(PatrolSession $patrolSession): array
    {
        return $patrolSession->checkpointEvents
            ->sortBy('checkpoint_id')
            ->values()
            ->map(fn (CheckpointEvent $event): array => $this->buildPatrolCheckpointSummaryFromEvent($event))
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function buildPatrolCheckpointSummaryFromEvent(CheckpointEvent $event): array
    {
        $metric = $event->metric;

        return [
            'checkpoint_id' => (string) $event->checkpoint_id,
            'status' => (string) $event->status,
            'detection_type' => $event->detection_type,
            'confidence_score' => $this->normalizePatrolScore($event->confidence_score),
            'distance_score' => $this->normalizePatrolScore($metric?->distance_score),
            'accuracy_score' => $this->normalizePatrolScore($metric?->accuracy_score),
            'time_score' => $this->normalizePatrolScore($metric?->time_score),
            'stability_score' => $this->normalizePatrolScore($metric?->stability_score),
            'gap_factor' => $this->normalizePatrolScore($metric?->gap_factor),
            'integrity_factor' => $this->normalizePatrolScore($metric?->integrity_factor),
        ];
    }

    private function normalizePatrolScore(mixed $value): string
    {
        if ($value === null || $value === '') {
            return '0.00';
        }

        return number_format((float) $value, 2, '.', '');
    }

    /**
     * @return array{
     *     canonical_version: string,
     *     hash_algorithm: string,
     *     canonical_payload: array<string, mixed>,
     *     canonical_json: string,
     *     record_hash: string
     * }
     */
    public function hashEntity(Model $entity, string $proofType = 'entity_created'): array
    {
        return $this->hashPayload(
            $this->buildCanonicalPayloadForEntity($entity, $proofType)
        );
    }
}
