<?php

namespace App\Services;

use App\Models\PatrolSession;
use App\Support\ApiDateTime;

class PatrolSessionSummaryService
{
    public function __construct(
        protected PatrolMovementService $movementService,
    ) {}

    /**
     * Build a gap-aware summary for one patrol session (computed from existing rows; not persisted).
     *
     * @return array<string, mixed>
     */
    public function build(PatrolSession $patrolSession): array
    {
        $gapThreshold = (int) config('patrol_validation.movement.gap_threshold_seconds', 30);
        $mediumGapMax = 300;

        $timestamps = $this->movementService
            ->orderedLocationLogsQuery($patrolSession)
            ->pluck('timestamp')
            ->map(fn ($ts) => (int) $ts)
            ->values()
            ->all();

        $gapStats = $this->analyzeGaps($timestamps, $gapThreshold, $mediumGapMax);

        $statusCounts = $patrolSession->checkpointEvents()
            ->selectRaw('status, COUNT(*) as aggregate')
            ->groupBy('status')
            ->pluck('aggregate', 'status')
            ->map(fn ($count) => (int) $count);

        $totalCheckpoints = (int) $statusCounts->sum();
        $verifiedCheckpoints = (int) ($statusCounts->get('verified') ?? 0);
        $partialCheckpoints = (int) ($statusCounts->get('partial') ?? 0);
        $needsReviewCheckpoints = (int) ($statusCounts->get('needs_review') ?? 0)
            + (int) ($statusCounts->get('uncertain') ?? 0);
        $suspiciousCheckpoints = (int) ($statusCounts->get('suspicious') ?? 0);
        $missedCheckpoints = (int) ($statusCounts->get('missed') ?? 0)
            + (int) ($statusCounts->get('rejected') ?? 0);
        $pendingCheckpoints = (int) ($statusCounts->get('pending') ?? 0);

        $completionPercentage = $totalCheckpoints > 0
            ? round((($verifiedCheckpoints + ($partialCheckpoints * 0.5)) / $totalCheckpoints) * 100, 2)
            : 0.0;

        $confidenceScore = $this->calculateConfidenceScore(
            $gapStats['medium_gap_count'],
            $gapStats['large_gap_count'],
            $pendingCheckpoints,
            $missedCheckpoints,
            $needsReviewCheckpoints,
            $suspiciousCheckpoints
        );

        return [
            'patrol_session_id' => $patrolSession->id,
            'status' => $patrolSession->status,
            'started_at' => ApiDateTime::format($patrolSession->started_at),
            'ended_at' => ApiDateTime::format($patrolSession->ended_at),
            'total_location_logs' => $patrolSession->locationLogs()->count(),
            'total_checkpoints' => $totalCheckpoints,
            'verified_checkpoints' => $verifiedCheckpoints,
            'partial_checkpoints' => $partialCheckpoints,
            'needs_review_checkpoints' => $needsReviewCheckpoints,
            'suspicious_checkpoints' => $suspiciousCheckpoints,
            'missed_checkpoints' => $missedCheckpoints,
            'pending_checkpoints' => $pendingCheckpoints,
            // Legacy keys for backward-compatible API consumers
            'uncertain_checkpoints' => $needsReviewCheckpoints,
            'rejected_checkpoints' => $missedCheckpoints,
            'completion_percentage' => $completionPercentage,
            'total_gaps' => $gapStats['total_gaps'],
            'longest_gap_seconds' => $gapStats['longest_gap_seconds'],
            'total_gap_seconds' => $gapStats['total_gap_seconds'],
            'confidence_level' => $this->confidenceLevel($confidenceScore),
            'confidence_score' => $confidenceScore,
        ];
    }

    /**
     * @param  list<int>  $timestampsMs
     * @return array{total_gaps: int, longest_gap_seconds: int, total_gap_seconds: int, medium_gap_count: int, large_gap_count: int}
     */
    private function analyzeGaps(array $timestampsMs, int $gapThreshold, int $mediumGapMax): array
    {
        $totalGaps = 0;
        $longestGapSeconds = 0;
        $totalGapSeconds = 0;
        $mediumGapCount = 0;
        $largeGapCount = 0;

        $count = count($timestampsMs);
        for ($i = 1; $i < $count; $i++) {
            $diffSeconds = (int) round(($timestampsMs[$i] - $timestampsMs[$i - 1]) / 1000);

            if ($diffSeconds <= $gapThreshold) {
                continue;
            }

            $totalGaps++;
            $totalGapSeconds += $diffSeconds;
            $longestGapSeconds = max($longestGapSeconds, $diffSeconds);

            if ($diffSeconds > $mediumGapMax) {
                $largeGapCount++;
            } else {
                $mediumGapCount++;
            }
        }

        return [
            'total_gaps' => $totalGaps,
            'longest_gap_seconds' => $longestGapSeconds,
            'total_gap_seconds' => $totalGapSeconds,
            'medium_gap_count' => $mediumGapCount,
            'large_gap_count' => $largeGapCount,
        ];
    }

    private function calculateConfidenceScore(
        int $mediumGapCount,
        int $largeGapCount,
        int $pendingCheckpoints,
        int $missedCheckpoints,
        int $needsReviewCheckpoints,
        int $suspiciousCheckpoints
    ): int {
        $score = 100;
        $score -= 10 * $mediumGapCount;
        $score -= 20 * $largeGapCount;

        if ($pendingCheckpoints > 0) {
            $score -= 10;
        }

        if ($missedCheckpoints > 0) {
            $score -= 15;
        }

        if ($needsReviewCheckpoints > 0) {
            $score -= 5;
        }

        if ($suspiciousCheckpoints > 0) {
            $score -= 15;
        }

        return max(0, min(100, $score));
    }

    private function confidenceLevel(int $score): string
    {
        if ($score >= 80) {
            return 'high';
        }

        if ($score >= 50) {
            return 'medium';
        }

        return 'low';
    }
}
