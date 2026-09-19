<?php

namespace App\Services;

use App\Events\Patrol\PatrolCheckpointSuspicious;
use App\Events\Patrol\PatrolCheckpointVerified;
use App\Events\Patrol\PatrolRouteUpdated;
use App\Events\Patrol\PatrolSessionCompleted;
use App\Events\Patrol\PatrolSessionStarted;
use App\Events\Patrol\PatrolValidationCompleted;
use App\Http\Resources\CheckpointEventResource;
use App\Http\Resources\PatrolSessionResource;
use App\Models\CheckpointEvent;
use App\Models\LocationLog;
use App\Models\PatrolRoute;
use App\Models\PatrolSession;
use Illuminate\Broadcasting\BroadcastException;
use Illuminate\Support\Facades\Log;

class PatrolBroadcastService
{
    public function __construct(
        protected PatrolPushNotificationService $pushNotifications,
    ) {}

    public function sessionStarted(PatrolSession $session): void
    {
        if (! $this->shouldBroadcast()) {
            return;
        }

        $session->loadMissing(['user', 'zone', 'blockchainRecord']);

        $this->dispatchSafely(
            fn () => PatrolSessionStarted::dispatch(
                (string) $session->id,
                (new PatrolSessionResource($session))->resolve(),
            ),
            [
                'patrol_session_id' => (string) $session->id,
                'event' => 'PatrolSessionStarted',
            ],
        );
    }

    public function sessionCompleted(PatrolSession $session): void
    {
        if ($this->shouldBroadcast()) {
            $session->loadMissing(['user', 'zone', 'blockchainRecord']);

            $this->dispatchSafely(
                fn () => PatrolSessionCompleted::dispatch(
                    (string) $session->id,
                    (string) $session->status,
                    (new PatrolSessionResource($session))->resolve(),
                ),
                [
                    'patrol_session_id' => (string) $session->id,
                    'event' => 'PatrolSessionCompleted',
                ],
            );
        }

        $this->pushNotifications->sessionCompleted($session);
    }

    /**
     * Compact live-map point from a persisted location_log.
     * Event name remains PatrolRouteUpdated for subscriber compatibility;
     * payload id / location_log_id are location_logs.id.
     */
    public function locationRecorded(LocationLog $locationLog): void
    {
        if (! $this->shouldBroadcast()) {
            return;
        }

        $recordedAt = app(PatrolMovementService::class)
            ->recordedAtFromLocationLog($locationLog)
            ?->toIso8601String()
            ?? now()->toIso8601String();

        $this->dispatchRouteUpdatedSafely(
            patrolSessionId: (string) $locationLog->patrol_session_id,
            latitude: (float) $locationLog->latitude,
            longitude: (float) $locationLog->longitude,
            accuracy: $locationLog->accuracy !== null ? (float) $locationLog->accuracy : null,
            recordedAt: $recordedAt,
            pointId: (string) $locationLog->id,
            logContext: [
                'patrol_session_id' => (string) $locationLog->patrol_session_id,
                'location_log_id' => (string) $locationLog->id,
                'event' => 'PatrolRouteUpdated',
            ],
        );
    }

    /**
     * @deprecated Prefer locationRecorded() from location_logs persistence.
     */
    public function routeUpdated(PatrolRoute $route): void
    {
        if (! $this->shouldBroadcast()) {
            return;
        }

        $this->dispatchRouteUpdatedSafely(
            patrolSessionId: (string) $route->patrol_session_id,
            latitude: (float) $route->latitude,
            longitude: (float) $route->longitude,
            accuracy: $route->accuracy !== null ? (float) $route->accuracy : null,
            recordedAt: $route->recorded_at?->toIso8601String() ?? now()->toIso8601String(),
            pointId: (string) $route->id,
            logContext: [
                'patrol_session_id' => (string) $route->patrol_session_id,
                'route_id' => (string) $route->id,
                'event' => 'PatrolRouteUpdated',
            ],
        );
    }

    /**
     * @param  array<string, mixed>  $logContext
     */
    protected function dispatchRouteUpdatedSafely(
        string $patrolSessionId,
        float $latitude,
        float $longitude,
        ?float $accuracy,
        string $recordedAt,
        string $pointId,
        array $logContext,
    ): void {
        $this->dispatchSafely(
            fn () => PatrolRouteUpdated::dispatch(
                $patrolSessionId,
                $latitude,
                $longitude,
                $accuracy,
                $recordedAt,
                $pointId,
            ),
            $logContext,
        );
    }

    /**
     * @param  callable(): void  $callback
     * @param  array<string, mixed>  $logContext
     */
    protected function dispatchSafely(callable $callback, array $logContext): void
    {
        try {
            $callback();
        } catch (BroadcastException $e) {
            report($e);

            $event = (string) ($logContext['event'] ?? '');
            $message = match ($event) {
                'PatrolValidationCompleted' => 'Patrol validation broadcast failed.',
                'PatrolRouteUpdated' => 'Patrol route broadcast failed.',
                default => 'Patrol broadcast failed.',
            };

            Log::warning($message, $logContext);
        }
    }

    public function checkpointUpdated(CheckpointEvent $checkpointEvent, ?string $previousStatus = null): void
    {
        $checkpointEvent->loadMissing(['checkpoint', 'patrolSession']);
        $payload = $this->checkpointPayload($checkpointEvent);
        $status = strtolower((string) $checkpointEvent->status);

        if ($this->shouldBroadcast()) {
            if ($status === 'verified') {
                $this->dispatchSafely(
                    fn () => PatrolCheckpointVerified::dispatch((string) $checkpointEvent->patrol_session_id, $payload),
                    [
                        'patrol_session_id' => (string) $checkpointEvent->patrol_session_id,
                        'event' => 'PatrolCheckpointVerified',
                    ],
                );
            } elseif (in_array($status, ['suspicious', 'needs_review', 'uncertain'], true)) {
                $this->dispatchSafely(
                    fn () => PatrolCheckpointSuspicious::dispatch((string) $checkpointEvent->patrol_session_id, $payload),
                    [
                        'patrol_session_id' => (string) $checkpointEvent->patrol_session_id,
                        'event' => 'PatrolCheckpointSuspicious',
                    ],
                );
            }
        }

        $this->pushNotifications->checkpointStatusAlert($checkpointEvent, $previousStatus);
    }

    /**
     * @param  array<string, mixed>  $validationResult
     */
    public function validationCompleted(PatrolSession $session, array $validationResult): void
    {
        if ($this->shouldBroadcast()) {
            $this->dispatchSafely(
                fn () => PatrolValidationCompleted::dispatch(
                    (string) $session->id,
                    $this->validationBroadcastSummary($validationResult),
                ),
                [
                    'patrol_session_id' => (string) $session->id,
                    'event' => 'PatrolValidationCompleted',
                ],
            );
        }

        $this->pushNotifications->validationCompleted($session, $validationResult);
    }

    /**
     * @param  array<string, mixed>  $validationResult
     * @return array<string, mixed>
     */
    protected function validationBroadcastSummary(array $validationResult): array
    {
        return [
            'status' => 'completed',
            'overall_status' => $validationResult['overall_status']
                ?? $validationResult['status']
                ?? null,
            'confidence_score' => $validationResult['confidence_score']
                ?? $validationResult['confidence']
                ?? null,
            'validated_at' => $validationResult['validated_at']
                ?? now()->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function checkpointPayload(CheckpointEvent $checkpointEvent): array
    {
        $resolved = (new CheckpointEventResource($checkpointEvent))->resolve();

        return [
            'patrol_session_id' => $checkpointEvent->patrol_session_id,
            'checkpoint_event_id' => $checkpointEvent->id,
            'checkpoint_id' => $checkpointEvent->checkpoint_id,
            'status' => $checkpointEvent->status,
            'confidence_score' => $checkpointEvent->confidence_score,
            'detected_at' => $checkpointEvent->detected_at,
            'checkpoint' => $resolved['checkpoint'] ?? null,
            'event' => $resolved,
        ];
    }

    protected function shouldBroadcast(): bool
    {
        $driver = config('broadcasting.default');

        return is_string($driver) && ! in_array($driver, ['null', 'log'], true);
    }
}
