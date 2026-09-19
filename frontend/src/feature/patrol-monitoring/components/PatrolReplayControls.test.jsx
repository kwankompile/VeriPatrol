import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { renderWithProviders } from 'test/testUtils';
import PatrolReplayControls from '../components/PatrolReplayControls';

describe('PatrolReplayControls', () => {
  it('shows unavailable message for active patrol', () => {
    renderWithProviders(<PatrolReplayControls replayEnabled={false} />);
    expect(screen.getByTestId('patrol-replay-unavailable')).toBeInTheDocument();
  });

  it('shows no route empty state', () => {
    renderWithProviders(<PatrolReplayControls replayEnabled routeCount={0} hasEnoughPoints={false} />);
    expect(screen.getByTestId('patrol-replay-no-route')).toBeInTheDocument();
  });

  it('shows not-enough-points empty state', () => {
    renderWithProviders(<PatrolReplayControls replayEnabled routeCount={1} hasEnoughPoints={false} />);
    expect(screen.getByTestId('patrol-replay-not-enough-points')).toBeInTheDocument();
  });

  it('renders timeline controls when replay is available', () => {
    renderWithProviders(
      <PatrolReplayControls
        replayEnabled
        canReplay
        hasEnoughPoints
        routeCount={5}
        currentIndex={2}
        replayProgress={50}
        currentRoutePoint={{ latitude: 3.1, longitude: 101.6, accuracy: 8 }}
        onPlay={vi.fn()}
        onPause={vi.fn()}
        onStop={vi.fn()}
        onSeek={vi.fn()}
        onSpeedChange={vi.fn()}
      />
    );
    expect(screen.getByTestId('patrol-replay-controls')).toBeInTheDocument();
    expect(screen.getByText(/Point 3 of 5/)).toBeInTheDocument();
  });
});
