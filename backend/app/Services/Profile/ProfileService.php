<?php

namespace App\Services\Profile;

use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Support\Profile\ProfileVersionConflictException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProfileService
{
    public function __construct(
        private readonly AuthAuditService $authAuditService,
    ) {}

    public function updateProfile(User $user, array $validated, Request $request): User
    {
        try {
            return DB::transaction(function () use ($user, $validated, $request): User {
                /** @var User $locked */
                $locked = User::query()
                    ->whereKey($user->getKey())
                    ->lockForUpdate()
                    ->firstOrFail();

                $submittedVersion = array_key_exists('profile_version', $validated)
                    ? (int) $validated['profile_version']
                    : null;

                if ($submittedVersion !== null && $submittedVersion !== (int) $locked->profile_version) {
                    throw new ProfileVersionConflictException(
                        $locked->loadMissing('role'),
                        $submittedVersion,
                        (int) $locked->profile_version,
                    );
                }

                $changedFields = [];

                if (array_key_exists('phone', $validated) && $locked->phone !== $validated['phone']) {
                    $locked->phone = $validated['phone'];
                    $changedFields[] = 'phone';
                }

                if (array_key_exists('address', $validated) && $locked->address !== $validated['address']) {
                    $locked->address = $validated['address'];
                    $changedFields[] = 'address';
                }

                if ($changedFields === []) {
                    return $locked->load('role');
                }

                $locked->profile_version = ((int) $locked->profile_version) + 1;
                $locked->save();
                $locked->load('role');

                $this->authAuditService->record(
                    AuthAuditService::EVENT_PROFILE_UPDATED,
                    AuthAuditService::STATUS_SUCCESS,
                    $request,
                    user: $locked,
                    metadata: [
                        'changed_fields' => $changedFields,
                        'profile_version' => (int) $locked->profile_version,
                        'source' => 'self_profile',
                    ],
                );

                return $locked;
            });
        } catch (ProfileVersionConflictException $exception) {
            $this->authAuditService->record(
                AuthAuditService::EVENT_PROFILE_UPDATE_FAILED,
                AuthAuditService::STATUS_FAILURE,
                $request,
                user: $exception->user,
                metadata: [
                    'reason' => 'profile_version_conflict',
                    'submitted_profile_version' => $exception->submittedVersion,
                    'current_profile_version' => $exception->currentVersion,
                    'source' => 'self_profile',
                ],
            );

            throw $exception;
        }
    }
}
