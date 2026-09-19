import { describe, expect, it } from 'vitest';

import {
  buildCheckpointCounts,
  buildOutcomeExplanation,
  buildOutcomeHeadline,
  derivePatrolOutcome
} from './patrolSummaryUtils';

describe('patrolSummaryUtils', () => {
  it('derives verified outcome when all checkpoints verified', () => {
    const summary = {
      verified_checkpoints: 3,
      partial_checkpoints: 0,
      needs_review_checkpoints: 0,
      suspicious_checkpoints: 0,
      missed_checkpoints: 0,
      total_checkpoints: 3,
      confidence_level: 'high'
    };
    expect(derivePatrolOutcome(summary, null)).toBe('verified');
    expect(buildOutcomeHeadline('verified')).toContain('successfully');
  });

  it('frames needs-review without accusing language', () => {
    const summary = {
      needs_review_checkpoints: 2,
      total_checkpoints: 4,
      confidence_level: 'medium'
    };
    const outcome = derivePatrolOutcome(summary, null);
    expect(outcome).toBe('needs_review');
    const explanation = buildOutcomeExplanation({
      outcome,
      counts: buildCheckpointCounts(summary, null),
      summary,
      validationResult: null
    });
    expect(explanation.toLowerCase()).toContain('not proof of cheating');
    expect(explanation.toLowerCase()).not.toContain('cheating proof');
  });

  it('uses validation checkpoint_results when present', () => {
    const validationResult = {
      checkpoint_results: [
        { status: 'verified' },
        { status: 'suspicious' }
      ]
    };
    const counts = buildCheckpointCounts(null, validationResult);
    expect(counts.suspicious).toBe(1);
    expect(derivePatrolOutcome(null, validationResult)).toBe('suspicious');
  });

  it('derives partial outcome when verified and partial checkpoints are mixed', () => {
    expect(
      derivePatrolOutcome(
        {
          verified_checkpoints: 2,
          partial_checkpoints: 1,
          needs_review_checkpoints: 0,
          suspicious_checkpoints: 0,
          missed_checkpoints: 0,
          total_checkpoints: 3
        },
        null
      )
    ).toBe('partial');
    expect(buildOutcomeHeadline('partial')).toContain('partial');
  });
});
