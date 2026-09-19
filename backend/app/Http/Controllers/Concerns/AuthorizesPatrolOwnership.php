<?php

namespace App\Http\Controllers\Concerns;

use App\Models\CheckpointEvent;
use App\Models\LocationLog;
use App\Models\PatrolSession;
use App\Models\User;
use App\Support\RoleAccess;
use Illuminate\Auth\Access\AuthorizationException;

trait AuthorizesPatrolOwnership
{
    /**
     * @throws AuthorizationException
     */
    protected function authorizeOwnPatrolSession(PatrolSession $patrolSession): void
    {
        if ($this->isAdminOrSecurityOperator(request()->user('api'))) {
            return;
        }

        $user = request()->user('api');

        if ($patrolSession->user_id !== $user?->getKey()) {
            throw new AuthorizationException('Forbidden.');
        }
    }

    /**
     * @throws AuthorizationException
     */
    protected function authorizePatrolSessionIdBelongsToUser(string $patrolSessionId): PatrolSession
    {
        $patrolSession = PatrolSession::query()->find($patrolSessionId);

        if ($patrolSession === null) {
            throw new AuthorizationException('Forbidden.');
        }

        $this->authorizeOwnPatrolSession($patrolSession);

        return $patrolSession;
    }

    /**
     * @throws AuthorizationException
     */
    protected function authorizeOwnCheckpointEvent(CheckpointEvent $checkpointEvent): void
    {
        $checkpointEvent->loadMissing('patrolSession');

        if ($checkpointEvent->patrolSession === null) {
            throw new AuthorizationException('Forbidden.');
        }

        $this->authorizeOwnPatrolSession($checkpointEvent->patrolSession);
    }

    /**
     * @throws AuthorizationException
     */
    protected function authorizeOwnCheckpointEventId(string $checkpointEventId): CheckpointEvent
    {
        $checkpointEvent = CheckpointEvent::query()->find($checkpointEventId);

        if ($checkpointEvent === null) {
            throw new AuthorizationException('Forbidden.');
        }

        $this->authorizeOwnCheckpointEvent($checkpointEvent);

        return $checkpointEvent;
    }

    /**
     * @param  array<string, mixed>  $data
     *
     * @throws AuthorizationException
     */
    protected function authorizePwaSyncPayload(array $data): void
    {
        if (! $this->isGuard(request()->user('api'))) {
            return;
        }

        $user = request()->user('api');

        if (($data['userId'] ?? null) !== $user?->getKey()) {
            throw new AuthorizationException('Forbidden.');
        }

        $this->authorizePatrolSessionIdBelongsToUser((string) $data['patrolId']);
    }

    /**
     * @throws AuthorizationException
     */
    protected function authorizeOwnLocationLog(LocationLog $locationLog): void
    {
        if ($this->isAdminOrSecurityOperator(request()->user('api'))) {
            return;
        }

        $user = request()->user('api');

        if ($locationLog->user_id !== $user?->getKey()) {
            throw new AuthorizationException('Forbidden.');
        }

        $locationLog->loadMissing('patrolSession');

        if ($locationLog->patrolSession !== null) {
            $this->authorizeOwnPatrolSession($locationLog->patrolSession);
        }
    }

    protected function patrolOwnerUserIdForStore(?User $user, array $validated): string
    {
        if ($this->isGuard($user)) {
            return (string) $user->getKey();
        }

        return (string) $validated['user_id'];
    }

    protected function isAdminOrSecurityOperator(?User $user): bool
    {
        return RoleAccess::canAccessMonitoring($user);
    }

    protected function isGuard(?User $user): bool
    {
        return RoleAccess::isGuard($user);
    }

    /**
     * Reject ownership-link reassignment for non-monitoring operational users.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     *
     * @throws AuthorizationException
     */
    protected function enforceImmutableOwnershipLinkForOperationalUser(
        array $data,
        string $field,
        mixed $currentValue,
    ): array {
        if ($this->isAdminOrSecurityOperator(request()->user('api'))) {
            return $data;
        }

        if (array_key_exists($field, $data) && (string) $data[$field] !== (string) $currentValue) {
            throw new AuthorizationException('Forbidden.');
        }

        unset($data[$field]);

        return $data;
    }
}
