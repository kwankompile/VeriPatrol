import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import { renderWithProviders } from 'test/testUtils';
import PatrolMonitoringDashboard from '../views/PatrolMonitoringDashboard';

let mockController = {};

vi.mock('../controllers/usePatrolMonitoringController', () => ({
  usePatrolMonitoringController: () => mockController
}));

vi.mock('../datasources/patrolMonitoringService', () => ({ default: {} }));
vi.mock('../components/PatrolRealtimeSnackbar', () => ({ default: () => null }));

function baseController(overrides = {}) {
  return {
    sessions: [{ id: 's1', status: 'active', user: { name: 'Guard' }, zone: { name: 'Zone A' } }],
    summariesBySessionId: {},
    zones: [],
    stats: {
      total: 1,
      active: 1,
      completed: 0,
      aborted: 0,
      suspiciousEvents: 0,
      needsReviewEvents: 0,
      partialEvents: 0,
      missedEvents: 0
    },
    loading: false,
    isInitialLoad: false,
    isRefreshing: false,
    error: null,
    filterText: '',
    statusFilter: '',
    zoneFilter: '',
    attentionFilter: '',
    page: 0,
    rowsPerPage: 10,
    totalCount: 1,
    liveStatus: 'live',
    handleFilterTextChange: vi.fn(),
    handleStatusFilterChange: vi.fn(),
    handleZoneFilterChange: vi.fn(),
    handleAttentionFilterChange: vi.fn(),
    handleChangePage: vi.fn(),
    handleChangeRowsPerPage: vi.fn(),
    handleViewDetails: vi.fn(),
    handleRefresh: vi.fn(),
    handleRetry: vi.fn(),
    ...overrides
  };
}

describe('PatrolMonitoringDashboard', () => {
  beforeEach(() => {
    mockController = baseController();
  });

  it('keeps table rows visible during refresh', () => {
    mockController = baseController({ isRefreshing: true, loading: true });
    renderWithProviders(<PatrolMonitoringDashboard />);
    expect(screen.getAllByText('Guard').length).toBeGreaterThan(0);
  });

  it('shows contextual empty state', () => {
    mockController = baseController({ sessions: [], totalCount: 0 });
    renderWithProviders(<PatrolMonitoringDashboard />);
    expect(screen.getByTestId('patrol-monitoring-empty')).toBeInTheDocument();
  });

  it('shows error state with retry', () => {
    mockController = baseController({ sessions: [], error: 'Network failed', totalCount: 0 });
    renderWithProviders(<PatrolMonitoringDashboard />);
    expect(screen.getByTestId('patrol-monitoring-error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders attention filter control', () => {
    renderWithProviders(<PatrolMonitoringDashboard />);
    expect(screen.getByTestId('patrol-monitoring-attention-filter')).toBeInTheDocument();
  });
});
