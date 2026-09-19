import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import PatrolStatusChip from '../components/PatrolStatusChip';
import {
  CHECKPOINT_STATUS_HELP,
  getCheckpointStatusLabel,
  getCheckpointStatusTooltip,
  resolveCheckpointStatus
} from './patrolStatusUtils';

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

  it('provides tooltip descriptions for known statuses', () => {
    expect(getCheckpointStatusTooltip('verified')).toBe(CHECKPOINT_STATUS_HELP.verified.description);
    expect(getCheckpointStatusTooltip('needs_review')).toBe(CHECKPOINT_STATUS_HELP.needs_review.description);
    expect(getCheckpointStatusLabel('pending')).toBe('Pending');
  });

  it('falls back for unknown statuses', () => {
    expect(getCheckpointStatusLabel('custom_status')).toBe('custom_status');
    expect(getCheckpointStatusTooltip('custom_status')).toContain('not recognized');
  });
});

describe('PatrolStatusChip tooltips', () => {
  it('renders checkpoint status chip for verified status', () => {
    render(<PatrolStatusChip kind="checkpoint" value="verified" />);
    expect(screen.getByTestId('checkpoint-status-chip')).toHaveTextContent('Verified');
  });
});
