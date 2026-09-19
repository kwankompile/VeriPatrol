<?php

namespace App\Services\Profile;

use App\Models\BlockchainRecord;
use App\Models\User;
use App\Services\Blockchain\BlockchainRecordService;
use DateTimeInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Throwable;

class ProfileBlockchainService
{
    public const ENTITY_TYPE = 'user_profile';

    public const PROOF_PASSWORD_CHANGED = 'profile_password_changed';

    public const PROOF_EMAIL_CHANGED = 'profile_email_changed';

    public const PROOF_TWO_FACTOR_RECONFIGURED = 'profile_2fa_reconfigured';

    public function __construct(
        private readonly BlockchainRecordService $blockchainRecordService,
    ) {}

    public function recordPasswordChanged(
        User $user,
        int $profileVersion,
        int $revokedCount,
        Request $request,
        DateTimeInterface $changedAt,
    ): ?BlockchainRecord {
        return $this->recordProfileProof(
            user: $user,
            proofType: self::PROOF_PASSWORD_CHANGED,
            profileVersion: $profileVersion,
            revokedCount: $revokedCount,
            changedAt: $changedAt,
            extraPayload: [],
        );
    }

    public function recordEmailChanged(
        User $user,
        int $profileVersion,
        int $revokedCount,
        string $oldEmailHash,
        string $newEmailHash,
        Request $request,
        DateTimeInterface $changedAt,
    ): ?BlockchainRecord {
        return $this->recordProfileProof(
            user: $user,
            proofType: self::PROOF_EMAIL_CHANGED,
            profileVersion: $profileVersion,
            revokedCount: $revokedCount,
            changedAt: $changedAt,
            extraPayload: [
                'old_email_hash' => $oldEmailHash,
                'new_email_hash' => $newEmailHash,
            ],
        );
    }

    public function recordTwoFactorReconfigured(
        User $user,
        int $profileVersion,
        int $revokedCount,
        Request $request,
        DateTimeInterface $changedAt,
    ): ?BlockchainRecord {
        return $this->recordProfileProof(
            user: $user,
            proofType: self::PROOF_TWO_FACTOR_RECONFIGURED,
            profileVersion: $profileVersion,
            revokedCount: $revokedCount,
            changedAt: $changedAt,
            extraPayload: [],
        );
    }

    /**
     * @param  array<string, mixed>  $extraPayload
     */
    private function recordProfileProof(
        User $user,
        string $proofType,
        int $profileVersion,
        int $revokedCount,
        DateTimeInterface $changedAt,
        array $extraPayload,
    ): ?BlockchainRecord {
        try {
            $payload = $this->buildCanonicalPayload(
                user: $user,
                proofType: $proofType,
                profileVersion: $profileVersion,
                revokedCount: $revokedCount,
                changedAt: $changedAt,
                extraPayload: $extraPayload,
            );

            return $this->blockchainRecordService->createForPayload($payload, $payload);
        } catch (Throwable $exception) {
            Log::warning('Profile blockchain record creation failed.', [
                'user_id' => (string) $user->getKey(),
                'proof_type' => $proofType,
                'profile_version' => $profileVersion,
                'error' => $this->sanitizeLogMessage($exception->getMessage()),
            ]);

            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $extraPayload
     * @return array<string, mixed>
     */
    public function buildCanonicalPayload(
        User $user,
        string $proofType,
        int $profileVersion,
        int $revokedCount,
        DateTimeInterface $changedAt,
        array $extraPayload = [],
    ): array {
        $userId = (string) $user->getKey();

        return array_merge([
            'module' => 'profile',
            'entity_type' => self::ENTITY_TYPE,
            'entity_id' => $userId,
            'proof_type' => $proofType,
            'action' => $proofType,
            'profile_version' => $profileVersion,
            'changed_at' => $changedAt,
            'actor_user_id' => $userId,
            'revoked_count' => $revokedCount,
            'source' => 'self_profile',
        ], $extraPayload);
    }

    private function sanitizeLogMessage(string $message): string
    {
        $sanitized = preg_replace('/Bearer\s+\S+/i', '[authorization-redacted]', $message) ?? $message;
        $sanitized = preg_replace('/0x[a-fA-F0-9]{64}/', '[private-key-redacted]', $sanitized) ?? $sanitized;
        $sanitized = preg_replace('#https?://\S+#', '[url-redacted]', $sanitized) ?? $sanitized;

        return mb_substr($sanitized, 0, 500);
    }
}
