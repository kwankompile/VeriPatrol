<?php

namespace App\Services\Blockchain;

use App\Models\AnprEvent;
use App\Models\AnprImage;
use App\Models\BlockchainJob;
use App\Models\BlockchainRecord;
use App\Models\BlockchainVerification;
use App\Models\PatrolSession;
use App\Models\User;
use App\Services\PatrolValidationService;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;
use Throwable;

class BlockchainVerificationService
{
    private const VERIFICATION_TYPES = [
        'manual',
        'scheduled',
        'api',
        'system',
    ];

    public function __construct(
        private readonly BlockchainHashService $hashService,
        private readonly EthereumRpcClient $ethereumRpcClient,
        private readonly BlockchainRetryService $retryService,
        private readonly PatrolValidationService $patrolValidationService,
    ) {}

    public function verify(
        BlockchainRecord $record,
        string $verificationType = 'manual',
        ?User $verifiedBy = null,
    ): BlockchainVerification {
        $this->assertValidVerificationType($verificationType);

        $storedHash = $this->normalizeStoredHash((string) $record->record_hash);

        $job = BlockchainJob::query()->create([
            'blockchain_record_id' => $record->id,
            'job_type' => 'verify',
            'status' => 'processing',
            'attempts' => 1,
            'max_attempts' => 1,
            'started_at' => now(),
        ]);

        try {
            if (! $record->isConfirmed()) {
                return $this->persistVerification(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    [
                        'stored_hash' => $storedHash,
                        'recomputed_hash' => null,
                        'onchain_hash' => null,
                        'onchain_found' => null,
                        'result' => 'pending',
                        'error_message' => null,
                    ],
                    jobSucceeded: true,
                );
            }

            if ($record->entity_type === 'user_profile') {
                return $this->verifyUserProfileRecord(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    $storedHash,
                );
            }

            if ($record->entity_type === 'patrol_session') {
                return $this->verifyPatrolSessionRecord(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    $storedHash,
                );
            }

            $entity = $this->resolveEntity($record);

            if ($entity === null) {
                return $this->persistVerification(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    [
                        'stored_hash' => $storedHash,
                        'recomputed_hash' => null,
                        'onchain_hash' => null,
                        'onchain_found' => null,
                        'result' => 'failed',
                        'error_message' => $this->entityResolutionErrorMessage($record),
                    ],
                    jobSucceeded: false,
                );
            }

            $hashResult = $this->hashService->hashEntity($entity, (string) $record->proof_type);
            $recomputedHash = $this->normalizeStoredHash($hashResult['record_hash']);

            if ($recomputedHash !== $storedHash) {
                return $this->persistVerification(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    [
                        'stored_hash' => $storedHash,
                        'recomputed_hash' => $recomputedHash,
                        'onchain_hash' => null,
                        'onchain_found' => null,
                        'result' => 'tampered',
                        'error_message' => null,
                    ],
                    jobSucceeded: true,
                );
            }

            $onchainFound = $this->ethereumRpcClient->verifyHash(
                $storedHash,
                $record->contract_address,
            );

            if ($onchainFound) {
                return $this->persistVerification(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    [
                        'stored_hash' => $storedHash,
                        'recomputed_hash' => $recomputedHash,
                        'onchain_hash' => $storedHash,
                        'onchain_found' => true,
                        'result' => 'valid',
                        'error_message' => null,
                    ],
                    jobSucceeded: true,
                );
            }

            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => $recomputedHash,
                    'onchain_hash' => null,
                    'onchain_found' => false,
                    'result' => 'onchain_missing',
                    'error_message' => null,
                ],
                jobSucceeded: true,
            );
        } catch (Throwable $exception) {
            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => null,
                    'onchain_hash' => null,
                    'onchain_found' => null,
                    'result' => 'failed',
                    'error_message' => $this->retryService->sanitizeError($exception->getMessage()),
                ],
                jobSucceeded: false,
            );
        }
    }

    private function resolveEntity(BlockchainRecord $record): ?Model
    {
        return match ($record->entity_type) {
            'anpr_event' => AnprEvent::query()->find($record->entity_id),
            'anpr_image' => AnprImage::query()->find($record->entity_id),
            'patrol_session' => PatrolSession::query()->find($record->entity_id),
            default => null,
        };
    }

    private function verifyPatrolSessionRecord(
        BlockchainRecord $record,
        BlockchainJob $job,
        string $verificationType,
        ?User $verifiedBy,
        string $storedHash,
    ): BlockchainVerification {
        $patrolSession = PatrolSession::query()->find($record->entity_id);

        if ($patrolSession === null) {
            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => null,
                    'onchain_hash' => null,
                    'onchain_found' => null,
                    'result' => 'failed',
                    'error_message' => 'Source patrol session no longer exists for blockchain verification.',
                ],
                jobSucceeded: false,
            );
        }

        if ($record->proof_type !== 'validation_result') {
            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => null,
                    'onchain_hash' => null,
                    'onchain_found' => null,
                    'result' => 'failed',
                    'error_message' => 'Unsupported patrol blockchain proof type: '.$record->proof_type,
                ],
                jobSucceeded: false,
            );
        }

        try {
            $movementSummary = $this->patrolValidationService->collectMovementAnomalySummary($patrolSession);
            $payload = $this->hashService->buildPatrolSessionValidationPayloadFromDatabase(
                $patrolSession,
                $movementSummary,
                (string) $record->proof_type,
            );
            $hashResult = $this->hashService->hashPayload($payload);
            $recomputedHash = $this->normalizeStoredHash($hashResult['record_hash']);

            if ($recomputedHash !== $storedHash) {
                return $this->persistVerification(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    [
                        'stored_hash' => $storedHash,
                        'recomputed_hash' => $recomputedHash,
                        'onchain_hash' => null,
                        'onchain_found' => null,
                        'result' => 'tampered',
                        'error_message' => null,
                    ],
                    jobSucceeded: true,
                );
            }

            $onchainFound = $this->ethereumRpcClient->verifyHash(
                $storedHash,
                $record->contract_address,
            );

            if ($onchainFound) {
                return $this->persistVerification(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    [
                        'stored_hash' => $storedHash,
                        'recomputed_hash' => $recomputedHash,
                        'onchain_hash' => $storedHash,
                        'onchain_found' => true,
                        'result' => 'valid',
                        'error_message' => null,
                    ],
                    jobSucceeded: true,
                );
            }

            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => $recomputedHash,
                    'onchain_hash' => null,
                    'onchain_found' => false,
                    'result' => 'onchain_missing',
                    'error_message' => null,
                ],
                jobSucceeded: true,
            );
        } catch (Throwable $exception) {
            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => null,
                    'onchain_hash' => null,
                    'onchain_found' => null,
                    'result' => 'failed',
                    'error_message' => $this->retryService->sanitizeError($exception->getMessage()),
                ],
                jobSucceeded: false,
            );
        }
    }

    private function verifyUserProfileRecord(
        BlockchainRecord $record,
        BlockchainJob $job,
        string $verificationType,
        ?User $verifiedBy,
        string $storedHash,
    ): BlockchainVerification {
        $payloadSummary = $record->payload_summary;

        if (! is_array($payloadSummary) || ! $this->isValidUserProfilePayloadSummary($payloadSummary)) {
            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => null,
                    'onchain_hash' => null,
                    'onchain_found' => null,
                    'result' => 'failed',
                    'error_message' => 'Profile blockchain payload summary is missing or invalid.',
                ],
                jobSucceeded: false,
            );
        }

        try {
            $hashResult = $this->hashService->hashPayload($payloadSummary);
            $recomputedHash = $this->normalizeStoredHash($hashResult['record_hash']);

            if ($recomputedHash !== $storedHash) {
                return $this->persistVerification(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    [
                        'stored_hash' => $storedHash,
                        'recomputed_hash' => $recomputedHash,
                        'onchain_hash' => null,
                        'onchain_found' => null,
                        'result' => 'tampered',
                        'error_message' => null,
                    ],
                    jobSucceeded: true,
                );
            }

            $onchainFound = $this->ethereumRpcClient->verifyHash(
                $storedHash,
                $record->contract_address,
            );

            if ($onchainFound) {
                return $this->persistVerification(
                    $record,
                    $job,
                    $verificationType,
                    $verifiedBy,
                    [
                        'stored_hash' => $storedHash,
                        'recomputed_hash' => $recomputedHash,
                        'onchain_hash' => $storedHash,
                        'onchain_found' => true,
                        'result' => 'valid',
                        'error_message' => null,
                    ],
                    jobSucceeded: true,
                );
            }

            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => $recomputedHash,
                    'onchain_hash' => null,
                    'onchain_found' => false,
                    'result' => 'onchain_missing',
                    'error_message' => null,
                ],
                jobSucceeded: true,
            );
        } catch (Throwable $exception) {
            return $this->persistVerification(
                $record,
                $job,
                $verificationType,
                $verifiedBy,
                [
                    'stored_hash' => $storedHash,
                    'recomputed_hash' => null,
                    'onchain_hash' => null,
                    'onchain_found' => null,
                    'result' => 'failed',
                    'error_message' => $this->retryService->sanitizeError($exception->getMessage()),
                ],
                jobSucceeded: false,
            );
        }
    }

    /**
     * @param  array<string, mixed>  $payloadSummary
     */
    private function isValidUserProfilePayloadSummary(array $payloadSummary): bool
    {
        foreach (['entity_type', 'entity_id', 'proof_type', 'profile_version'] as $requiredKey) {
            if (! array_key_exists($requiredKey, $payloadSummary)) {
                return false;
            }
        }

        return ($payloadSummary['entity_type'] ?? null) === 'user_profile';
    }

    private function assertValidVerificationType(string $verificationType): void
    {
        if (! in_array($verificationType, self::VERIFICATION_TYPES, true)) {
            throw new InvalidArgumentException('Invalid blockchain verification type.');
        }
    }

    private function entityResolutionErrorMessage(BlockchainRecord $record): string
    {
        if (! in_array($record->entity_type, ['anpr_event', 'anpr_image', 'user_profile', 'patrol_session'], true)) {
            return 'Unsupported blockchain entity type for verification: '.$record->entity_type;
        }

        if ($record->entity_type === 'user_profile') {
            return 'Profile blockchain payload summary is missing or invalid.';
        }

        if ($record->entity_type === 'patrol_session') {
            return 'Source patrol session no longer exists for blockchain verification.';
        }

        return 'Source entity no longer exists for blockchain verification.';
    }

    private function normalizeStoredHash(string $recordHash): string
    {
        $normalized = strtolower(trim($recordHash));

        if (str_starts_with($normalized, '0x')) {
            $normalized = substr($normalized, 2);
        }

        if (! preg_match('/^[a-f0-9]{64}$/', $normalized)) {
            throw new InvalidArgumentException('Blockchain record hash must be a 64-character lowercase hex value.');
        }

        return $normalized;
    }

    /**
     * @param  array{
     *     stored_hash: string,
     *     recomputed_hash: ?string,
     *     onchain_hash: ?string,
     *     onchain_found: ?bool,
     *     result: string,
     *     error_message: ?string
     * }  $payload
     */
    private function persistVerification(
        BlockchainRecord $record,
        BlockchainJob $job,
        string $verificationType,
        ?User $verifiedBy,
        array $payload,
        bool $jobSucceeded,
    ): BlockchainVerification {
        $verification = BlockchainVerification::query()->create([
            'blockchain_record_id' => $record->id,
            'verified_by' => $verifiedBy?->id,
            'verification_type' => $verificationType,
            'stored_hash' => $payload['stored_hash'],
            'recomputed_hash' => $payload['recomputed_hash'],
            'onchain_hash' => $payload['onchain_hash'],
            'onchain_found' => $payload['onchain_found'],
            'result' => $payload['result'],
            'error_message' => $payload['error_message'],
            'verified_at' => now(),
        ]);

        $job->update([
            'status' => $jobSucceeded ? 'success' : 'failed',
            'finished_at' => now(),
            'last_error' => $payload['error_message'],
        ]);

        return $verification->load('verifiedBy');
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{
     *     total_scanned: int,
     *     valid: int,
     *     tampered: int,
     *     pending: int,
     *     onchain_missing: int,
     *     failed: int,
     *     errors: int,
     *     tampered_records: list<array<string, mixed>>,
     *     onchain_missing_records: list<array<string, mixed>>,
     *     failed_records: list<array<string, mixed>>
     * }
     */
    public function verifyAllEligibleRecords(
        array $filters = [],
        ?User $verifiedBy = null,
        int $chunkSize = 25,
    ): array {
        $query = $this->buildEligibleVerificationQuery($filters);

        $summary = [
            'total_scanned' => 0,
            'valid' => 0,
            'tampered' => 0,
            'pending' => 0,
            'onchain_missing' => 0,
            'failed' => 0,
            'errors' => 0,
            'tampered_records' => [],
            'onchain_missing_records' => [],
            'failed_records' => [],
        ];

        $query->orderBy('created_at')->chunkById($chunkSize, function ($records) use (&$summary, $verifiedBy): void {
            foreach ($records as $record) {
                try {
                    $verification = $this->verify($record, 'api', $verifiedBy);
                    $summary['total_scanned']++;
                    $result = $verification->result;

                    match ($result) {
                        'valid' => $summary['valid']++,
                        'tampered' => $summary['tampered']++,
                        'pending' => $summary['pending']++,
                        'onchain_missing' => $summary['onchain_missing']++,
                        default => $summary['failed']++,
                    };

                    if (in_array($result, ['tampered', 'onchain_missing', 'failed'], true)) {
                        $entry = $this->formatBulkVerificationRecord($record, $verification);
                        $listKey = match ($result) {
                            'tampered' => 'tampered_records',
                            'onchain_missing' => 'onchain_missing_records',
                            'failed' => 'failed_records',
                            default => null,
                        };
                        if ($listKey !== null) {
                            $summary[$listKey][] = $entry;
                        }
                    }
                } catch (Throwable) {
                    $summary['total_scanned']++;
                    $summary['errors']++;
                }
            }
        });

        return $summary;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatBulkVerificationRecord(BlockchainRecord $record, BlockchainVerification $verification): array
    {
        return [
            'record_id' => $record->id,
            'entity_type' => $record->entity_type,
            'entity_id' => $record->entity_id,
            'proof_type' => $record->proof_type,
            'network' => $record->network,
            'environment' => $record->environment,
            'chain_id' => $record->chain_id,
            'contract_address' => $record->contract_address,
            'tx_hash' => $record->tx_hash,
            'result' => $verification->result,
            'stored_hash' => $verification->stored_hash,
            'recomputed_hash' => $verification->recomputed_hash,
            'onchain_hash' => $verification->onchain_hash,
            'onchain_found' => $verification->onchain_found,
            'error_message' => $verification->error_message,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     */
    private function buildEligibleVerificationQuery(array $filters)
    {
        $query = BlockchainRecord::query()
            ->whereNotNull('record_hash')
            ->where('record_hash', '!=', '');

        if (! empty($filters['status'])) {
            match ($filters['status']) {
                'pending' => $query->pending(),
                'queued' => $query->queued(),
                'processing' => $query->processing(),
                'submitted' => $query->submitted(),
                'confirmed' => $query->confirmed(),
                'failed' => $query->failed(),
                default => $query->confirmed(),
            };
        } else {
            $query->confirmed();
        }

        if (! empty($filters['network'])) {
            $query->byNetwork($filters['network']);
        }

        if (! empty($filters['environment'])) {
            $query->byEnvironment($filters['environment']);
        }

        if (! empty($filters['entity_type'])) {
            $query->where('entity_type', $filters['entity_type']);
        }

        if (! empty($filters['search'])) {
            $search = $filters['search'];
            $query->where(function ($builder) use ($search): void {
                $builder->where('record_hash', 'like', '%'.$search.'%')
                    ->orWhere('tx_hash', 'like', '%'.$search.'%')
                    ->orWhere('entity_id', 'like', '%'.$search.'%');
            });
        }

        return $query;
    }
}
