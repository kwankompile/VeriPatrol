import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'test/testUtils';
import DashboardHome from '../views/DashboardHome';
import { ROLES } from 'utils/auth';

let mockController = {};

vi.mock('../datasources/dashboardService', () => ({ default: {} }));
vi.mock('../controllers/useDashboardController', () => ({
  useDashboardController: () => mockController
}));
vi.mock('pwa/db', () => ({
  db: {
    sync_queue: {
      where: () => ({
        equals: () => ({
          count: async () => 0,
          toArray: async () => []
        })
      })
    }
  }
}));
vi.mock('pwa/useNetworkStatus', () => ({
  useNetworkStatus: () => true
}));

function adminSummary(overrides = {}) {
  return {
    role: ROLES.ADMIN,
    generatedAt: '2026-07-02T10:00:00+08:00',
    timezone: 'Asia/Kuala_Lumpur',
    summary: {
      totalUsers: 10,
      activePatrols: 2,
      patrolsNeedingReview: 1,
      todayAnprDetections: 5,
      flaggedAnprDetections: 1,
      cameraHealth: { online: 3, recentlySeen: 1, offline: 0, inactive: 0, total: 4 },
      blockchain: { pending: 0, queued: 0, processing: 0, submitted: 1, failed: 0, confirmed: 2, inFlight: 1, network: 'ganache', enabled: true },
      authAlerts: { failedAttempts24h: 2, suspiciousEvents24h: 0, recent: [] }
    },
    sections: {
      recentAnprEvents: [
        {
          id: 'e1',
          plateNumber: 'WXY1234',
          confidence: 0.9,
          detectionTime: null,
          cameraName: 'Gate',
          vehicleType: 'car',
          status: 'valid',
          plateImageUrl: null,
          isFlagged: false
        }
      ],
      activePatrolSessions: [{ id: 'p1', guardName: 'Guard A', zoneName: 'Zone 1', startedAt: null, status: 'active' }],
      activePatrolLocations: [{ sessionId: 'p1', guardName: 'Guard A', zoneName: 'Zone 1', latitude: 3.1, longitude: 101.6, recordedAt: null }],
      patrolSessionsNeedingReview: [],
      cameraHealth: { online: 3, recentlySeen: 1, offline: 0, inactive: 0, total: 4 },
      blockchainHealth: { inFlight: 1, failed: 0, confirmed: 2, network: 'ganache', enabled: true },
      authAlerts: { recent: [] }
    },
    actions: [
      { id: 'patrol-monitoring', label: 'Patrol Monitoring', path: '/admin/patrol-monitoring' },
      { id: 'user-management', label: 'User Management', path: '/admin/management-user' }
    ],
    ...overrides
  };
}

function baseController(overrides = {}) {
  return {
    role: ROLES.ADMIN,
    loading: false,
    refreshing: false,
    error: null,
    summary: adminSummary(),
    lastUpdatedAt: '2026-07-02T10:00:00+08:00',
    isInitialLoad: false,
    handleRefresh: vi.fn(),
    handleRetry: vi.fn(),
    ...overrides
  };
}

describe('DashboardHome', () => {
  beforeEach(() => {
    mockController = baseController();
  });

  it('shows loading skeleton on initial load', () => {
    mockController = baseController({ isInitialLoad: true, summary: null });
    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-metrics-skeleton')).toBeInTheDocument();
  });

  it('shows error state with retry', () => {
    mockController = baseController({ summary: null, error: 'Network failed' });
    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-error-state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders admin metrics and section navigation links', () => {
    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-admin-layout')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-metric-active-patrols')).toHaveTextContent('2');
    expect(screen.getByTestId('dashboard-metric-anpr-today')).toHaveTextContent('5');
    expect(screen.getByTestId('dashboard-metric-anpr-flagged')).toHaveTextContent('1');
    expect(screen.getByTestId('dashboard-metric-auth-alerts')).toHaveTextContent('2');
    expect(screen.getByTestId('dashboard-link-anpr')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-link-patrol')).toBeInTheDocument();
  });

  it('renders admin operational sections: map, ANPR context, blockchain, and auth alerts', () => {
    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-section-active-patrol')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-map-panel')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-map-recenter-button')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-blockchain-health')).toBeInTheDocument();
    expect(screen.getByText(/Network: ganache/i)).toBeInTheDocument();
    const anprList = screen.getByTestId('dashboard-anpr-list');
    expect(anprList).toHaveTextContent('WXY1234');
    expect(anprList).toHaveTextContent('Car');
    expect(anprList).toHaveTextContent('Valid');
  });

  it('shows the formatted last updated timestamp in the header', () => {
    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-last-updated')).toHaveTextContent(/Last updated .*2026/);
  });

  it('renders auth alert severity when alerts exist', () => {
    mockController = baseController({
      summary: adminSummary({
        sections: {
          ...adminSummary().sections,
          authAlerts: {
            recent: [{ id: 'a1', eventType: 'login.rate_limited', status: 'blocked', email: 'user@example.com', occurredAt: null, severity: 'high' }]
          }
        }
      })
    });
    renderWithProviders(<DashboardHome />);
    const alerts = screen.getByTestId('dashboard-auth-alerts');
    expect(alerts).toHaveTextContent('High');
    expect(alerts).not.toHaveTextContent('user@example.com');
  });

  it('operator layout does not render admin-only shortcuts', () => {
    mockController = baseController({
      role: ROLES.SECURITY_OPERATOR,
      summary: adminSummary({
        role: ROLES.SECURITY_OPERATOR,
        summary: {
          activePatrols: 1,
          patrolsNeedingReview: 0,
          todayAnprDetections: 2,
          flaggedAnprDetections: 0,
          cameraHealth: { online: 1, recentlySeen: 0, offline: 0, inactive: 0, total: 1 }
        },
        actions: [
          { id: 'patrol-monitoring', label: 'Patrol Monitoring', path: '/admin/patrol-monitoring' },
          { id: 'anpr-monitoring', label: 'ANPR Monitoring', path: '/admin/anpr-monitoring' }
        ]
      })
    });

    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-operator-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-metric-active-patrols')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-link-blockchain')).not.toBeInTheDocument();
  });

  it('guard layout renders patrol CTA and PWA readiness', () => {
    mockController = baseController({
      role: ROLES.GUARD,
      summary: adminSummary({
        role: ROLES.GUARD,
        summary: {
          hasActivePatrol: false,
          todayPatrolCount: 0,
          todayPatrolStatus: 'not_started',
          readiness: { message: 'Ready to start' }
        },
        sections: {
          activePatrol: null,
          recentPatrolSessions: []
        },
        actions: [{ id: 'patrol', label: 'Start / Resume Patrol', path: '/patrol' }]
      })
    });

    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-guard-layout')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-guard-patrol-cta')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-guard-patrol-cta')).toHaveTextContent(/Start Patrol/i);
    expect(screen.getByTestId('dashboard-pwa-readiness')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-pwa-status-banner')).toHaveAttribute('data-status', 'ready');
    expect(screen.queryByTestId('dashboard-anpr-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-section-active-patrol')).toBeInTheDocument();
  });

  it('guard with active patrol shows resume CTA', () => {
    mockController = baseController({
      role: ROLES.GUARD,
      summary: adminSummary({
        role: ROLES.GUARD,
        summary: { hasActivePatrol: true, todayPatrolCount: 1, todayPatrolStatus: 'active', readiness: { message: 'Resume' } },
        sections: { activePatrol: { id: 'p1', guardName: 'Guard A', zoneName: 'Zone 1', startedAt: null, status: 'active' }, recentPatrolSessions: [] }
      })
    });
    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-guard-patrol-cta')).toHaveTextContent(/Resume Patrol/i);
  });

  it('keeps content visible during refresh', () => {
    mockController = baseController({ refreshing: true });
    renderWithProviders(<DashboardHome />);
    expect(screen.getByTestId('dashboard-refresh-progress')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-metric-active-patrols')).toBeInTheDocument();
  });

  it('manual refresh calls controller handler', async () => {
    const user = userEvent.setup();
    const handleRefresh = vi.fn();
    mockController = baseController({ refreshing: false, handleRefresh });
    renderWithProviders(<DashboardHome />);

    await user.click(screen.getByTestId('dashboard-refresh-button'));
    expect(handleRefresh).toHaveBeenCalled();
  });
});
