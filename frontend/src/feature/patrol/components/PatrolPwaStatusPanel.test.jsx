import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PatrolPwaStatusPanel from './PatrolPwaStatusPanel';

vi.mock('pwa/db', () => ({
  db: {
    sync_queue: {
      where: () => ({
        equals: () => ({
          count: async () => 0,
          toArray: async () => []
        })
      })
    },
    location_logs: {
      where: () => ({
        equals: () => ({
          toArray: async () => []
        })
      })
    }
  }
}));

vi.mock('pwa/syncService', () => ({
  flushSyncQueue: vi.fn(),
  resetTerminalSyncFailures: vi.fn(),
  SYNC_QUEUE_STATUS_FAILED: 'failed',
  SYNC_QUEUE_STATUS_PENDING: 'pending',
  SYNC_RESULT_STATUS_CONFLICT: 'conflict',
  SYNC_RESULT_STATUS_EXHAUSTED: 'exhausted',
  SYNC_RESULT_STATUS_VALIDATION_FAILED: 'validation_failed'
}));

vi.mock('pwa/useNetworkStatus', () => ({
  useNetworkStatus: () => true
}));

describe('PatrolPwaStatusPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render push notification controls', async () => {
    render(
      <MemoryRouter>
        <PatrolPwaStatusPanel patrolId={null} trackingActive={false} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /enable notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/push notifications/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/account settings/i)).toBeInTheDocument();
    expect(screen.getByTestId('patrol-pwa-status-panel')).toBeInTheDocument();
  });
});
