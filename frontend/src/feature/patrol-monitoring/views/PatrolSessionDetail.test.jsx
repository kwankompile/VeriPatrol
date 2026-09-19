import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'test/testUtils';
import PatrolSessionDetail from '../views/PatrolSessionDetail';

const mockReplay = {
  canReplay: false,
  hasEnoughPoints: false,
  routeCount: 0,
  currentIndex: 0,
  isPlaying: false,
  replayProgress: 0,
  replayTime: null,
  currentRoutePoint: null,
  speedMultiplier: 1,
  replayFinished: false,
  currentSegmentAnomaly: null,
  replayActive: false,
  passedCheckpointIds: [],
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn(),
  setSpeedMultiplier: vi.fn()
};

let mockDetailController = {};

vi.mock('../controllers/usePatrolSessionDetailController', () => ({
  usePatrolSessionDetailController: () => mockDetailController
}));

vi.mock('../controllers/usePatrolReplayController', () => ({
  usePatrolReplayController: () => mockReplay
}));

vi.mock('../datasources/patrolMonitoringService', () => ({ default: {} }));
vi.mock('../components/PatrolRealtimeSnackbar', () => ({ default: () => null }));
vi.mock('../components/PatrolRouteMap', () => ({
  default: () => <div data-testid="patrol-route-map" />
}));

function baseDetailController(overrides = {}) {
  return {
    loading: false,
    error: null,
    session: { status: 'completed', user: { name: 'Guard' }, zone: { name: 'Zone A' } },
    patrolSessionId: 'session-1',
    summary: {
      confidence_level: 'medium',
      completion_percentage: 80,
      verified_checkpoints: 2,
      partial_checkpoints: 0,
      needs_review_checkpoints: 0,
      suspicious_checkpoints: 0,
      missed_checkpoints: 0,
      pending_checkpoints: 0
    },
    summaryLoading: false,
    summaryError: null,
    patrolRoutes: [],
    checkpointEvents: [],
    anomalies: [{ id: 'a1', anomaly_type: 'route_deviation', severity: 'medium' }],
    validationResult: { total_segments: 1 },
    validationMessage: null,
    validationError: null,
    validating: false,
    routesLoading: false,
    routesError: null,
    eventsLoading: false,
    selectedAnomaly: null,
    showAnomalies: true,
    setSelectedAnomaly: vi.fn(),
    handleBack: vi.fn(),
    handleReRunValidation: vi.fn(),
    handleLargeGapDetected: vi.fn(),
    isConnected: false,
    isRealtimeEnabled: true,
    connectionState: 'connecting',
    ...overrides
  };
}

describe('PatrolSessionDetail', () => {
  beforeEach(() => {
    mockDetailController = baseDetailController();
  });

  it('renders map-first layout with replay empty state', () => {
    renderWithProviders(<PatrolSessionDetail />, { route: '/admin/patrol-monitoring/session-1' });
    expect(screen.getByTestId('patrol-session-detail')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-replay-no-route')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-route-map')).toBeInTheDocument();
  });

  it('does not show map legend content by default', () => {
    renderWithProviders(<PatrolSessionDetail />, { route: '/admin/patrol-monitoring/session-1' });
    expect(screen.queryByTestId('map-legend-dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Patrol trail')).not.toBeInTheDocument();
  });

  it('opens map legend dialog from info button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatrolSessionDetail />, { route: '/admin/patrol-monitoring/session-1' });

    await user.click(screen.getByTestId('map-legend-info-button'));

    const dialog = screen.getByTestId('map-legend-dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Patrol trail')).toBeInTheDocument();
  });

  it('opens map legend dialog from More details link', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatrolSessionDetail />, { route: '/admin/patrol-monitoring/session-1' });

    await user.click(screen.getByTestId('map-legend-more-details-link'));
    expect(screen.getByTestId('map-legend-dialog')).toBeInTheDocument();
  });

  it('shows map legend help tooltip on info button hover', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatrolSessionDetail />, { route: '/admin/patrol-monitoring/session-1' });

    await user.hover(screen.getByTestId('map-legend-info-button'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(/route colors/i);
  });

  it('does not show movement review list by default', () => {
    renderWithProviders(<PatrolSessionDetail />, { route: '/admin/patrol-monitoring/session-1' });
    expect(screen.queryByTestId('movement-review-dialog')).not.toBeInTheDocument();
  });

  it('opens movement review dialog from link', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PatrolSessionDetail />, { route: '/admin/patrol-monitoring/session-1' });

    await user.click(screen.getByTestId('movement-review-link'));
    expect(screen.getByTestId('movement-review-dialog')).toBeInTheDocument();
  });

  it('does not render old checkpoint status summary boxes', () => {
    renderWithProviders(<PatrolSessionDetail />, { route: '/admin/patrol-monitoring/session-1' });
    expect(screen.queryByText('Total')).not.toBeInTheDocument();
    expect(screen.queryByTestId('checkpoint-status-summary')).not.toBeInTheDocument();
  });
});
