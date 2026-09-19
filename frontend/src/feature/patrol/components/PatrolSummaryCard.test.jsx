import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'test/testUtils';
import PatrolSummaryCard from '../components/PatrolSummaryCard';

describe('PatrolSummaryCard', () => {
  it('renders verified language and positive feedback', () => {
    renderWithProviders(
      <PatrolSummaryCard
        summary={{
          verified_checkpoints: 2,
          partial_checkpoints: 0,
          needs_review_checkpoints: 0,
          suspicious_checkpoints: 0,
          missed_checkpoints: 0,
          total_checkpoints: 2,
          confidence_level: 'high',
          confidence_score: 90,
          completion_percentage: 100
        }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId('patrol-summary-headline')).toHaveTextContent(/successfully/i);
    expect(screen.getByTestId('patrol-summary-positive-feedback')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-summary-outcome-chip')).toHaveTextContent(/verified/i);
  });

  it('frames needs-review without misconduct accusation', () => {
    renderWithProviders(
      <PatrolSummaryCard
        summary={{
          verified_checkpoints: 1,
          needs_review_checkpoints: 1,
          partial_checkpoints: 0,
          suspicious_checkpoints: 0,
          missed_checkpoints: 0,
          total_checkpoints: 2,
          confidence_level: 'medium',
          confidence_score: 55
        }}
        loading={false}
        error={null}
      />
    );

    const explanation = screen.getByTestId('patrol-summary-explanation').textContent ?? '';
    expect(explanation.toLowerCase()).toContain('not proof of cheating');
    expect(screen.getByTestId('patrol-summary-outcome-chip')).toHaveTextContent(/needs review/i);
  });

  it('renders partial outcome chip for mixed verified and partial checkpoints', () => {
    renderWithProviders(
      <PatrolSummaryCard
        summary={{
          verified_checkpoints: 2,
          partial_checkpoints: 1,
          needs_review_checkpoints: 0,
          suspicious_checkpoints: 0,
          missed_checkpoints: 0,
          total_checkpoints: 3,
          confidence_level: 'medium',
          confidence_score: 70
        }}
        loading={false}
        error={null}
      />
    );

    expect(screen.getByTestId('patrol-summary-outcome-chip')).toHaveTextContent(/partial/i);
    expect(screen.getByTestId('patrol-summary-headline')).toHaveTextContent(/partial checkpoint evidence/i);
  });

  it('shows finalize patrol online action when offline finalization is pending', async () => {
    const onFinalizeOnline = vi.fn();
    renderWithProviders(
      <PatrolSummaryCard
        offlineFinalizationPending
        validationWarning="You are offline. GPS recording has stopped."
        onFinalizeOnline={onFinalizeOnline}
        finalizeOnlineDisabled={false}
      />
    );

    const button = screen.getByTestId('patrol-finalize-online-button');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onFinalizeOnline).toHaveBeenCalledTimes(1);
  });
});
