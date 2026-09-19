<?php

namespace App\Services;

use App\Models\LocationLog;
use App\Models\PatrolRoute;
use App\Models\PatrolSession;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

/**
 * Canonical patrol movement queries backed by location_logs.
 *
 * Temporary legacy fallback: sessions with no usable location_logs still read
 * patrol_routes. Do not merge both datasets — that duplicates every point.
 */
class PatrolMovementService
{
    public const SOURCE_LOCATION_LOGS = 'location_logs';

    public const SOURCE_LEGACY_PATROL_ROUTES = 'patrol_routes';

    /**
     * Resolve the movement query for a patrol session (location_logs preferred).
     *
     * @return array{source: string, query: Builder}
     */
    public function resolveMovementQueryForSession(PatrolSession|string $patrolSession): array
    {
        $sessionId = $patrolSession instanceof PatrolSession
            ? (string) $patrolSession->getKey()
            : (string) $patrolSession;

        $locationQuery = $this->drawableLocationLogsQuery()
            ->where('patrol_session_id', $sessionId);

        if ((clone $locationQuery)->exists()) {
            return [
                'source' => self::SOURCE_LOCATION_LOGS,
                'query' => $locationQuery,
            ];
        }

        return [
            'source' => self::SOURCE_LEGACY_PATROL_ROUTES,
            'query' => $this->legacyPatrolRoutesQuery()
                ->where('patrol_session_id', $sessionId),
        ];
    }

    /**
     * Ordered drawable movement points for a session (compatibility wrapper).
     *
     * Prefer location_logs; fall back to patrol_routes only when the session has
     * no usable location logs. Temporary — remove once legacy routes are backfilled.
     *
     * @return Collection<int, LocationLog|PatrolRoute>
     */
    public function resolveMovementPointsForSession(PatrolSession|string $patrolSession): Collection
    {
        $resolved = $this->resolveMovementQueryForSession($patrolSession);

        return $resolved['query']->get();
    }

    /**
     * Source table used for the session's drawable route (for diagnostics / tests).
     */
    public function resolveMovementSourceForSession(PatrolSession|string $patrolSession): string
    {
        return $this->resolveMovementQueryForSession($patrolSession)['source'];
    }

    /**
     * Query for map/API route listing. When session id is omitted, uses location_logs only.
     */
    public function movementPointsQuery(?string $patrolSessionId = null): Builder
    {
        if ($patrolSessionId !== null && $patrolSessionId !== '') {
            return $this->resolveMovementQueryForSession($patrolSessionId)['query'];
        }

        return $this->drawableLocationLogsQuery();
    }

    /**
     * Location logs eligible for map / replay display (evidence is never deleted).
     */
    public function drawableLocationLogsQuery(): Builder
    {
        return LocationLog::query()
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->whereBetween('latitude', [-90, 90])
            ->whereBetween('longitude', [-180, 180])
            ->orderBy('timestamp')
            ->orderBy('created_at')
            ->orderBy('id');
    }

    /**
     * Full location-log evidence for validation / summary (includes all stored points).
     * Uses the same deterministic device-time ordering as map routes.
     *
     * @return Builder<LocationLog>
     */
    public function orderedLocationLogsQuery(PatrolSession|string $patrolSession): Builder
    {
        $sessionId = $patrolSession instanceof PatrolSession
            ? (string) $patrolSession->getKey()
            : (string) $patrolSession;

        return LocationLog::query()
            ->where('patrol_session_id', $sessionId)
            ->orderBy('timestamp')
            ->orderBy('created_at')
            ->orderBy('id');
    }

    /**
     * @return Collection<int, LocationLog>
     */
    public function orderedLocationLogsForSession(PatrolSession|string $patrolSession): Collection
    {
        return $this->orderedLocationLogsQuery($patrolSession)->get();
    }

    /**
     * Latest drawable point for dashboard live pins (location_logs, then legacy routes).
     *
     * @return array{latitude: float, longitude: float, recorded_at: Carbon|null}|null
     */
    public function latestDrawablePointForSession(PatrolSession|string $patrolSession): ?array
    {
        $sessionId = $patrolSession instanceof PatrolSession
            ? (string) $patrolSession->getKey()
            : (string) $patrolSession;

        $log = LocationLog::query()
            ->where('patrol_session_id', $sessionId)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->whereBetween('latitude', [-90, 90])
            ->whereBetween('longitude', [-180, 180])
            ->orderByDesc('timestamp')
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first(['latitude', 'longitude', 'timestamp', 'created_at']);

        if ($log !== null) {
            return [
                'latitude' => (float) $log->latitude,
                'longitude' => (float) $log->longitude,
                'recorded_at' => $this->recordedAtFromLocationLog($log),
            ];
        }

        if (! Schema::hasTable('patrol_routes')) {
            return null;
        }

        $route = PatrolRoute::query()
            ->where('patrol_session_id', $sessionId)
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->orderByDesc('recorded_at')
            ->orderByDesc('id')
            ->first(['latitude', 'longitude', 'recorded_at']);

        if ($route === null) {
            return null;
        }

        return [
            'latitude' => (float) $route->latitude,
            'longitude' => (float) $route->longitude,
            'recorded_at' => $route->recorded_at,
        ];
    }

    public function recordedAtFromLocationLog(LocationLog $log): ?Carbon
    {
        if ($this->isValidDeviceTimestamp($log->timestamp)) {
            return Carbon::createFromTimestampMs((int) $log->timestamp);
        }

        return $log->created_at;
    }

    /**
     * @return Builder<PatrolRoute>
     */
    protected function legacyPatrolRoutesQuery(): Builder
    {
        return PatrolRoute::query()
            ->whereNotNull('latitude')
            ->whereNotNull('longitude')
            ->whereBetween('latitude', [-90, 90])
            ->whereBetween('longitude', [-180, 180])
            ->orderBy('recorded_at')
            ->orderBy('id');
    }

    protected function isValidDeviceTimestamp(mixed $timestamp): bool
    {
        if ($timestamp === null || $timestamp === '') {
            return false;
        }

        if (! is_numeric($timestamp)) {
            return false;
        }

        $value = (int) $timestamp;

        return $value > 0;
    }
}
