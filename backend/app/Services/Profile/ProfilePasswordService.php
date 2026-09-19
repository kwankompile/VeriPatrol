<?php

namespace App\Services\Profile;

use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Services\Auth\RefreshTokenService;
use App\Support\Profile\ProfileStepUpRateLimitedException;
use App\Support\Profile\ProfileStepUpVerificationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProfilePasswordService
{
    public function __construct(
        private readonly ProfileSecurityService $profileSecurityService,
        private readonly RefreshTokenService $refreshTokenService,
        private readonly AuthAuditService $authAuditService,
        private readonly ProfileBlockchainService $profileBlockchainService,
    ) {}

    /**
     * @param  array{current_password: string, password: string, otp: string}  $validated
     * @return array{revoked_count: int, profile_version: int}
     *
     * @throws ProfileStepUpRateLimitedException
     * @throws ProfileStepUpVerificationException
     */
    public function changePassword(User $user, array $validated, Request $request): array
    {
        try {
            $this->profileSecurityService->verifyStepUp(
                $user,
                $validated['current_password'],
                $validated['otp'],
                $request,
            );
        } catch (ProfileStepUpRateLimitedException $exception) {
            $this->recordPasswordChangeFailure($user, $request, 'step_up_rate_limited');

            throw $exception;
        } catch (ProfileStepUpVerificationException $exception) {
            $this->recordPasswordChangeFailure($user, $request, 'step_up_failed');

            throw $exception;
        }

        $result = DB::transaction(function () use ($user, $validated, $request): array {
            /** @var User $locked */
            $locked = User::query()
                ->whereKey($user->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            $now = now();

            $locked->password = $validated['password'];
            $locked->forceFill([
                'last_password_changed_at' => $now,
                'last_security_changed_at' => $now,
            ]);
            $locked->profile_version = ((int) $locked->profile_version) + 1;
            $locked->save();

            $revokedCount = $this->refreshTokenService->revokeAllForUser($locked);

            $this->authAuditService->record(
                AuthAuditService::EVENT_PASSWORD_CHANGED,
                AuthAuditService::STATUS_SUCCESS,
                $request,
                user: $locked,
                metadata: [
                    'source' => 'self_profile',
                    'target_user_id' => $locked->getKey(),
                    'changed_by_user_id' => $locked->getKey(),
                    'profile_version' => (int) $locked->profile_version,
                    'revoked_count' => $revokedCount,
                ],
            );

            return [
                'revoked_count' => $revokedCount,
                'profile_version' => (int) $locked->profile_version,
                'changed_at' => $now,
            ];
        });

        $this->profileBlockchainService->recordPasswordChanged(
            $user->fresh(),
            $result['profile_version'],
            $result['revoked_count'],
            $request,
            $result['changed_at'],
        );

        return [
            'revoked_count' => $result['revoked_count'],
            'profile_version' => $result['profile_version'],
        ];
    }

    private function recordPasswordChangeFailure(User $user, Request $request, string $reason): void
    {
        $this->authAuditService->record(
            AuthAuditService::EVENT_PASSWORD_CHANGE_FAILED,
            AuthAuditService::STATUS_FAILURE,
            $request,
            user: $user,
            metadata: [
                'source' => 'self_profile',
                'target_user_id' => $user->getKey(),
                'reason' => $reason,
                'profile_version' => (int) $user->profile_version,
            ],
            omitTopLevelEmail: true,
        );
    }
}
