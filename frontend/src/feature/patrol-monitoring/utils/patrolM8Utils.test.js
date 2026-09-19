import { describe, expect, it } from 'vitest';

import { getAnomalyTypeLabel } from './patrolAnomalyUtils';
import { resolveCheckpointStatus } from './patrolStatusUtils';

describe('patrolStatusUtils', () => {
  it('maps M8 checkpoint statuses to operational labels', () => {
    expect(resolveCheckpointStatus('verified').label).toBe('Verified');
    expect(resolveCheckpointStatus('partial').label).toBe('Partial');
    expect(resolveCheckpointStatus('needs_review').label).toBe('Needs review');
    expect(resolveCheckpointStatus('suspicious').label).toBe('Suspicious');
    expect(resolveCheckpointStatus('missed').label).toBe('Missed');
  });

  it('maps legacy uncertain and rejected statuses', () => {
    expect(resolveCheckpointStatus('uncertain').label).toBe('Needs review');
    expect(resolveCheckpointStatus('rejected').label).toBe('Missed');
  });
});

describe('patrolAnomalyUtils labels', () => {
  it('uses calmer movement review language', () => {
    expect(getAnomalyTypeLabel('route_deviation')).toBe('Route concern');
    expect(getAnomalyTypeLabel('poor_accuracy')).toBe('Poor GPS accuracy');
    expect(getAnomalyTypeLabel('speed_anomaly')).toBe('Speed review');
  });
});
