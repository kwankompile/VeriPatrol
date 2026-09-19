<?php

namespace App\Jobs;

use App\Models\BlockchainJob;
use App\Models\BlockchainRecord;
use App\Services\Blockchain\BlockchainRetryService;
use App\Services\Blockchain\BlockchainSubmittedRecordRefreshService;
use App\Services\Blockchain\EthereumRpcClient;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class AnchorBlockchainRecordJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public function __construct(
        public readonly string $blockchainRecordId,
        public readonly bool $isRetryAttempt = false,
        public readonly ?string $expectedBlockchainJobId = null,
        public readonly bool $isManualAdminRetry = false,
    ) {}

    public function handle(
        EthereumRpcClient $ethereumRpcClient,
        BlockchainRetryService $retryService,
        BlockchainSubmittedRecordRefreshService $refreshService,
    ): void {
        $record = BlockchainRecord::query()->find($this->blockchainRecordId);

        if ($record === null) {
            return;
        }

        if ($record->isConfirmed()) {
            if ($this->isRetryAttempt && $this->expectedBlockchainJobId !== null) {
                $retryService->markExpectedRetryJobCancelledForRecord(
                    $this->expectedBlockchainJobId,
                    $record,
                    BlockchainRetryService::ACTIVE_RECORD_RETRY_REASON,
                );
            }

            return;
        }

        if ($this->isRetryAttempt && $this->expectedBlockchainJobId !== null) {
            $queuedJob = BlockchainJob::query()->find($this->expectedBlockchainJobId);
            $staleReason = $retryService->staleRetryReason(
                $record,
                $queuedJob,
                $this->isManualAdminRetry,
            );

            if ($staleReason !== null) {
                $retryService->markExpectedRetryJobCancelledForRecord(
                    $this->expectedBlockchainJobId,
                    $record,
                    $staleReason,
                );

                return;
            }

            $blockchainJob = $this->activateQueuedRetryJob($queuedJob, $retryService);
            $attemptNumber = (int) $blockchainJob->attempts;
        } else {
            $attemptNumber = max(1, (int) $record->retry_count + 1);
            $blockchainJob = $this->createJobRow($record, $attemptNumber, $retryService);
        }

        try {
            if (is_string($record->tx_hash) && $record->tx_hash !== '') {
                if ($this->shouldReanchorStaleTx($record)) {
                    $this->retryOrReanchorWithStaleTxHash(
                        $record, $blockchainJob, $ethereumRpcClient, $retryService, $refreshService
                    );
                } else {
                    // Non-retry anchor where record already has tx_hash (race/edge case — the tx
                    // was submitted by a previous anchor cycle but not yet confirmed). Set the
                    // record to 'submitted' and schedule a clean refresh starting at attempt 1.
                    if ($record->status !== 'submitted') {
                        $record->update(['status' => 'submitted', 'last_error' => null]);
                        $record->refresh();
                    }
                    $refreshService->scheduleRefresh($record, 1);
                    $this->finalizeRetryAnchorOutcome($record, $blockchainJob, 'refresh_scheduled');
                }

                return;
            }

            $record->markAsProcessing();

            $txHash = $ethereumRpcClient->storeHash(
                $record->record_hash,
                $record->contract_address
            );

            $record->markAsSubmitted($txHash);

            $this->confirmFromReceipt($record, $ethereumRpcClient, $retryService, $blockchainJob, $txHash, null, $refreshService);
        } catch (Throwable $exception) {
            $this->handleFailure($record, $blockchainJob, $exception, $retryService, $attemptNumber);
        }
    }

    private function activateQueuedRetryJob(
        BlockchainJob $queuedJob,
        BlockchainRetryService $retryService,
    ): BlockchainJob {
        $queuedJob->update([
            'status' => 'processing',
            'max_attempts' => $retryService->maxAttempts(),
            'started_at' => now(),
            'finished_at' => null,
            'last_error' => null,
            'next_attempt_at' => null,
        ]);

        return $queuedJob->refresh();
    }

    private function createJobRow(
        BlockchainRecord $record,
        int $attemptNumber,
        BlockchainRetryService $retryService,
    ): BlockchainJob {
        if (! $this->isRetryAttempt) {
            $existingAnchorJob = BlockchainJob::query()
                ->where('blockchain_record_id', $record->id)
                ->where('job_type', 'anchor')
                ->whereIn('status', ['queued', 'processing'])
                ->latest('created_at')
                ->first();

            if ($existingAnchorJob !== null) {
                $existingAnchorJob->update([
                    'status' => 'processing',
                    'attempts' => $attemptNumber,
                    'max_attempts' => $retryService->maxAttempts(),
                    'started_at' => now(),
                    'finished_at' => null,
                    'last_error' => null,
                    'next_attempt_at' => null,
                ]);

                return $existingAnchorJob->refresh();
            }
        }

        if ($this->isRetryAttempt) {
            $existingRetryJob = BlockchainJob::query()
                ->where('blockchain_record_id', $record->id)
                ->where('job_type', 'retry_anchor')
                ->whereIn('status', ['queued', 'processing'])
                ->latest('created_at')
                ->first();

            if ($existingRetryJob !== null) {
                $existingRetryJob->update([
                    'status' => 'processing',
                    'attempts' => $attemptNumber,
                    'max_attempts' => $retryService->maxAttempts(),
                    'started_at' => now(),
                    'finished_at' => null,
                    'last_error' => null,
                    'next_attempt_at' => null,
                ]);

                return $existingRetryJob->refresh();
            }
        }

        return BlockchainJob::query()->create([
            'blockchain_record_id' => $record->id,
            'job_type' => $this->isRetryAttempt ? 'retry_anchor' : 'anchor',
            'status' => 'processing',
            'attempts' => $attemptNumber,
            'max_attempts' => $retryService->maxAttempts(),
            'started_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>|null  $receipt
     *
     * @throws RuntimeException
     */
    private function confirmFromReceipt(
        BlockchainRecord $record,
        EthereumRpcClient $ethereumRpcClient,
        BlockchainRetryService $retryService,
        BlockchainJob $blockchainJob,
        string $txHash,
        ?array $receipt = null,
        ?BlockchainSubmittedRecordRefreshService $refreshService = null,
        bool $markJobSuccess = true,
    ): void {
        $receipt ??= $ethereumRpcClient->transactionReceipt($txHash);

        if ($receipt === null) {
            $record->update([
                'status' => 'submitted',
                'tx_hash' => $txHash,
                'submitted_at' => $record->submitted_at ?? now(),
                'last_error' => $retryService->sanitizeError(
                    BlockchainSubmittedRecordRefreshService::MSG_RECEIPT_PENDING
                ),
            ]);

            $refreshService?->scheduleRefresh($record->fresh(), 1);
            if ($markJobSuccess) {
                $this->markAnchorJobSuccess($blockchainJob);
            }

            return;
        }

        if (! $ethereumRpcClient->receiptIndicatesSuccess($receipt)) {
            throw new RuntimeException(BlockchainSubmittedRecordRefreshService::MSG_RECEIPT_FAILED);
        }

        $blockNumber = $ethereumRpcClient->hexQuantityToInt((string) $receipt['blockNumber']);
        $confirmations = $ethereumRpcClient->confirmationsForReceipt($receipt);
        $requiredConfirmations = $ethereumRpcClient->requiredConfirmationBlocks();

        if ($confirmations >= $requiredConfirmations) {
            $record->markAsConfirmed($txHash, $blockNumber, $confirmations);
        } else {
            $record->update([
                'tx_hash' => $txHash,
                'block_number' => $blockNumber,
                'confirmations' => $confirmations,
                'status' => 'submitted',
                'submitted_at' => $record->submitted_at ?? now(),
                'last_error' => $retryService->sanitizeError(
                    BlockchainSubmittedRecordRefreshService::MSG_INSUFFICIENT_CONFIRMATIONS
                ),
            ]);

            $refreshService?->scheduleRefresh($record->fresh(), 1);
        }

        if ($markJobSuccess) {
            $this->markAnchorJobSuccess($blockchainJob);
        }
    }

    /**
     * Failed records with a stale tx_hash must re-anchor or recover on-chain — never refresh-only.
     */
    private function shouldReanchorStaleTx(BlockchainRecord $record): bool
    {
        if ($this->isManualAdminRetry) {
            return true;
        }

        if (! $this->isRetryAttempt) {
            return false;
        }

        return ! $record->isSubmitted() && ! $record->isConfirmed();
    }

    /**
     * Handles the case where an admin retries a failed record that still has an old tx_hash.
     *
     * Strategy:
     *  - Call verifyHash() to check whether the record_hash is already stored on-chain.
     *  - If on-chain: resolve the record as confirmed (no duplicate storeHash call).
     *  - If not on-chain: clear stale tx state and submit a fresh storeHash transaction.
     */
    private function retryOrReanchorWithStaleTxHash(
        BlockchainRecord $record,
        BlockchainJob $blockchainJob,
        EthereumRpcClient $ethereumRpcClient,
        BlockchainRetryService $retryService,
        BlockchainSubmittedRecordRefreshService $refreshService,
    ): void {
        $staleTxHash = strtolower(trim((string) $record->tx_hash));

        $retryService->cancelQueuedRefreshJobs($record->id);

        $isOnChain = false;
        $verifyHashError = null;
        try {
            $isOnChain = $ethereumRpcClient->verifyHash($record->record_hash, $record->contract_address);
        } catch (Throwable $exception) {
            $verifyHashError = $retryService->sanitizeError($exception->getMessage());
        }

        if ($isOnChain) {
            $receipt = null;
            try {
                $receipt = $ethereumRpcClient->transactionReceipt($staleTxHash);
            } catch (Throwable) {
                // Receipt unavailable; recover using verifyHash result only.
            }

            if ($receipt !== null && $ethereumRpcClient->receiptIndicatesSuccess($receipt)) {
                $blockNumber = $ethereumRpcClient->hexQuantityToInt((string) $receipt['blockNumber']);
                $confirmations = $ethereumRpcClient->confirmationsForReceipt($receipt);
                $record->markAsConfirmed($staleTxHash, $blockNumber, $confirmations);
                $recoveryNote = null;
            } else {
                $record->markAsConfirmed($staleTxHash, 0, 0);
                $recoveryNote = 'Recovered on-chain via verifyHash; transaction receipt unavailable.';
                $record->update(['last_error' => $retryService->sanitizeError($recoveryNote)]);
            }

            $this->logRetryDecision($record, $blockchainJob, [
                'stale_tx_hash' => $staleTxHash,
                'verify_hash' => true,
                'action' => 'recovered_onchain',
                'new_tx_hash' => null,
            ]);

            $this->finalizeRetryAnchorOutcome($record, $blockchainJob, 'recovered_onchain', $recoveryNote);

            return;
        }

        $record->update([
            'tx_hash' => null,
            'block_number' => 0,
            'confirmations' => 0,
            'submitted_at' => null,
            'last_error' => null,
            'status' => 'processing',
        ]);
        $record->refresh();

        try {
            $txHash = $ethereumRpcClient->storeHash($record->record_hash, $record->contract_address);
        } catch (Throwable $exception) {
            $this->logRetryDecision($record, $blockchainJob, [
                'stale_tx_hash' => $staleTxHash,
                'verify_hash' => false,
                'verify_hash_error' => $verifyHashError,
                'action' => 'retry_failed',
                'new_tx_hash' => null,
            ]);

            throw $exception;
        }

        $record->markAsSubmitted($txHash);

        $this->logRetryDecision($record, $blockchainJob, [
            'stale_tx_hash' => $staleTxHash,
            'verify_hash' => false,
            'verify_hash_error' => $verifyHashError,
            'action' => 'reanchored_new_tx',
            'new_tx_hash' => $txHash,
        ]);

        $blockchainJob->update(['context_tx_hash' => strtolower($txHash)]);

        $this->confirmFromReceipt(
            $record,
            $ethereumRpcClient,
            $retryService,
            $blockchainJob,
            $txHash,
            null,
            $refreshService,
            markJobSuccess: false,
        );

        $this->finalizeRetryAnchorOutcome($record, $blockchainJob, 'reanchored_new_tx');
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function logRetryDecision(
        BlockchainRecord $record,
        BlockchainJob $blockchainJob,
        array $metadata,
    ): void {
        Log::info('blockchain.retry_decision', array_merge([
            'blockchain_record_id' => $record->id,
            'blockchain_job_id' => $blockchainJob->id,
            'manual_admin_retry' => $this->isManualAdminRetry,
        ], $metadata));
    }

    private function finalizeRetryAnchorOutcome(
        BlockchainRecord $record,
        BlockchainJob $blockchainJob,
        string $action,
        ?string $auditNote = null,
    ): void {
        $record->refresh();

        if ($record->isConfirmed()) {
            $this->finishRetryJobSuccess($blockchainJob, $action, $auditNote);

            return;
        }

        if ($record->isSubmitted() && is_string($record->tx_hash) && $record->tx_hash !== '') {
            $this->finishRetryJobSuccess($blockchainJob, $action, $auditNote);

            return;
        }

        if ($record->isFailed()) {
            $this->finishRetryJobFailed(
                $blockchainJob,
                is_string($record->last_error) && $record->last_error !== ''
                    ? $record->last_error
                    : 'Retry failed without a recoverable on-chain transaction.',
            );

            return;
        }

        $this->finishRetryJobFailed($blockchainJob, "Retry ended in unexpected status: {$record->status}.");
    }

    private function finishRetryJobSuccess(
        BlockchainJob $blockchainJob,
        string $action,
        ?string $auditNote = null,
    ): void {
        $blockchainJob->update([
            'status' => 'success',
            'finished_at' => now(),
            'last_error' => $auditNote !== null
                ? $this->sanitizeAuditNote($action, $auditNote)
                : $this->sanitizeAuditNote($action, "action={$action}"),
            'next_attempt_at' => null,
        ]);
    }

    private function finishRetryJobFailed(BlockchainJob $blockchainJob, string $error): void
    {
        $sanitizedError = app(BlockchainRetryService::class)->sanitizeError($error);

        $blockchainJob->update([
            'status' => 'failed',
            'finished_at' => now(),
            'last_error' => $sanitizedError,
            'next_attempt_at' => null,
        ]);
    }

    private function sanitizeAuditNote(string $action, string $note): string
    {
        $sanitized = app(BlockchainRetryService::class)->sanitizeError($note);

        return mb_substr("[retry_audit action={$action}] {$sanitized}", 0, 1000);
    }

    private function markAnchorJobSuccess(BlockchainJob $blockchainJob): void
    {
        $blockchainJob->update([
            'status' => 'success',
            'finished_at' => now(),
            'last_error' => null,
            'next_attempt_at' => null,
        ]);
    }

    private function handleFailure(
        BlockchainRecord $record,
        BlockchainJob $blockchainJob,
        Throwable $exception,
        BlockchainRetryService $retryService,
        int $attemptNumber,
    ): void {
        $sanitizedError = $retryService->sanitizeError($exception->getMessage());

        $record->markAsFailed($sanitizedError);

        $blockchainJob->update([
            'status' => 'failed',
            'finished_at' => now(),
            'last_error' => $sanitizedError,
        ]);

        if ($this->isManualAdminRetry) {
            return;
        }

        if (! $retryService->canRetry($attemptNumber)) {
            $blockchainJob->update(['next_attempt_at' => null]);

            return;
        }

        $nextAttemptAt = $retryService->nextAttemptAt($attemptNumber);
        $nextAttemptNumber = $attemptNumber + 1;

        $blockchainJob->update([
            'next_attempt_at' => $nextAttemptAt,
        ]);

        $record->update([
            'status' => 'queued',
        ]);

        $queuedRetryJob = BlockchainJob::query()->create([
            'blockchain_record_id' => $record->id,
            'job_type' => 'retry_anchor',
            'status' => 'queued',
            'attempts' => $nextAttemptNumber,
            'max_attempts' => $retryService->maxAttempts(),
            'next_attempt_at' => $nextAttemptAt,
            'last_error' => $sanitizedError,
        ]);

        self::dispatch(
            $record->id,
            isRetryAttempt: true,
            expectedBlockchainJobId: $queuedRetryJob->id,
        )->delay($nextAttemptAt);
    }
}
