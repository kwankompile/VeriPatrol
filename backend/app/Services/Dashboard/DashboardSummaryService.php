<?php

namespace App\Services\Dashboard;

use App\Models\AnprEvent;
use App\Models\AnprImage;
use App\Models\AuthAuditLog;
use App\Models\BlockchainRecord;
use App\Models\Camera;
use App\Models\PatrolSession;
use App\Models\User;
use App\Services\Auth\AuthAuditService;
use App\Services\PatrolMovementService;
use App\Support\ApiDateTime;
use App\Support\CheckpointEventStatus;
use App\Support\RoleAccess;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Schema;

class DashboardSummaryService
{
    private const ONLINE_THRESHOLD_MINUTES = 2;

    private const RECENTLY_SEEN_THRESHOLD_MINUTES = 15;

    private const RECENT_ANPR_LIMIT = 8;

    private const RECENT_PATROL_LIMIT = 8;

    private const RECENT_AUTH_ALERT_LIMIT = 5;

    /** @var list<string> */
    private const ATTENTION_CHECKPOINT_STATUSES = [
        CheckpointEventStatus::PARTIAL,
        CheckpointEventStatus::NEEDS_REVIEW,
        CheckpointEventStatus::SUSPICIOUS,
        CheckpointEventStatus::MISSED,
        'uncertain',
        'rejected',
    ];

    /** @var list<string> */
    private const AUTH_ALERT_EVENT_TYPES = [
        AuthAuditService::EVENT_LOGIN_PASSWORD_FAILURE,
        AuthAuditService::EVENT_LOGIN_RATE_LIMITED,
        AuthAuditService::EVENT_OTP_FAILURE,
        AuthAuditService::EVENT_OTP_CHALLENGE_LOCKED,
        AuthAuditService::EVENT_REFRESH_FAILURE,
        AuthAuditService::EVENT_REFRESH_TOKEN_REUSE_DETECTED,
        AuthAuditService::EVENT_REFRESH_BLOCKED_DISABLED_USER,
    ];

    /**
     * Auth events treated as high-severity security signals.
     *
     * @var list<string>
     */
    private const AUTH_ALERT_HIGH_SEVERITY_EVENTS = [
        AuthAuditService::EVENT_REFRESH_TOKEN_REUSE_DETECTED,
        AuthAuditService::EVENT_OTP_CHALLENGE_LOCKED,
        AuthAuditService::EVENT_LOGIN_RATE_LIMITED,
        AuthAuditService::EVENT_REFRESH_BLOCKED_DISABLED_USER,
    ];

    /** @var array<string, int> */
    private const ANPR_IMAGE_PREFERENCE = [
        'plate' => 0,
        'annotated' => 1,
        'full' => 2,
    ];

    /**
     * @return array<string, mixed>
     */
    public function buildForUser(User $user): array
    {
        $user->loadMissing('role');
        $timezone = (string) config('app.timezone', 'Asia/Kuala_Lumpur');
        $now = now($timezone);
        $todayStart = $now->copy()->startOfDay();
        $todayEnd = $now->copy()->endOfDay();

        $roleName = $user->role?->name ?? 'Unknown';

        $payload = [
            'role' => $roleName,
            'generated_at' => $now->toIso8601String(),
            'timezone' => $timezone,
            'summary' => [],
            'sections' => [],
        ];

        if (RoleAccess::isAdmin($user)) {
            return array_merge($payload, $this->buildAdminPayload($todayStart, $todayEnd, $now));
        }

        if (RoleAccess::isSecurityOperator($user)) {
            return array_merge($payload, $this->buildOperatorPayload($todayStart, $todayEnd, $now));
        }

        if (RoleAccess::isGuard($user)) {
            return array_merge($payload, $this->buildGuardPayload($user, $todayStart, $todayEnd));
        }

        return $payload;
    }

    /**
     * @return array{summary: array<string, mixed>, sections: array<string, mixed>}
     */
    private function buildAdminPayload(CarbonInterface $todayStart, CarbonInterface $todayEnd, CarbonInterface $now): array
    {
        $cameraHealth = $this->cameraHealthCounts($now);
        $blockchain = $this->blockchainHealthCounts();
        $authAlerts = $this->authAlertSummary($now);

        return [
            'summary' => [
                'total_users' => User::query()->count(),
                'active_patrols' => $this->activePatrolCount(),
                'patrols_needing_review' => $this->patrolsNeedingReviewCount(),
                'today_anpr_detections' => $this->todayAnprCount($todayStart, $todayEnd),
                'flagged_anpr_detections' => $this->flaggedAnprCount($todayStart, $todayEnd),
                'camera_health' => $cameraHealth,
                'blockchain' => $blockchain,
                'auth_alerts' => $authAlerts['summary'],
            ],
            'sections' => [
                'recent_anpr_events' => $this->recentAnprEvents(),
                'active_patrol_sessions' => $this->activePatrolSessions(),
                'active_patrol_locations' => $this->activePatrolLocations(),
                'patrol_sessions_needing_review' => $this->patrolSessionsNeedingReview(),
                'camera_health' => $cameraHealth,
                'blockchain_health' => $blockchain,
                'auth_alerts' => $authAlerts['recent'],
            ],
        ];
    }

    /**
     * @return array{summary: array<string, mixed>, sections: array<string, mixed>}
     */
    private function buildOperatorPayload(CarbonInterface $todayStart, CarbonInterface $todayEnd, CarbonInterface $now): array
    {
        $cameraHealth = $this->cameraHealthCounts($now);

        return [
            'summary' => [
                'active_patrols' => $this->activePatrolCount(),
                'patrols_needing_review' => $this->patrolsNeedingReviewCount(),
                'today_anpr_detections' => $this->todayAnprCount($todayStart, $todayEnd),
                'flagged_anpr_detections' => $this->flaggedAnprCount($todayStart, $todayEnd),
                'camera_health' => $cameraHealth,
            ],
            'sections' => [
                'recent_anpr_events' => $this->recentAnprEvents(),
                'active_patrol_sessions' => $this->activePatrolSessions(),
                'active_patrol_locations' => $this->activePatrolLocations(),
                'patrol_sessions_needing_review' => $this->patrolSessionsNeedingReview(),
                'camera_health' => $cameraHealth,
            ],
        ];
    }

    /**
     * @return array{summary: array<string, mixed>, sections: array<string, mixed>}
     */
    private function buildGuardPayload(User $user, CarbonInterface $todayStart, CarbonInterface $todayEnd): array
    {
        $activeSession = PatrolSession::query()
            ->with(['zone'])
            ->where('user_id', $user->getKey())
            ->where('status', 'active')
            ->orderByDesc('started_at')
            ->first();

        $todaySessions = PatrolSession::query()
            ->with(['zone'])
            ->where('user_id', $user->getKey())
            ->whereBetween('started_at', [$todayStart, $todayEnd])
            ->orderByDesc('started_at')
            ->get();

        $recentSessions = PatrolSession::query()
            ->with(['zone'])
            ->where('user_id', $user->getKey())
            ->orderByDesc('started_at')
            ->limit(self::RECENT_PATROL_LIMIT)
            ->get();

        $todayStatus = $this->resolveGuardTodayStatus($todaySessions, $activeSession);

        return [
            'summary' => [
                'has_active_patrol' => $activeSession !== null,
                'active_patrol_session_id' => $activeSession?->id,
                'today_patrol_count' => $todaySessions->count(),
                'today_patrol_status' => $todayStatus,
                'readiness' => [
                    'can_start_patrol' => $activeSession === null,
                    'can_resume_patrol' => $activeSession !== null,
                    'message' => $activeSession
                      ? 'You have an active patrol session that can be resumed.'
                      : 'You are ready to start a new patrol.',
                ],
            ],
            'sections' => [
                'active_patrol' => $activeSession ? $this->formatPatrolSession($activeSession) : null,
                'today_patrol_sessions' => $todaySessions
                    ->map(fn (PatrolSession $session) => $this->formatPatrolSession($session))
                    ->values()
                    ->all(),
                'recent_patrol_sessions' => $recentSessions
                    ->map(fn (PatrolSession $session) => $this->formatPatrolSession($session))
                    ->values()
                    ->all(),
            ],
        ];
    }

    private function activePatrolCount(): int
    {
        return PatrolSession::query()->where('status', 'active')->count();
    }

    private function patrolsNeedingReviewCount(): int
    {
        return $this->patrolsNeedingReviewQuery()->count();
    }

    private function todayAnprCount(CarbonInterface $todayStart, CarbonInterface $todayEnd): int
    {
        return AnprEvent::query()
            ->whereBetween('detection_time', [$todayStart, $todayEnd])
            ->count();
    }

    private function flaggedAnprCount(CarbonInterface $todayStart, CarbonInterface $todayEnd): int
    {
        return AnprEvent::query()
            ->whereBetween('detection_time', [$todayStart, $todayEnd])
            ->where('is_flagged', true)
            ->count();
    }

    /**
     * @return array{online: int, recently_seen: int, offline: int, inactive: int, total: int}
     */
    private function cameraHealthCounts(CarbonInterface $now): array
    {
        $empty = [
            'online' => 0,
            'recently_seen' => 0,
            'offline' => 0,
            'inactive' => 0,
            'total' => 0,
        ];

        if (! Schema::hasTable('cameras')) {
            return $empty;
        }

        $hasIsActive = Schema::hasColumn('cameras', 'is_active');
        $hasCredentialEnabled = Schema::hasColumn('cameras', 'credential_enabled');
        $hasLastSeenAt = Schema::hasColumn('cameras', 'last_seen_at');

        $columns = array_values(array_filter([
            'id',
            $hasIsActive ? 'is_active' : null,
            $hasCredentialEnabled ? 'credential_enabled' : null,
            $hasLastSeenAt ? 'last_seen_at' : null,
        ]));

        try {
            $cameras = Camera::query()->get($columns);
        } catch (QueryException $exception) {
            report($exception);

            return $empty;
        }

        $onlineCutoff = $now->copy()->subMinutes(self::ONLINE_THRESHOLD_MINUTES);
        $recentCutoff = $now->copy()->subMinutes(self::RECENTLY_SEEN_THRESHOLD_MINUTES);

        $online = 0;
        $recentlySeen = 0;
        $offline = 0;
        $inactive = 0;

        foreach ($cameras as $camera) {
            $isActive = $hasIsActive ? (bool) $camera->is_active : true;
            $credentialEnabled = $hasCredentialEnabled ? (bool) $camera->credential_enabled : true;

            if (! $isActive || ! $credentialEnabled) {
                $inactive++;

                continue;
            }

            $lastSeenAt = $hasLastSeenAt ? $camera->last_seen_at : null;

            if ($lastSeenAt === null) {
                $offline++;

                continue;
            }

            $lastSeen = Carbon::parse($lastSeenAt);

            if ($lastSeen->greaterThanOrEqualTo($onlineCutoff)) {
                $online++;
            } elseif ($lastSeen->greaterThanOrEqualTo($recentCutoff)) {
                $recentlySeen++;
            } else {
                $offline++;
            }
        }

        return [
            'online' => $online,
            'recently_seen' => $recentlySeen,
            'offline' => $offline,
            'inactive' => $inactive,
            'total' => $cameras->count(),
        ];
    }

    /**
     * @return array{pending: int, failed: int, confirmed: int, in_flight: int, network: string, enabled: bool}
     */
    private function blockchainHealthCounts(): array
    {
        $network = (string) config('blockchain.network', 'unknown');
        $enabled = (bool) config('blockchain.enabled', false);

        $empty = [
            'pending' => 0,
            'queued' => 0,
            'processing' => 0,
            'submitted' => 0,
            'failed' => 0,
            'confirmed' => 0,
            'in_flight' => 0,
            'network' => $network,
            'enabled' => $enabled,
        ];

        if (! Schema::hasTable('blockchain_records')) {
            return $empty;
        }

        try {
            $pending = BlockchainRecord::query()->pending()->count();
            $queued = BlockchainRecord::query()->queued()->count();
            $processing = BlockchainRecord::query()->processing()->count();
            $submitted = BlockchainRecord::query()->submitted()->count();
            $failed = BlockchainRecord::query()->failed()->count();
            $confirmed = BlockchainRecord::query()->confirmed()->count();
        } catch (QueryException $exception) {
            report($exception);

            return $empty;
        }

        return [
            'pending' => $pending,
            'queued' => $queued,
            'processing' => $processing,
            'submitted' => $submitted,
            'failed' => $failed,
            'confirmed' => $confirmed,
            'in_flight' => $pending + $queued + $processing + $submitted,
            'network' => $network,
            'enabled' => $enabled,
        ];
    }

    /**
     * @return array{summary: array<string, int>, recent: list<array<string, mixed>>}
     */
    private function authAlertSummary(CarbonInterface $now): array
    {
        $emptySummary = [
            'failed_attempts_24h' => 0,
            'suspicious_events_24h' => 0,
        ];

        if (! Schema::hasTable('auth_audit_logs')) {
            return [
                'summary' => $emptySummary,
                'recent' => [],
            ];
        }

        $since = $now->copy()->subDay();

        try {
            $failedCount = AuthAuditLog::query()
                ->where('occurred_at', '>=', $since)
                ->where('status', AuthAuditService::STATUS_FAILURE)
                ->whereIn('event_type', self::AUTH_ALERT_EVENT_TYPES)
                ->count();

            $suspiciousCount = AuthAuditLog::query()
                ->where('occurred_at', '>=', $since)
                ->whereIn('status', [AuthAuditService::STATUS_FAILURE, AuthAuditService::STATUS_BLOCKED])
                ->whereIn('event_type', [
                    AuthAuditService::EVENT_REFRESH_TOKEN_REUSE_DETECTED,
                    AuthAuditService::EVENT_OTP_CHALLENGE_LOCKED,
                    AuthAuditService::EVENT_LOGIN_RATE_LIMITED,
                ])
                ->count();

            $recent = AuthAuditLog::query()
                ->where('occurred_at', '>=', $since)
                ->whereIn('event_type', self::AUTH_ALERT_EVENT_TYPES)
                ->orderByDesc('occurred_at')
                ->limit(self::RECENT_AUTH_ALERT_LIMIT)
                ->get()
                ->map(fn (AuthAuditLog $log) => $this->formatAuthAlert($log))
                ->values()
                ->all();
        } catch (QueryException $exception) {
            report($exception);

            return [
                'summary' => $emptySummary,
                'recent' => [],
            ];
        }

        return [
            'summary' => [
                'failed_attempts_24h' => $failedCount,
                'suspicious_events_24h' => $suspiciousCount,
            ],
            'recent' => $recent,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function recentAnprEvents(): array
    {
        return AnprEvent::query()
            ->with([
                'camera:id,name',
                'vehicle:id,vehicle_type,status',
                'images:id,anpr_event_id,image_type',
            ])
            ->orderByDesc('detection_time')
            ->limit(self::RECENT_ANPR_LIMIT)
            ->get()
            ->map(fn (AnprEvent $event) => $this->formatAnprEvent($event))
            ->values()
            ->all();
    }

    /**
     * Latest known location for each active patrol, used for the dashboard map panel.
     * Only exposes coordinates and guard/zone labels (no sensitive fields).
     * Canonical source: location_logs (legacy patrol_routes fallback via PatrolMovementService).
     *
     * @return list<array<string, mixed>>
     */
    private function activePatrolLocations(): array
    {
        $sessions = PatrolSession::query()
            ->with(['user:id,name', 'zone:id,name'])
            ->where('status', 'active')
            ->orderByDesc('started_at')
            ->limit(self::RECENT_PATROL_LIMIT)
            ->get();

        if ($sessions->isEmpty()) {
            return [];
        }

        $movementService = app(PatrolMovementService::class);

        return $sessions
            ->map(function (PatrolSession $session) use ($movementService): ?array {
                $point = $movementService->latestDrawablePointForSession($session);

                if ($point === null) {
                    return null;
                }

                return [
                    'session_id' => $session->id,
                    'guard_name' => $session->user?->name,
                    'zone_name' => $session->zone?->name,
                    'latitude' => $point['latitude'],
                    'longitude' => $point['longitude'],
                    'recorded_at' => ApiDateTime::format($point['recorded_at']),
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function activePatrolSessions(): array
    {
        return PatrolSession::query()
            ->with(['user:id,name', 'zone:id,name'])
            ->where('status', 'active')
            ->orderByDesc('started_at')
            ->limit(self::RECENT_PATROL_LIMIT)
            ->get()
            ->map(fn (PatrolSession $session) => $this->formatPatrolSession($session))
            ->values()
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function patrolSessionsNeedingReview(): array
    {
        return $this->patrolsNeedingReviewQuery()
            ->with(['user:id,name', 'zone:id,name'])
            ->orderByDesc('started_at')
            ->limit(self::RECENT_PATROL_LIMIT)
            ->get()
            ->map(fn (PatrolSession $session) => $this->formatPatrolSession($session, true))
            ->values()
            ->all();
    }

    private function patrolsNeedingReviewQuery()
    {
        return PatrolSession::query()
            ->whereHas('checkpointEvents', function ($query): void {
                $query->whereIn('status', self::ATTENTION_CHECKPOINT_STATUSES);
            });
    }

    /**
     * @param  Collection<int, PatrolSession>  $todaySessions
     */
    private function resolveGuardTodayStatus($todaySessions, ?PatrolSession $activeSession): string
    {
        if ($activeSession !== null) {
            return 'active';
        }

        if ($todaySessions->isEmpty()) {
            return 'not_started';
        }

        $latest = $todaySessions->first();

        return (string) ($latest?->status ?? 'unknown');
    }

    /**
     * @return array<string, mixed>
     */
    private function formatAnprEvent(AnprEvent $event): array
    {
        return [
            'id' => $event->id,
            'plate_number' => $event->plate_number ?? '—',
            'confidence' => $event->confidence !== null ? (float) $event->confidence : null,
            'detection_time' => ApiDateTime::format($event->detection_time),
            'camera_name' => $event->camera?->name,
            'vehicle_type' => $event->vehicle?->vehicle_type,
            'is_flagged' => (bool) $event->is_flagged,
            'is_valid' => $event->is_valid,
            'status' => $this->resolveAnprStatus($event),
            'plate_image_url' => $this->resolveAnprThumbnailUrl($event),
        ];
    }

    private function resolveAnprStatus(AnprEvent $event): string
    {
        if ($event->is_flagged) {
            return 'flagged';
        }

        if ($event->is_valid === true) {
            return 'valid';
        }

        if ($event->is_valid === false) {
            return 'invalid';
        }

        return 'unknown';
    }

    /**
     * Build a protected thumbnail URL for the ANPR detection, preferring the plate crop.
     * Returns a route to the authenticated image file endpoint (no raw file paths/secrets).
     */
    private function resolveAnprThumbnailUrl(AnprEvent $event): ?string
    {
        if (! $event->relationLoaded('images')) {
            return null;
        }

        $image = $event->images
            ->sortBy(fn (AnprImage $item) => self::ANPR_IMAGE_PREFERENCE[(string) $item->image_type] ?? 99)
            ->first();

        if ($image === null) {
            return null;
        }

        return url('/api/anpr-images/'.$image->id.'/file');
    }

    /**
     * @return array<string, mixed>
     */
    private function formatPatrolSession(PatrolSession $session, bool $includeAttention = false): array
    {
        $payload = [
            'id' => $session->id,
            'guard_name' => $session->user?->name,
            'zone_name' => $session->zone?->name,
            'started_at' => ApiDateTime::format($session->started_at),
            'ended_at' => ApiDateTime::format($session->ended_at),
            'status' => $session->status ?? 'unknown',
            'checkpoint_progress' => $this->resolveCheckpointProgress($session),
        ];

        if ($includeAttention) {
            $payload['attention_label'] = $this->resolveSessionAttentionLabel($session);
        }

        return $payload;
    }

    /**
     * @return array{completed: int, total: int}
     */
    private function resolveCheckpointProgress(PatrolSession $session): array
    {
        try {
            $total = $session->checkpointEvents()->count();
            $completed = $session->checkpointEvents()
                ->whereIn('status', [CheckpointEventStatus::VERIFIED, CheckpointEventStatus::PARTIAL])
                ->count();
        } catch (QueryException $exception) {
            report($exception);

            return ['completed' => 0, 'total' => 0];
        }

        return ['completed' => $completed, 'total' => $total];
    }

    private function resolveSessionAttentionLabel(PatrolSession $session): string
    {
        $statuses = $session->checkpointEvents()
            ->whereIn('status', self::ATTENTION_CHECKPOINT_STATUSES)
            ->pluck('status')
            ->map(fn (string $status) => CheckpointEventStatus::normalize($status))
            ->unique()
            ->values()
            ->all();

        if (in_array(CheckpointEventStatus::SUSPICIOUS, $statuses, true)) {
            return 'Attention required';
        }

        if (in_array(CheckpointEventStatus::MISSED, $statuses, true)) {
            return 'Incomplete patrol';
        }

        if (in_array(CheckpointEventStatus::PARTIAL, $statuses, true)) {
            return 'Incomplete patrol';
        }

        if (in_array(CheckpointEventStatus::NEEDS_REVIEW, $statuses, true)) {
            return 'Needs review';
        }

        return 'Needs review';
    }

    /**
     * @return array<string, mixed>
     */
    private function formatAuthAlert(AuthAuditLog $log): array
    {
        return [
            'id' => $log->id,
            'event_type' => $log->event_type ?? 'unknown',
            'status' => $log->status ?? 'unknown',
            'email' => $log->email,
            'occurred_at' => ApiDateTime::format($log->occurred_at),
            'severity' => $this->resolveAuthAlertSeverity($log),
        ];
    }

    private function resolveAuthAlertSeverity(AuthAuditLog $log): string
    {
        if (in_array((string) $log->event_type, self::AUTH_ALERT_HIGH_SEVERITY_EVENTS, true)) {
            return 'high';
        }

        if ((string) $log->status === AuthAuditService::STATUS_BLOCKED) {
            return 'high';
        }

        return 'medium';
    }
}
