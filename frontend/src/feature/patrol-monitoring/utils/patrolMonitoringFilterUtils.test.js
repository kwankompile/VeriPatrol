import { describe, expect, it } from 'vitest';

import { filterSessionsByAttention } from './patrolMonitoringFilterUtils';

describe('patrolMonitoringFilterUtils', () => {
  const sessions = [
    { id: '1', status: 'active' },
    { id: '2', status: 'completed' },
    { id: '3', status: 'completed' }
  ];

  const summaries = {
    2: { needs_review_checkpoints: 1 },
    3: { suspicious_checkpoints: 1 }
  };

  it('filters active sessions', () => {
    const result = filterSessionsByAttention(sessions, summaries, 'active');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters needs review from summaries', () => {
    const result = filterSessionsByAttention(sessions, summaries, 'needs_review');
    expect(result.map((s) => s.id)).toContain('2');
    expect(result.map((s) => s.id)).not.toContain('3');
  });

  it('filters suspicious checkpoints', () => {
    const result = filterSessionsByAttention(sessions, summaries, 'suspicious');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });
});
