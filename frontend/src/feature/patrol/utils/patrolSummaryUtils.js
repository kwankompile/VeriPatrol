import { resolveCheckpointStatus } from 'feature/patrol-monitoring/utils/patrolStatusUtils';

function countStatus(results, statuses) {
  if (!Array.isArray(results)) return 0;
  const allowed = Array.isArray(statuses) ? statuses : [statuses];
  return results.filter((row) => allowed.includes(String(row?.status ?? '').toLowerCase())).length;
}

export function buildCheckpointCounts(summary, validationResult) {
  const results = validationResult?.checkpoint_results;
  if (Array.isArray(results) && results.length > 0) {
    return {
      verified: countStatus(results, 'verified'),
      partial: countStatus(results, 'partial'),
      needs_review: countStatus(results, ['needs_review', 'uncertain']),
      suspicious: countStatus(results, 'suspicious'),
      missed: countStatus(results, ['missed', 'rejected']),
      total: results.length
    };
  }

  const verified = Number(summary?.verified_checkpoints ?? 0);
  const partial = Number(summary?.partial_checkpoints ?? 0);
  const needsReview = Number(summary?.needs_review_checkpoints ?? summary?.uncertain_checkpoints ?? 0);
  const suspicious = Number(summary?.suspicious_checkpoints ?? 0);
  const missed = Number(summary?.missed_checkpoints ?? summary?.rejected_checkpoints ?? 0);
  const total = Number(summary?.total_checkpoints ?? verified + partial + needsReview + suspicious + missed);

  return { verified, partial, needs_review: needsReview, suspicious, missed, total };
}

export function countMovementReviewItems(validationResult) {
  const items = validationResult?.anomalies?.items;
  return Array.isArray(items) ? items.length : 0;
}

/**
 * Derive overall patrol outcome for guard-facing summary.
 */
export function derivePatrolOutcome(summary, validationResult) {
  const counts = buildCheckpointCounts(summary, validationResult);
  const { verified, partial, needs_review, suspicious, missed, total } = counts;

  if (suspicious > 0) return 'suspicious';
  if (total > 0 && missed === total) return 'missed';
  if (needs_review > 0) return 'needs_review';
  if (total > 0 && verified === total) return 'verified';
  if (partial > 0) return 'partial';
  if (missed > 0) return 'missed';
  if (verified > 0) return 'verified';
  return 'needs_review';
}

export function buildOutcomeHeadline(outcome) {
  const map = {
    verified: 'Patrol completed successfully',
    partial: 'Patrol completed with partial checkpoint evidence',
    needs_review: 'Patrol completed — review recommended',
    suspicious: 'Patrol flagged for strong anomaly review',
    missed: 'Patrol completed — checkpoint evidence not confirmed'
  };
  return map[outcome] ?? 'Patrol completed';
}

export function buildOutcomeExplanation({ outcome, counts, summary, validationResult }) {
  const movementReview = countMovementReviewItems(validationResult);
  const gaps = Number(validationResult?.total_gaps ?? summary?.total_gaps ?? 0);
  const confidence = summary?.confidence_level ?? null;

  if (outcome === 'verified') {
    return `All ${counts.total} checkpoint(s) were verified with strong evidence. Confidence is ${confidence ?? 'available'} and no major route concerns were detected.`;
  }

  if (outcome === 'partial') {
    return `${counts.verified} checkpoint(s) verified and ${counts.partial} with partial dwell or continuity evidence. This is not proof of misconduct — additional review may help confirm coverage.`;
  }

  if (outcome === 'needs_review') {
    const parts = [];
    if (counts.needs_review > 0) parts.push(`${counts.needs_review} checkpoint(s) need human review`);
    if (movementReview > 0) parts.push(`${movementReview} movement review item(s) on the route`);
    if (gaps > 0) parts.push(`${gaps} GPS gap(s) in the trail`);
    const detail = parts.length ? parts.join('; ') + '.' : 'GPS quality or timing uncertainty was detected.';
    return `${detail} Needs-review results are not proof of cheating — an operator should confirm context before taking action.`;
  }

  if (outcome === 'suspicious') {
    const reasons = [];
    if (counts.suspicious > 0) reasons.push(`${counts.suspicious} checkpoint(s) with strong anomaly signals`);
    const suspiciousItems = (validationResult?.anomalies?.items ?? []).filter((i) => i.severity === 'major');
    if (suspiciousItems.length) reasons.push(`${suspiciousItems.length} major movement review finding(s)`);
    return `Strong evidence requires operator attention: ${reasons.join('; ') || 'see checkpoint details below'}.`;
  }

  if (outcome === 'missed') {
    return `${counts.missed} checkpoint(s) had insufficient evidence. Confirm whether the route was covered or if GPS/sync issues affected recording.`;
  }

  return 'Review the checkpoint breakdown below for details.';
}

export function outcomeChipProps(outcome) {
  return resolveCheckpointStatus(outcome);
}
