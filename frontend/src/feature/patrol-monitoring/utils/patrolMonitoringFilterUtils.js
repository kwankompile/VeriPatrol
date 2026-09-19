/**
 * Client-side attention filters for patrol monitoring (no backend changes).
 */
export function sessionNeedsAttention(session, summary, attentionFilter) {
  if (!attentionFilter) return true;

  if (attentionFilter === 'active') {
    return String(session?.status ?? '').toLowerCase() === 'active';
  }

  if (attentionFilter === 'suspicious') {
    return Number(summary?.suspicious_checkpoints ?? 0) > 0;
  }

  if (attentionFilter === 'needs_review') {
    const needsReview = Number(summary?.needs_review_checkpoints ?? summary?.uncertain_checkpoints ?? 0);
    const partial = Number(summary?.partial_checkpoints ?? 0);
    const missed = Number(summary?.missed_checkpoints ?? summary?.rejected_checkpoints ?? 0);
    return needsReview > 0 || partial > 0 || missed > 0;
  }

  return true;
}

export function filterSessionsByAttention(sessions, summariesBySessionId, attentionFilter) {
  if (!attentionFilter || !Array.isArray(sessions)) return sessions;
  return sessions.filter((session) => {
    if (attentionFilter === 'active') {
      return String(session?.status ?? '').toLowerCase() === 'active';
    }
    const summary = summariesBySessionId?.[session.id];
    if (!summary && attentionFilter !== 'active') {
      return false;
    }
    return sessionNeedsAttention(session, summary, attentionFilter);
  });
}
