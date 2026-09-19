<?php

namespace App\Http\Resources;

use App\Models\LocationLog;
use App\Models\PatrolRoute;
use App\Services\PatrolMovementService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Compact route-point shape for maps / replay.
 * Internally sourced from location_logs (or legacy patrol_routes fallback).
 *
 * @mixin LocationLog|PatrolRoute
 */
class PatrolMovementPointResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        if ($this->resource instanceof LocationLog) {
            return $this->fromLocationLog($this->resource);
        }

        if ($this->resource instanceof PatrolRoute) {
            return $this->fromPatrolRoute($this->resource);
        }

        return [
            'id' => $this->id ?? null,
            'patrol_session_id' => $this->patrol_session_id ?? null,
            'latitude' => $this->latitude ?? null,
            'longitude' => $this->longitude ?? null,
            'accuracy' => $this->accuracy ?? null,
            'altitude' => $this->altitude ?? null,
            'recorded_at' => $this->recorded_at ?? null,
            'created_at' => $this->created_at ?? null,
            'patrol_session' => null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function fromLocationLog(LocationLog $log): array
    {
        $recordedAt = app(PatrolMovementService::class)->recordedAtFromLocationLog($log);

        return [
            'id' => $log->id,
            'patrol_session_id' => $log->patrol_session_id,
            'latitude' => $log->latitude,
            'longitude' => $log->longitude,
            'accuracy' => $log->accuracy,
            'altitude' => null,
            'recorded_at' => $recordedAt,
            'created_at' => $log->created_at,
            'patrol_session' => $this->whenLoaded('patrolSession', function () use ($log): ?array {
                if ($log->patrolSession === null) {
                    return null;
                }

                return [
                    'id' => $log->patrolSession->id,
                    'status' => $log->patrolSession->status,
                    'started_at' => $log->patrolSession->started_at,
                    'ended_at' => $log->patrolSession->ended_at,
                ];
            }, null),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function fromPatrolRoute(PatrolRoute $route): array
    {
        return [
            'id' => $route->id,
            'patrol_session_id' => $route->patrol_session_id,
            'latitude' => $route->latitude,
            'longitude' => $route->longitude,
            'accuracy' => $route->accuracy,
            'altitude' => $route->altitude,
            'recorded_at' => $route->recorded_at,
            'created_at' => $route->created_at,
            'patrol_session' => $this->whenLoaded('patrolSession', function () use ($route): ?array {
                if ($route->patrolSession === null) {
                    return null;
                }

                return [
                    'id' => $route->patrolSession->id,
                    'status' => $route->patrolSession->status,
                    'started_at' => $route->patrolSession->started_at,
                    'ended_at' => $route->patrolSession->ended_at,
                ];
            }, null),
        ];
    }
}
