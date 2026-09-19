<?php

namespace App\Services\Auth;

use App\Models\AuthLoginChallenge;
use App\Models\TwoFactorSetupSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AuthAccountRecoveryService
{
    public function __construct(
        private readonly RefreshTokenService $refreshTokenService,
        private readonly AuthAuditService $authAuditService,
    ) {}

    /**
     * @return array{user: User, revoked_count: int}
     */
    public function resetTwoFactorForUser(User $target, User $admin, ?Request $request = null): array
    {
        return DB::transaction(function () use ($target, $admin, $request) {
            /** @var User $user */
            $user = User::query()->whereKey($target->getKey())->lockForUpdate()->firstOrFail();

            $user->forceFill([
                'two_factor_secret' => null,
                'two_factor_enabled' => false,
                'two_factor_confirmed_at' => null,
            ])->save();

            TwoFactorSetupSession::query()->where('user_id', $user->getKey())->delete();
            AuthLoginChallenge::query()->where('user_id', $user->getKey())->delete();

            $revokedCount = $this->refreshTokenService->revokeAllForUser($user);

            $this->authAuditService->record(
                AuthAuditService::EVENT_TWO_FACTOR_RESET,
                AuthAuditService::STATUS_SUCCESS,
                $request,
                user: $user,
                metadata: [
                    'target_user_id' => $user->getKey(),
                    'target_user_email' => $user->email,
                    'reset_by_user_id' => $admin->getKey(),
                    'revoked_count' => $revokedCount,
                ],
            );

            return [
                'user' => $user->fresh(['role']),
                'revoked_count' => $revokedCount,
            ];
        });
    }
}
