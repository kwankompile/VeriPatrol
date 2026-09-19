<?php

namespace App\Services;

use App\Models\Checkpoint;
use App\Models\CheckpointEvent;
use App\Models\CheckpointEventMetric;
use App\Models\LocationLog;
use App\Models\PatrolSession;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class PatrolValidationService
{
    private const EARTH_RADIUS_METERS = 6371000.0;

    public function __construct(
        protected PatrolMovementService $movementService,
    ) {}

    /**
     * Reconstruct patrol movement and validate checkpoint visits for one session.
     *
     * @return array<string, mixed>
     */
    public function validatePatrolSession(PatrolSession $patrolSession): array
    {
        $patrolSession->loadMissing(['zone.checkpoints']);

        $logs = $this->movementService->orderedLocationLogsForSession($patrolSession);

        $checkpoints = $this->orderedCheckpoints($patrolSession->zone?->checkpoints ?? collect());
        $existingEvents = $patrolSession->checkpointEvents()
            ->get()
            ->keyBy('checkpoint_id');

        $timestampIssues = $this->analyzeTimestampIssues($logs);
        $gaps = $this->detectGaps($logs);
        $segments = $this->buildSegments($logs, $gaps);
        $segmentAnomalies = $this->detectSegmentAnomalies($segments, $logs, $timestampIssues);
        $routeAssessment = $this->assessRouteCorridor($logs, $checkpoints);

        $anomalies = [
            'timestamp_issues' => $timestampIssues,
            'segment_anomalies' => array_values($segmentAnomalies),
            'gaps' => $gaps,
            'route_corridor' => $routeAssessment['summary'],
            'items' => $this->buildAnomalyItems(
                $logs,
                $segments,
                $segmentAnomalies,
                $timestampIssues,
                $routeAssessment['items']
            ),
        ];

        $sessionSignals = $this->sessionAnomalySignals($segmentAnomalies, $routeAssessment);

        $checkpointResults = [];

        foreach ($checkpoints as $checkpoint) {
            $detection = $this->detectCheckpoint($checkpoint, $logs, $segments);
            $segmentIndex = $detection['segment_index'] ?? -1;
            $segmentAnomaly = $segmentAnomalies[$segmentIndex] ?? [];

            $scores = $this->calculateScores(
                $checkpoint,
                $detection,
                $gaps,
                $segmentAnomaly,
                $sessionSignals
            );

            $confidence = $this->finalConfidence($scores);
            if ($detection['detection_type'] === 'resume') {
                $confidence = min($confidence, (float) config('patrol_validation.checkpoint.resume_max_confidence', 79));
            }

            $status = $this->assignStatus(
                $confidence,
                $detection['detection_type'],
                $detection['has_continuous_evidence'],
                $scores['strong_anomaly'],
                $scores['moderate_anomaly'],
                $detection['detected']
            );

            $event = $this->persistCheckpointEvent(
                $patrolSession,
                $checkpoint,
                $existingEvents->get($checkpoint->id),
                $detection,
                $confidence,
                $status
            );

            $this->persistCheckpointEventMetric($event, $scores);

            $checkpointResults[] = [
                'checkpoint_id' => $checkpoint->id,
                'checkpoint_name' => $checkpoint->name,
                'detection_type' => $detection['detection_type'],
                'confidence_score' => round($confidence, 2),
                'status' => $status,
                'distance_score' => $scores['distance_score'],
                'accuracy_score' => $scores['accuracy_score'],
                'time_score' => $scores['time_score'],
                'stability_score' => $scores['stability_score'],
                'gap_factor' => $scores['gap_factor'],
                'integrity_factor' => $scores['integrity_factor'],
            ];
        }

        return [
            'patrol_session_id' => $patrolSession->id,
            'total_location_logs' => $logs->count(),
            'total_segments' => count($segments),
            'total_gaps' => count($gaps),
            'anomalies' => $anomalies,
            'checkpoint_results' => $checkpointResults,
        ];
    }

    /**
     * Read-only movement anomaly counts for blockchain canonical payloads.
     *
     * @return array{total_location_logs: int, total_gaps: int, total_anomalies: int}
     */
    public function collectMovementAnomalySummary(PatrolSession $patrolSession): array
    {
        $logs = $this->movementService->orderedLocationLogsForSession($patrolSession);

        $patrolSession->loadMissing(['zone.checkpoints']);
        $checkpoints = $this->orderedCheckpoints($patrolSession->zone?->checkpoints ?? collect());

        $timestampIssues = $this->analyzeTimestampIssues($logs);
        $gaps = $this->detectGaps($logs);
        $segments = $this->buildSegments($logs, $gaps);
        $segmentAnomalies = $this->detectSegmentAnomalies($segments, $logs, $timestampIssues);
        $routeAssessment = $this->assessRouteCorridor($logs, $checkpoints);
        $items = $this->buildAnomalyItems(
            $logs,
            $segments,
            $segmentAnomalies,
            $timestampIssues,
            $routeAssessment['items']
        );

        return [
            'total_location_logs' => $logs->count(),
            'total_gaps' => count($gaps),
            'total_anomalies' => count($items),
        ];
    }

    /**
     * @param  Collection<int, Checkpoint>  $checkpoints
     * @return Collection<int, Checkpoint>
     */
    private function orderedCheckpoints(Collection $checkpoints): Collection
    {
        return $checkpoints->sortBy([
            fn (Checkpoint $cp) => $cp->created_at?->timestamp ?? PHP_INT_MAX,
            fn (Checkpoint $cp) => (string) $cp->id,
        ])->values();
    }

    /**
     * @param  Collection<int, LocationLog>  $logs
     * @return list<array{previous_log_id: string|null, next_log_id: string|null, gap_seconds: int}>
     */
    private function detectGaps(Collection $logs): array
    {
        $gaps = [];
        $count = $logs->count();
        $gapThreshold = (int) config('patrol_validation.movement.gap_threshold_seconds', 30);

        for ($i = 1; $i < $count; $i++) {
            $previous = $logs[$i - 1];
            $current = $logs[$i];

            if (! $this->isValidTimestamp($previous->timestamp) || ! $this->isValidTimestamp($current->timestamp)) {
                continue;
            }

            $gapSeconds = (int) round(((int) $current->timestamp - (int) $previous->timestamp) / 1000);

            if ($gapSeconds > $gapThreshold) {
                $gaps[] = [
                    'previous_log_id' => $previous->id,
                    'next_log_id' => $current->id,
                    'gap_seconds' => $gapSeconds,
                ];
            }
        }

        return $gaps;
    }

    /**
     * @param  Collection<int, LocationLog>  $logs
     * @param  list<array{previous_log_id: string|null, next_log_id: string|null, gap_seconds: int}>  $gaps
     * @return list<array{segment_index: int, start_timestamp: int|null, end_timestamp: int|null, log_count: int, duration_seconds: int, log_indices: list<int>}>
     */
    private function buildSegments(Collection $logs, array $gaps): array
    {
        if ($logs->isEmpty()) {
            return [];
        }

        $gapAfterIndex = [];
        foreach ($gaps as $gap) {
            foreach ($logs as $index => $log) {
                if ($log->id === $gap['previous_log_id']) {
                    $gapAfterIndex[$index] = true;
                    break;
                }
            }
        }

        $segments = [];
        $currentIndices = [];
        $segmentIndex = 0;

        foreach ($logs as $index => $log) {
            if ($index > 0 && isset($gapAfterIndex[$index - 1])) {
                if ($currentIndices !== []) {
                    $segments[] = $this->segmentMetadata($segmentIndex, $logs, $currentIndices);
                    $segmentIndex++;
                }
                $currentIndices = [];
            }

            $currentIndices[] = $index;
        }

        if ($currentIndices !== []) {
            $segments[] = $this->segmentMetadata($segmentIndex, $logs, $currentIndices);
        }

        return $segments;
    }

    /**
     * @param  Collection<int, LocationLog>  $logs
     * @param  list<int>  $indices
     * @return array{segment_index: int, start_timestamp: int|null, end_timestamp: int|null, log_count: int, duration_seconds: int, log_indices: list<int>}
     */
    private function segmentMetadata(int $segmentIndex, Collection $logs, array $indices): array
    {
        $timestamps = [];
        foreach ($indices as $index) {
            $ts = $logs[$index]->timestamp;
            if ($this->isValidTimestamp($ts)) {
                $timestamps[] = (int) $ts;
            }
        }

        $start = $timestamps !== [] ? min($timestamps) : null;
        $end = $timestamps !== [] ? max($timestamps) : null;
        $duration = ($start !== null && $end !== null)
            ? (int) max(0, round(($end - $start) / 1000))
            : 0;

        return [
            'segment_index' => $segmentIndex,
            'start_timestamp' => $start,
            'end_timestamp' => $end,
            'log_count' => count($indices),
            'duration_seconds' => $duration,
            'log_indices' => $indices,
        ];
    }

    /**
     * @param  Collection<int, LocationLog>  $logs
     * @return array{duplicate_ids: list<string>, invalid_ids: list<string>, out_of_order_ids: list<string>}
     */
    private function analyzeTimestampIssues(Collection $logs): array
    {
        $duplicateIds = [];
        $invalidIds = [];
        $outOfOrderIds = [];
        $seen = [];

        $previousTs = null;
        foreach ($logs as $log) {
            $ts = $log->timestamp;

            if (! $this->isValidTimestamp($ts)) {
                $invalidIds[] = $log->id;

                continue;
            }

            $tsInt = (int) $ts;

            if (isset($seen[$tsInt])) {
                $duplicateIds[] = $log->id;
            }
            $seen[$tsInt] = true;

            if ($previousTs !== null && $tsInt < $previousTs) {
                $outOfOrderIds[] = $log->id;
            }

            $previousTs = $tsInt;
        }

        return [
            'duplicate_ids' => array_values(array_unique($duplicateIds)),
            'invalid_ids' => array_values(array_unique($invalidIds)),
            'out_of_order_ids' => array_values(array_unique($outOfOrderIds)),
        ];
    }

    /**
     * @param  list<array{segment_index: int, start_timestamp: int|null, end_timestamp: int|null, log_count: int, duration_seconds: int, log_indices: list<int>}>  $segments
     * @param  Collection<int, LocationLog>  $logs
     * @param  array{duplicate_ids: list<string>, invalid_ids: list<string>, out_of_order_ids: list<string>}  $timestampIssues
     * @return array<int, array{major: bool, minor: bool, strong: bool, moderate: bool, speed_anomaly: bool, gps_jump: bool, low_accuracy: bool, timestamp_issue: bool, bad_transition_count: int}>
     */
    private function detectSegmentAnomalies(array $segments, Collection $logs, array $timestampIssues): array
    {
        $issueLogIds = array_merge(
            $timestampIssues['duplicate_ids'],
            $timestampIssues['invalid_ids'],
            $timestampIssues['out_of_order_ids']
        );
        $issueLogIdSet = array_flip($issueLogIds);

        $gapThreshold = (int) config('patrol_validation.movement.gap_threshold_seconds', 30);
        $maxSpeed = (float) config('patrol_validation.movement.max_speed_mps', 41.67);
        $jumpDistance = (float) config('patrol_validation.movement.gps_jump_distance_meters', 100);
        $jumpMaxSeconds = (int) config('patrol_validation.movement.gps_jump_max_seconds', 5);
        $severeJumpDistance = (float) config('patrol_validation.movement.severe_jump_distance_meters', 300);
        $minBadSegments = (int) config('patrol_validation.movement.min_consecutive_bad_segments', 2);
        $poorAccuracy = (float) config('patrol_validation.gps.poor_accuracy_meters', 75);
        $ignoreAccuracy = (float) config('patrol_validation.gps.ignore_accuracy_meters', 150);

        $results = [];

        foreach ($segments as $segment) {
            $speedAnomaly = false;
            $gpsJump = false;
            $lowAccuracy = false;
            $timestampIssue = false;
            $badTransitions = 0;
            $severeJump = false;

            $indices = $segment['log_indices'];

            foreach ($indices as $index) {
                $log = $logs[$index];
                if (isset($issueLogIdSet[$log->id])) {
                    $timestampIssue = true;
                }

                $accuracy = $this->resolveAccuracy($log->accuracy);
                if ($accuracy > $poorAccuracy && $accuracy <= $ignoreAccuracy) {
                    $lowAccuracy = true;
                }
            }

            for ($i = 1; $i < count($indices); $i++) {
                $prev = $logs[$indices[$i - 1]];
                $curr = $logs[$indices[$i]];

                if (! $this->isValidTimestamp($prev->timestamp) || ! $this->isValidTimestamp($curr->timestamp)) {
                    continue;
                }

                $deltaSeconds = max(0.001, ((int) $curr->timestamp - (int) $prev->timestamp) / 1000);
                if ($deltaSeconds > $gapThreshold) {
                    continue;
                }

                $prevAccuracy = $this->resolveAccuracy($prev->accuracy);
                $currAccuracy = $this->resolveAccuracy($curr->accuracy);

                if ($prevAccuracy > $ignoreAccuracy || $currAccuracy > $ignoreAccuracy) {
                    continue;
                }

                $distance = $this->haversineMeters(
                    (float) $prev->latitude,
                    (float) $prev->longitude,
                    (float) $curr->latitude,
                    (float) $curr->longitude
                );

                $bothPoor = $prevAccuracy > $poorAccuracy && $currAccuracy > $poorAccuracy;
                $effectiveDistance = $bothPoor
                    ? max(0.0, $distance - (($prevAccuracy + $currAccuracy) * 0.25))
                    : $distance;

                $calculatedSpeed = $effectiveDistance / $deltaSeconds;
                $reportedSpeed = $curr->speed !== null ? (float) $curr->speed : null;
                $effectiveSpeed = max($calculatedSpeed, $reportedSpeed ?? 0.0);

                $isSevereJump = $distance >= $severeJumpDistance
                    && $deltaSeconds <= $jumpMaxSeconds
                    && $prevAccuracy <= $poorAccuracy
                    && $currAccuracy <= $poorAccuracy;

                if ($isSevereJump) {
                    $gpsJump = true;
                    $severeJump = true;
                    $badTransitions++;
                } elseif ($effectiveSpeed > $maxSpeed && ! $bothPoor) {
                    $speedAnomaly = true;
                    $badTransitions++;
                } elseif ($distance > $jumpDistance && $deltaSeconds <= $jumpMaxSeconds && ! $bothPoor) {
                    $gpsJump = true;
                    $badTransitions++;
                }
            }

            $strongMovement = $severeJump || ($badTransitions >= $minBadSegments && ($speedAnomaly || $gpsJump));
            $strongTimestamp = $timestampIssue
                && ($timestampIssues['invalid_ids'] !== [] || $timestampIssues['out_of_order_ids'] !== []);

            $strong = $strongMovement || $strongTimestamp;
            $moderate = ! $strong && ($lowAccuracy || $timestampIssue || $speedAnomaly || $gpsJump);
            $major = $strong;
            $minor = ! $major && $moderate;

            $results[$segment['segment_index']] = [
                'major' => $major,
                'minor' => $minor,
                'strong' => $strong,
                'moderate' => $moderate,
                'speed_anomaly' => $speedAnomaly,
                'gps_jump' => $gpsJump,
                'low_accuracy' => $lowAccuracy,
                'timestamp_issue' => $timestampIssue,
                'bad_transition_count' => $badTransitions,
            ];
        }

        return $results;
    }

    /**
     * @param  Collection<int, LocationLog>  $logs
     * @param  Collection<int, Checkpoint>  $checkpoints
     * @return array{summary: array<string, mixed>, items: list<array<string, mixed>>}
     */
    private function assessRouteCorridor(Collection $logs, Collection $checkpoints): array
    {
        $enabled = (bool) config('patrol_validation.route_corridor.enabled', true);
        $empty = [
            'summary' => [
                'enabled' => $enabled,
                'checkpoint_count' => $checkpoints->count(),
                'usable' => false,
                'deviation_point_count' => 0,
                'severe_deviation' => false,
            ],
            'items' => [],
        ];

        if (! $enabled || $checkpoints->count() < 2 || $logs->isEmpty()) {
            return $empty;
        }

        $corridorMeters = (float) config('patrol_validation.route_corridor.corridor_meters', 75);
        $severeDeviation = (float) config('patrol_validation.route_corridor.severe_deviation_meters', 180);
        $minConsecutive = (int) config('patrol_validation.route_corridor.min_consecutive_deviation_points', 3);
        $ignoreAccuracy = (float) config('patrol_validation.gps.ignore_accuracy_meters', 150);
        $accuracyWeight = (float) config('patrol_validation.gps.accuracy_radius_weight', 0.5);

        $usableLogs = $logs->filter(
            fn (LocationLog $log) => $this->resolveAccuracy($log->accuracy) <= $ignoreAccuracy
        )->values();

        if ($usableLogs->count() < 2) {
            return $empty;
        }

        $deviationPoints = [];
        $consecutive = 0;
        $maxConsecutive = 0;
        $severe = false;

        foreach ($usableLogs as $log) {
            $accuracy = $this->resolveAccuracy($log->accuracy);
            $effectiveCorridor = $corridorMeters + ($accuracy * $accuracyWeight);
            $outsideMeters = $this->distanceOutsideCorridorMeters(
                (float) $log->latitude,
                (float) $log->longitude,
                $checkpoints,
                $effectiveCorridor
            );

            if ($outsideMeters > 0) {
                $consecutive++;
                $maxConsecutive = max($maxConsecutive, $consecutive);
                $deviationPoints[] = [
                    'log' => $log,
                    'distance_meters' => $outsideMeters,
                    'buffer_meters' => $effectiveCorridor,
                ];

                if ($outsideMeters >= $severeDeviation && $accuracy <= (float) config('patrol_validation.gps.poor_accuracy_meters', 75)) {
                    $severe = true;
                }
            } else {
                $consecutive = 0;
            }
        }

        $repeatedDeviation = $maxConsecutive >= $minConsecutive;
        $items = [];

        if ($severe || $repeatedDeviation) {
            foreach ($deviationPoints as $index => $point) {
                $log = $point['log'];
                $items[] = $this->anomalyItem(
                    id: 'route-deviation-'.$log->id,
                    type: 'route_deviation',
                    severity: ($severe && $point['distance_meters'] >= $severeDeviation) ? 'major' : 'minor',
                    message: sprintf(
                        'Route deviation: %.0f m outside expected corridor (buffer %.0f m)',
                        $point['distance_meters'],
                        $point['buffer_meters']
                    ),
                    startLog: $log,
                    endLog: $log,
                    distanceMeters: $point['distance_meters'],
                );
            }
        }

        return [
            'summary' => [
                'enabled' => true,
                'checkpoint_count' => $checkpoints->count(),
                'usable' => true,
                'deviation_point_count' => count($deviationPoints),
                'max_consecutive_deviations' => $maxConsecutive,
                'severe_deviation' => $severe,
                'repeated_deviation' => $repeatedDeviation,
            ],
            'items' => $items,
        ];
    }

    /**
     * Minimum distance outside the union of checkpoint circles and segment corridors.
     * Returns 0 when the point lies inside any allowed region.
     *
     * @param  Collection<int, Checkpoint>  $checkpoints
     */
    private function distanceOutsideCorridorMeters(
        float $lat,
        float $lng,
        Collection $checkpoints,
        float $corridorMeters,
    ): float {
        $minOutside = PHP_FLOAT_MAX;

        foreach ($checkpoints as $checkpoint) {
            $centerDistance = $this->haversineMeters(
                $lat,
                $lng,
                (float) $checkpoint->latitude,
                (float) $checkpoint->longitude
            );
            $allowedRadius = (float) $checkpoint->radius + $corridorMeters;

            if ($centerDistance <= $allowedRadius) {
                return 0.0;
            }

            $minOutside = min($minOutside, $centerDistance - $allowedRadius);
        }

        $points = $checkpoints->map(fn (Checkpoint $cp) => [
            'lat' => (float) $cp->latitude,
            'lng' => (float) $cp->longitude,
        ])->values();

        for ($i = 0; $i < $points->count() - 1; $i++) {
            $segmentDistance = $this->pointToSegmentDistanceMeters(
                $lat,
                $lng,
                $points[$i]['lat'],
                $points[$i]['lng'],
                $points[$i + 1]['lat'],
                $points[$i + 1]['lng']
            );

            if ($segmentDistance <= $corridorMeters) {
                return 0.0;
            }

            $minOutside = min($minOutside, $segmentDistance - $corridorMeters);
        }

        return $minOutside === PHP_FLOAT_MAX ? 0.0 : $minOutside;
    }

    private function pointToSegmentDistanceMeters(
        float $pointLat,
        float $pointLng,
        float $segLat1,
        float $segLng1,
        float $segLat2,
        float $segLng2,
    ): float {
        $ax = deg2rad($segLat1);
        $ay = deg2rad($segLng1);
        $bx = deg2rad($segLat2);
        $by = deg2rad($segLng2);
        $px = deg2rad($pointLat);
        $py = deg2rad($pointLng);

        $dx = $bx - $ax;
        $dy = $by - $ay;

        if (abs($dx) < 1e-12 && abs($dy) < 1e-12) {
            return $this->haversineMeters($pointLat, $pointLng, $segLat1, $segLng1);
        }

        $t = max(0.0, min(1.0, (($px - $ax) * $dx + ($py - $ay) * $dy) / ($dx * $dx + $dy * $dy)));
        $projLat = rad2deg($ax + $t * $dx);
        $projLng = rad2deg($ay + $t * $dy);

        return $this->haversineMeters($pointLat, $pointLng, $projLat, $projLng);
    }

    /**
     * @param  array<int, array{major: bool, minor: bool, strong?: bool, moderate?: bool}>  $segmentAnomalies
     * @param  array{summary: array<string, mixed>, items: list<array<string, mixed>>}  $routeAssessment
     * @return array{strong: bool, moderate: bool}
     */
    private function sessionAnomalySignals(array $segmentAnomalies, array $routeAssessment): array
    {
        $strong = false;
        $moderate = false;

        foreach ($segmentAnomalies as $flags) {
            if (($flags['strong'] ?? false) === true) {
                $strong = true;
            } elseif (($flags['moderate'] ?? false) === true) {
                $moderate = true;
            }
        }

        $routeSummary = $routeAssessment['summary'] ?? [];
        if (($routeSummary['severe_deviation'] ?? false) === true
            || ($routeSummary['repeated_deviation'] ?? false) === true) {
            $strong = true;
        } elseif (($routeSummary['deviation_point_count'] ?? 0) > 0) {
            $moderate = true;
        }

        return ['strong' => $strong, 'moderate' => $moderate];
    }

    /**
     * @param  list<array<string, mixed>>  $routeItems
     * @return list<array<string, mixed>>
     */
    private function buildAnomalyItems(
        Collection $logs,
        array $segments,
        array $segmentAnomalies,
        array $timestampIssues,
        array $routeItems = [],
    ): array {
        $items = [];
        $timestampIssueIds = array_values(array_unique(array_merge(
            $timestampIssues['duplicate_ids'],
            $timestampIssues['invalid_ids'],
            $timestampIssues['out_of_order_ids'],
        )));
        $invalidSet = array_flip($timestampIssues['invalid_ids']);
        $outOfOrderSet = array_flip($timestampIssues['out_of_order_ids']);
        $duplicateSet = array_flip($timestampIssues['duplicate_ids']);

        $gapThreshold = (int) config('patrol_validation.movement.gap_threshold_seconds', 30);
        $maxSpeed = (float) config('patrol_validation.movement.max_speed_mps', 41.67);
        $jumpDistance = (float) config('patrol_validation.movement.gps_jump_distance_meters', 100);
        $jumpMaxSeconds = (int) config('patrol_validation.movement.gps_jump_max_seconds', 5);
        $severeJumpDistance = (float) config('patrol_validation.movement.severe_jump_distance_meters', 300);
        $minBadSegments = (int) config('patrol_validation.movement.min_consecutive_bad_segments', 2);
        $poorAccuracy = (float) config('patrol_validation.gps.poor_accuracy_meters', 75);
        $ignoreAccuracy = (float) config('patrol_validation.gps.ignore_accuracy_meters', 150);

        $badTransitionCounts = [];

        foreach ($segments as $segment) {
            $indices = $segment['log_indices'];
            if ($indices === []) {
                continue;
            }

            $segmentIndex = $segment['segment_index'];
            $flags = $segmentAnomalies[$segmentIndex] ?? [];

            for ($i = 1; $i < count($indices); $i++) {
                $prev = $logs[$indices[$i - 1]];
                $curr = $logs[$indices[$i]];

                if (! $this->isValidTimestamp($prev->timestamp) || ! $this->isValidTimestamp($curr->timestamp)) {
                    continue;
                }

                $deltaSeconds = max(0.001, ((int) $curr->timestamp - (int) $prev->timestamp) / 1000);
                if ($deltaSeconds > $gapThreshold) {
                    continue;
                }

                $prevAccuracy = $this->resolveAccuracy($prev->accuracy);
                $currAccuracy = $this->resolveAccuracy($curr->accuracy);

                if ($prevAccuracy > $ignoreAccuracy || $currAccuracy > $ignoreAccuracy) {
                    continue;
                }

                $distance = $this->haversineMeters(
                    (float) $prev->latitude,
                    (float) $prev->longitude,
                    (float) $curr->latitude,
                    (float) $curr->longitude
                );

                $bothPoor = $prevAccuracy > $poorAccuracy && $currAccuracy > $poorAccuracy;
                $effectiveDistance = $bothPoor
                    ? max(0.0, $distance - (($prevAccuracy + $currAccuracy) * 0.25))
                    : $distance;

                $calculatedSpeed = $effectiveDistance / $deltaSeconds;
                $reportedSpeed = $curr->speed !== null ? (float) $curr->speed : null;
                $effectiveSpeed = max($calculatedSpeed, $reportedSpeed ?? 0.0);

                $pairKey = $prev->id.'-'.$curr->id;
                $isSevereJump = $distance >= $severeJumpDistance
                    && $deltaSeconds <= $jumpMaxSeconds
                    && $prevAccuracy <= $poorAccuracy
                    && $currAccuracy <= $poorAccuracy;

                if ($isSevereJump) {
                    $badTransitionCounts[$pairKey] = ($badTransitionCounts[$pairKey] ?? 0) + 1;
                    $items[] = $this->anomalyItem(
                        id: 'jump-'.$prev->id.'-'.$curr->id,
                        type: 'gps_jump',
                        severity: 'major',
                        message: sprintf(
                            'Severe GPS jump: %.0f m in %.1f s with good accuracy',
                            $distance,
                            $deltaSeconds
                        ),
                        startLog: $prev,
                        endLog: $curr,
                        distanceMeters: $distance,
                        speedMps: $calculatedSpeed,
                        calculatedSpeedMps: $calculatedSpeed,
                        reportedSpeedMps: $reportedSpeed,
                    );
                } elseif ($effectiveSpeed > $maxSpeed && ! $bothPoor) {
                    $badTransitionCounts[$pairKey] = ($badTransitionCounts[$pairKey] ?? 0) + 1;
                    if (count($badTransitionCounts) >= $minBadSegments) {
                        $items[] = $this->anomalyItem(
                            id: 'speed-'.$prev->id.'-'.$curr->id,
                            type: 'speed_anomaly',
                            severity: 'major',
                            message: sprintf(
                                'Speed anomaly: %.1f m/s (%.0f km/h) between consecutive logs',
                                $effectiveSpeed,
                                $effectiveSpeed * 3.6
                            ),
                            startLog: $prev,
                            endLog: $curr,
                            distanceMeters: $distance,
                            speedMps: $effectiveSpeed,
                            calculatedSpeedMps: $calculatedSpeed,
                            reportedSpeedMps: $reportedSpeed,
                        );
                    }
                } elseif ($distance > $jumpDistance && $deltaSeconds <= $jumpMaxSeconds && ! $bothPoor) {
                    $badTransitionCounts[$pairKey] = ($badTransitionCounts[$pairKey] ?? 0) + 1;
                    if (count($badTransitionCounts) >= $minBadSegments) {
                        $items[] = $this->anomalyItem(
                            id: 'jump-'.$prev->id.'-'.$curr->id,
                            type: 'gps_jump',
                            severity: 'major',
                            message: sprintf(
                                'GPS jump: %.0f m in %.1f s without a tracking gap',
                                $distance,
                                $deltaSeconds
                            ),
                            startLog: $prev,
                            endLog: $curr,
                            distanceMeters: $distance,
                            speedMps: $calculatedSpeed,
                            calculatedSpeedMps: $calculatedSpeed,
                            reportedSpeedMps: $reportedSpeed,
                        );
                    }
                }
            }

            if (($flags['low_accuracy'] ?? false) === true) {
                $first = $logs[$indices[0]];
                $last = $logs[$indices[count($indices) - 1]];
                $items[] = $this->anomalyItem(
                    id: 'accuracy-segment-'.$segmentIndex,
                    type: 'poor_accuracy',
                    severity: 'minor',
                    message: 'Poor GPS accuracy detected within movement segment (review context)',
                    startLog: $first,
                    endLog: $last,
                );
            }

            if (($flags['timestamp_issue'] ?? false) === true) {
                $first = $logs[$indices[0]];
                $last = $logs[$indices[count($indices) - 1]];
                $severity = ($flags['strong'] ?? false) ? 'major' : 'minor';
                $items[] = $this->anomalyItem(
                    id: 'timestamp-segment-'.$segmentIndex,
                    type: 'timestamp_issue',
                    severity: $severity,
                    message: 'Timestamp integrity issue within movement segment',
                    startLog: $first,
                    endLog: $last,
                );
            }
        }

        foreach ($timestampIssueIds as $logId) {
            $log = $logs->firstWhere('id', $logId);
            if ($log === null) {
                continue;
            }

            $reason = 'Timestamp issue';
            $severity = 'minor';
            if (isset($invalidSet[$logId])) {
                $reason = 'Invalid or missing timestamp';
                $severity = 'major';
            } elseif (isset($outOfOrderSet[$logId])) {
                $reason = 'Out-of-order timestamp';
                $severity = 'major';
            } elseif (isset($duplicateSet[$logId])) {
                $reason = 'Duplicate timestamp';
                $severity = 'minor';
            }

            $items[] = $this->anomalyItem(
                id: 'timestamp-log-'.$logId,
                type: 'timestamp_issue',
                severity: $severity,
                message: $reason,
                startLog: $log,
                endLog: $log,
            );
        }

        return array_merge($items, $routeItems);
    }

    /**
     * @return array<string, mixed>
     */
    private function anomalyItem(
        string $id,
        string $type,
        string $severity,
        string $message,
        LocationLog $startLog,
        LocationLog $endLog,
        ?float $distanceMeters = null,
        ?float $speedMps = null,
        ?float $calculatedSpeedMps = null,
        ?float $reportedSpeedMps = null,
    ): array {
        $startTs = $this->isValidTimestamp($startLog->timestamp) ? (int) $startLog->timestamp : null;
        $endTs = $this->isValidTimestamp($endLog->timestamp) ? (int) $endLog->timestamp : null;

        $item = [
            'id' => $id,
            'type' => $type,
            'severity' => $severity,
            'message' => $message,
            'start_log_id' => $startLog->id,
            'end_log_id' => $endLog->id,
            'start_timestamp' => $startTs,
            'end_timestamp' => $endTs,
            'start_latitude' => (float) $startLog->latitude,
            'start_longitude' => (float) $startLog->longitude,
            'end_latitude' => (float) $endLog->latitude,
            'end_longitude' => (float) $endLog->longitude,
        ];

        if ($distanceMeters !== null) {
            $item['distance_meters'] = round($distanceMeters, 2);
        }
        if ($speedMps !== null) {
            $item['speed_mps'] = round($speedMps, 2);
        }
        if ($calculatedSpeedMps !== null) {
            $item['calculated_speed_mps'] = round($calculatedSpeedMps, 2);
        }
        if ($reportedSpeedMps !== null) {
            $item['reported_speed_mps'] = round($reportedSpeedMps, 2);
        }

        return $item;
    }

    /**
     * @param  Collection<int, LocationLog>  $logs
     * @param  list<array{segment_index: int, start_timestamp: int|null, end_timestamp: int|null, log_count: int, duration_seconds: int, log_indices: list<int>}>  $segments
     * @return array{
     *     detected: bool,
     *     detection_type: string|null,
     *     has_continuous_evidence: bool,
     *     segment_index: int|null,
     *     entered_at_ms: int|null,
     *     exited_at_ms: int|null,
     *     detected_at_ms: int|null,
     *     closest_distance: float|null,
     *     best_accuracy: float|null,
     *     dwell_seconds: float,
     *     logs_in_radius: list<LocationLog>
     * }
     */
    private function detectCheckpoint(Checkpoint $checkpoint, Collection $logs, array $segments): array
    {
        $empty = [
            'detected' => false,
            'detection_type' => null,
            'has_continuous_evidence' => false,
            'segment_index' => null,
            'entered_at_ms' => null,
            'exited_at_ms' => null,
            'detected_at_ms' => null,
            'closest_distance' => null,
            'best_accuracy' => null,
            'dwell_seconds' => 0.0,
            'logs_in_radius' => [],
        ];

        if ($logs->isEmpty()) {
            return $empty;
        }

        $accuracyWeight = (float) config('patrol_validation.gps.accuracy_radius_weight', 0.5);
        $minDwell = (int) config('patrol_validation.checkpoint.min_continuous_dwell_seconds', 3);

        $logsInRadius = [];
        foreach ($logs as $log) {
            $distance = $this->distanceToCheckpoint($checkpoint, $log);
            $effectiveRadius = (float) $checkpoint->radius + ($this->resolveAccuracy($log->accuracy) * $accuracyWeight);

            if ($distance <= $effectiveRadius) {
                $logsInRadius[] = $log;
            }
        }

        if ($logsInRadius === []) {
            return $empty;
        }

        $closestDistance = min(array_map(
            fn (LocationLog $log) => $this->distanceToCheckpoint($checkpoint, $log),
            $logsInRadius
        ));

        $bestAccuracy = min(array_map(
            fn (LocationLog $log) => $this->resolveAccuracy($log->accuracy),
            $logsInRadius
        ));

        $logIndexById = [];
        foreach ($logs->values() as $idx => $log) {
            $logIndexById[$log->id] = $idx;
        }

        $continuousCandidate = null;
        foreach ($segments as $segment) {
            $segmentLogs = array_values(array_filter(
                $logsInRadius,
                fn (LocationLog $log) => in_array(
                    $logIndexById[$log->id] ?? -1,
                    $segment['log_indices'],
                    true
                )
            ));

            if ($segmentLogs === []) {
                continue;
            }

            $timestamps = array_values(array_filter(array_map(
                fn (LocationLog $log) => $this->isValidTimestamp($log->timestamp) ? (int) $log->timestamp : null,
                $segmentLogs
            )));

            if ($timestamps === []) {
                continue;
            }

            $dwellSeconds = (max($timestamps) - min($timestamps)) / 1000;

            if ($dwellSeconds >= $minDwell) {
                $continuousCandidate = [
                    'segment_index' => $segment['segment_index'],
                    'dwell_seconds' => $dwellSeconds,
                    'entered_at_ms' => min($timestamps),
                    'exited_at_ms' => max($timestamps),
                    'detected_at_ms' => min($timestamps),
                ];
                break;
            }
        }

        if ($continuousCandidate !== null) {
            return array_merge($empty, [
                'detected' => true,
                'detection_type' => 'continuous',
                'has_continuous_evidence' => true,
                'segment_index' => $continuousCandidate['segment_index'],
                'entered_at_ms' => $continuousCandidate['entered_at_ms'],
                'exited_at_ms' => $continuousCandidate['exited_at_ms'],
                'detected_at_ms' => $continuousCandidate['entered_at_ms'],
                'closest_distance' => $closestDistance,
                'best_accuracy' => $bestAccuracy,
                'dwell_seconds' => $continuousCandidate['dwell_seconds'],
                'logs_in_radius' => $logsInRadius,
            ]);
        }

        $resumeLogs = array_values(array_filter(
            $logsInRadius,
            fn (LocationLog $log) => $this->isResumeLog($log)
        ));

        if ($resumeLogs !== []) {
            $timestamps = array_values(array_filter(array_map(
                fn (LocationLog $log) => $this->isValidTimestamp($log->timestamp) ? (int) $log->timestamp : null,
                $resumeLogs
            )));
            $ts = $timestamps !== [] ? min($timestamps) : null;

            return array_merge($empty, [
                'detected' => true,
                'detection_type' => 'resume',
                'has_continuous_evidence' => false,
                'segment_index' => null,
                'entered_at_ms' => $ts,
                'exited_at_ms' => $ts,
                'detected_at_ms' => $ts,
                'closest_distance' => $closestDistance,
                'best_accuracy' => $bestAccuracy,
                'dwell_seconds' => 0.0,
                'logs_in_radius' => $logsInRadius,
            ]);
        }

        return array_merge($empty, [
            'detected' => false,
            'closest_distance' => $closestDistance,
            'best_accuracy' => $bestAccuracy,
            'logs_in_radius' => $logsInRadius,
        ]);
    }

    /**
     * @param  array{major: bool, minor: bool, strong?: bool, moderate?: bool}  $segmentAnomaly
     * @param  array{strong: bool, moderate: bool}  $sessionSignals
     * @return array{
     *     distance_score: float,
     *     accuracy_score: float,
     *     time_score: float,
     *     stability_score: float,
     *     gap_factor: float,
     *     integrity_factor: float,
     *     strong_anomaly: bool,
     *     moderate_anomaly: bool
     * }
     */
    private function calculateScores(
        Checkpoint $checkpoint,
        array $detection,
        array $gaps,
        array $segmentAnomaly,
        array $sessionSignals
    ): array {
        $defaultAccuracy = (float) config('patrol_validation.checkpoint.default_accuracy_meters', 50);
        $minDwell = (int) config('patrol_validation.checkpoint.min_continuous_dwell_seconds', 3);
        $strongFactor = (float) config('patrol_validation.scoring.integrity_factor_strong', 0.5);
        $moderateFactor = (float) config('patrol_validation.scoring.integrity_factor_moderate', 0.9);

        if (! $detection['detected']) {
            return [
                'distance_score' => 0.0,
                'accuracy_score' => 0.0,
                'time_score' => 0.0,
                'stability_score' => 0.0,
                'gap_factor' => $this->gapFactorForWindow($gaps, null, null),
                'integrity_factor' => 1.0,
                'strong_anomaly' => false,
                'moderate_anomaly' => false,
            ];
        }

        $accuracyWeight = (float) config('patrol_validation.gps.accuracy_radius_weight', 0.5);
        $effectiveRadius = (float) $checkpoint->radius + (($detection['best_accuracy'] ?? $defaultAccuracy) * $accuracyWeight);
        $distance = (float) ($detection['closest_distance'] ?? $effectiveRadius);

        $distanceScore = $effectiveRadius > 0
            ? round(max(0.0, min(100.0, 100.0 * (1.0 - ($distance / $effectiveRadius)))), 2)
            : 0.0;

        $accuracy = (float) ($detection['best_accuracy'] ?? $defaultAccuracy);
        $accuracyScore = $this->accuracyScore($accuracy);

        $dwell = (float) $detection['dwell_seconds'];
        $timeScore = $dwell >= $minDwell
            ? 100.0
            : round(max(0.0, min(100.0, ($dwell / $minDwell) * 100.0)), 2);

        $stabilityScore = $this->stabilityScore($detection['logs_in_radius']);

        $gapFactor = $this->gapFactorForWindow(
            $gaps,
            $detection['entered_at_ms'] ?? null,
            $detection['exited_at_ms'] ?? null
        );

        $segmentStrong = ($segmentAnomaly['strong'] ?? false) === true;
        $segmentModerate = ($segmentAnomaly['moderate'] ?? false) === true;
        $strongAnomaly = $segmentStrong || ($sessionSignals['strong'] ?? false);
        $moderateAnomaly = ! $strongAnomaly && ($segmentModerate || ($sessionSignals['moderate'] ?? false));

        $integrityFactor = 1.0;
        if ($strongAnomaly) {
            $integrityFactor = $strongFactor;
        } elseif ($moderateAnomaly) {
            $integrityFactor = $moderateFactor;
        }

        return [
            'distance_score' => $distanceScore,
            'accuracy_score' => $accuracyScore,
            'time_score' => $timeScore,
            'stability_score' => $stabilityScore,
            'gap_factor' => $gapFactor,
            'integrity_factor' => $integrityFactor,
            'strong_anomaly' => $strongAnomaly,
            'moderate_anomaly' => $moderateAnomaly,
        ];
    }

    /**
     * @param  array{
     *     distance_score: float,
     *     accuracy_score: float,
     *     time_score: float,
     *     stability_score: float,
     *     gap_factor: float,
     *     integrity_factor: float
     * }  $scores
     */
    private function finalConfidence(array $scores): float
    {
        $weightDistance = (float) config('patrol_validation.scoring.weight_distance', 0.30);
        $weightAccuracy = (float) config('patrol_validation.scoring.weight_accuracy', 0.25);
        $weightTime = (float) config('patrol_validation.scoring.weight_time', 0.25);
        $weightStability = (float) config('patrol_validation.scoring.weight_stability', 0.20);

        $base = ($weightDistance * $scores['distance_score'])
            + ($weightAccuracy * $scores['accuracy_score'])
            + ($weightTime * $scores['time_score'])
            + ($weightStability * $scores['stability_score']);

        return round($base * $scores['gap_factor'] * $scores['integrity_factor'], 2);
    }

    private function assignStatus(
        float $confidence,
        ?string $detectionType,
        bool $hasContinuousEvidence,
        bool $hasStrongAnomaly,
        bool $hasModerateAnomaly,
        bool $detected
    ): string {
        if (! $detected || $confidence < 50) {
            return 'missed';
        }

        if ($hasStrongAnomaly) {
            return 'suspicious';
        }

        if ($confidence >= 80 && $hasContinuousEvidence && $detectionType === 'continuous' && ! $hasModerateAnomaly) {
            return 'verified';
        }

        if ($detectionType === 'resume' || ! $hasContinuousEvidence) {
            return $confidence >= 60 ? 'partial' : 'needs_review';
        }

        if ($hasModerateAnomaly || $confidence < 70) {
            return 'needs_review';
        }

        if ($confidence >= 60) {
            return 'partial';
        }

        return 'needs_review';
    }

    /**
     * @param  array{
     *     detected: bool,
     *     detection_type: string|null,
     *     entered_at_ms: int|null,
     *     exited_at_ms: int|null,
     *     detected_at_ms: int|null
     * }  $detection
     */
    private function persistCheckpointEvent(
        PatrolSession $patrolSession,
        Checkpoint $checkpoint,
        ?CheckpointEvent $existing,
        array $detection,
        float $confidence,
        string $status
    ): CheckpointEvent {
        $attributes = [
            'patrol_session_id' => $patrolSession->id,
            'checkpoint_id' => $checkpoint->id,
            'entered_at' => $this->msToDatetime($detection['entered_at_ms'] ?? null),
            'exited_at' => $this->msToDatetime($detection['exited_at_ms'] ?? null),
            'detected_at' => $this->msToDatetime($detection['detected_at_ms'] ?? null),
            'processed_at' => now(),
            'detection_type' => $detection['detection_type'],
            'confidence_score' => $confidence,
            'status' => $status,
        ];

        if ($existing) {
            $existing->update($attributes);

            return $existing->fresh();
        }

        return CheckpointEvent::query()->create($attributes);
    }

    /**
     * @param  array{
     *     distance_score: float,
     *     accuracy_score: float,
     *     time_score: float,
     *     stability_score: float,
     *     gap_factor: float,
     *     integrity_factor: float
     * }  $scores
     */
    private function persistCheckpointEventMetric(CheckpointEvent $event, array $scores): void
    {
        CheckpointEventMetric::query()->updateOrCreate(
            ['checkpoint_event_id' => $event->id],
            [
                'distance_score' => $scores['distance_score'],
                'accuracy_score' => $scores['accuracy_score'],
                'time_score' => $scores['time_score'],
                'stability_score' => $scores['stability_score'],
                'gap_factor' => $scores['gap_factor'],
                'integrity_factor' => $scores['integrity_factor'],
                'created_at' => now(),
            ]
        );
    }

    /**
     * @param  list<array{previous_log_id: string|null, next_log_id: string|null, gap_seconds: int}>  $gaps
     */
    private function gapFactorForWindow(array $gaps, ?int $windowStartMs, ?int $windowEndMs): float
    {
        if ($gaps === []) {
            return 1.0;
        }

        $mediumThreshold = (int) config('patrol_validation.movement.gap_factor_medium_seconds', 10);
        $largeThreshold = (int) config('patrol_validation.movement.gap_factor_large_seconds', 60);

        $nearestGapSeconds = null;

        foreach ($gaps as $gap) {
            $nearestGapSeconds = $nearestGapSeconds === null
                ? $gap['gap_seconds']
                : min($nearestGapSeconds, $gap['gap_seconds']);
        }

        if ($nearestGapSeconds === null) {
            return 1.0;
        }

        if ($nearestGapSeconds < $mediumThreshold) {
            return 1.0;
        }

        if ($nearestGapSeconds <= $largeThreshold) {
            return 0.8;
        }

        return 0.5;
    }

    /**
     * @param  list<LocationLog>  $logs
     */
    private function stabilityScore(array $logs): float
    {
        if (count($logs) < 2) {
            return 80.0;
        }

        $score = 100.0;
        $speeds = [];
        $headings = [];

        foreach ($logs as $log) {
            if ($log->speed !== null) {
                $speeds[] = (float) $log->speed;
            }
            if ($log->heading !== null) {
                $headings[] = (float) $log->heading;
            }
        }

        if (count($speeds) >= 2) {
            $variance = $this->variance($speeds);
            if ($variance < 0.01) {
                $score -= 25;
            }
        }

        if (count($headings) >= 3) {
            $headingVariance = $this->variance($headings);
            if ($headingVariance < 1.0) {
                $score -= 20;
            }
        }

        if (count($logs) >= 3) {
            $distances = [];
            for ($i = 1; $i < count($logs); $i++) {
                $distances[] = $this->haversineMeters(
                    (float) $logs[$i - 1]->latitude,
                    (float) $logs[$i - 1]->longitude,
                    (float) $logs[$i]->latitude,
                    (float) $logs[$i]->longitude
                );
            }

            if ($distances !== [] && $this->variance($distances) < 0.5) {
                $score -= 15;
            }
        }

        return round(max(0.0, min(100.0, $score)), 2);
    }

    private function accuracyScore(float $accuracy): float
    {
        $good = (float) config('patrol_validation.gps.good_accuracy_meters', 25);
        $poor = (float) config('patrol_validation.gps.poor_accuracy_meters', 75);

        if ($accuracy <= $good) {
            return 100.0;
        }

        if ($accuracy > $poor) {
            return max(20.0, round(100.0 * (1.0 - (($accuracy - $poor) / max(1.0, $poor))), 2));
        }

        return round(100.0 * (($poor - $accuracy) / max(1.0, $poor - $good)), 2);
    }

    private function distanceToCheckpoint(Checkpoint $checkpoint, LocationLog $log): float
    {
        return $this->haversineMeters(
            (float) $checkpoint->latitude,
            (float) $checkpoint->longitude,
            (float) $log->latitude,
            (float) $log->longitude
        );
    }

    private function haversineMeters(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $lat1Rad = deg2rad($lat1);
        $lat2Rad = deg2rad($lat2);
        $deltaLat = deg2rad($lat2 - $lat1);
        $deltaLon = deg2rad($lon2 - $lon1);

        $a = sin($deltaLat / 2) ** 2
            + cos($lat1Rad) * cos($lat2Rad) * sin($deltaLon / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return self::EARTH_RADIUS_METERS * $c;
    }

    private function isResumeLog(LocationLog $log): bool
    {
        $source = strtolower((string) ($log->source ?? ''));
        $trackingState = strtolower((string) ($log->tracking_state ?? ''));

        return $source === 'resume' || $trackingState === 'resumed';
    }

    private function resolveAccuracy(?float $accuracy): float
    {
        return $accuracy === null
            ? (float) config('patrol_validation.checkpoint.default_accuracy_meters', 50)
            : (float) $accuracy;
    }

    private function isValidTimestamp(mixed $timestamp): bool
    {
        if ($timestamp === null) {
            return false;
        }

        if (! is_numeric($timestamp)) {
            return false;
        }

        return (int) $timestamp > 0;
    }

    private function msToDatetime(?int $timestampMs): ?Carbon
    {
        if ($timestampMs === null) {
            return null;
        }

        return Carbon::createFromTimestampMs($timestampMs);
    }

    /**
     * @param  list<float>  $values
     */
    private function variance(array $values): float
    {
        $count = count($values);
        if ($count < 2) {
            return 0.0;
        }

        $mean = array_sum($values) / $count;
        $sumSq = 0.0;

        foreach ($values as $value) {
            $sumSq += ($value - $mean) ** 2;
        }

        return $sumSq / $count;
    }
}
