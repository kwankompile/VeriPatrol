import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { usePatrolController } from './usePatrolController';
import { clearActivePatrolSnapshot, saveActivePatrolSnapshot } from '../services/patrolSessionStore';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../authentication/controllers/useAuthController', () => ({
  useAuthController: () => ({ currentUser: { id: 'guard-1', name: 'Guard' } })
}));

vi.mock('../services/geolocationService', () => ({
  capturePatrolLocationSnapshot: vi.fn().mockResolvedValue({
    position: { coords: { latitude: 1, longitude: 2, accuracy: 10 }, timestamp: Date.now() }
  }),
  startPatrolTracking: vi.fn().mockResolvedValue(undefined),
  stopPatrolTracking: vi.fn(),
  // Far from every checkpoint so restore state is asserted without GPS auto-detection noise.
  calculateDistance: vi.fn(() => 9999)
}));

vi.mock('pwa/syncService', () => ({
  flushSyncQueue: vi.fn().mockResolvedValue(undefined),
  SYNC_QUEUE_STATUS_PENDING: 'pending',
  SYNC_QUEUE_STATUS_FAILED: 'failed',
  SYNC_RESULT_STATUS_VALIDATION_FAILED: 'validation_failed',
  SYNC_RESULT_STATUS_CONFLICT: 'conflict',
  SYNC_RESULT_STATUS_EXHAUSTED: 'exhausted'
}));

vi.mock('pwa/db', () => ({
  db: {
    sync_queue: {
      where: () => ({
        equals: () => ({
          count: vi.fn().mockResolvedValue(0),
          toArray: vi.fn().mockResolvedValue([])
        })
      })
    }
  }
}));

const baseRepository = () => ({
  getAllZones: vi.fn().mockResolvedValue([{ id: 'zone-1', name: 'Zone A' }]),
  getAllCheckpointsByZoneId: vi.fn().mockResolvedValue([
    { id: 'cp-1', name: 'CP 1', latitude: 1, longitude: 2 },
    { id: 'cp-2', name: 'CP 2', latitude: 3, longitude: 4 }
  ]),
  createPatrol: vi.fn(),
  createBatchCheckpointLogs: vi.fn(),
  createPatrolRoute: vi.fn().mockResolvedValue({ success: true, data: {} }),
  updatePatrol: vi.fn().mockResolvedValue({ data: {} }),
  updateCheckpointLog: vi.fn().mockResolvedValue({ data: {} }),
  validatePatrolSession: vi.fn(),
  getPatrolSummary: vi.fn()
});

describe('usePatrolController active patrol restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearActivePatrolSnapshot();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('restores the active patrol from the backend source of truth on load', async () => {
    const repository = {
      ...baseRepository(),
      getActivePatrolSession: vi.fn().mockResolvedValue({
        session: { id: 'patrol-1', guard_id: 'guard-1', zone_id: 'zone-1', status: 'active' },
        checkpointLogs: [
          { id: 'evt-1', checkpoint_id: 'cp-1', is_within_geofence: true, checkpoint: { id: 'cp-1', latitude: 1, longitude: 2 } },
          { id: 'evt-2', checkpoint_id: 'cp-2', is_within_geofence: false, checkpoint: { id: 'cp-2', latitude: 3, longitude: 4 } }
        ]
      })
    };

    const { result } = renderHook(() => usePatrolController(repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.cpNumber).toBe(2));

    expect(repository.getActivePatrolSession).toHaveBeenCalledTimes(1);
    expect(repository.createPatrolRoute).not.toHaveBeenCalled();
    expect(result.current.patrolTrackingActive).toBe(true);
    expect(result.current.patrols?.data?.id).toBe('patrol-1');
    expect(result.current.checkpointLogs).toHaveLength(2);
    expect(result.current.completedCount).toBe(1);
    expect(result.current.formData.zone_id).toBe('zone-1');
  });

  it('stays idle and clears stale local snapshot when backend reports no active patrol', async () => {
    saveActivePatrolSnapshot({
      patrolSessionId: 'stale-1',
      patrolSession: { id: 'stale-1' },
      zoneId: 'zone-1',
      guardUserId: 'guard-1',
      checkpoints: [{ id: 'cp-1' }],
      checkpointLogs: [{ id: 'evt-1', checkpoint_id: 'cp-1' }],
      cpNumber: 1
    });

    const repository = {
      ...baseRepository(),
      getActivePatrolSession: vi.fn().mockResolvedValue(null)
    };

    const { result } = renderHook(() => usePatrolController(repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(repository.getActivePatrolSession).toHaveBeenCalledTimes(1));

    expect(result.current.patrolTrackingActive).toBe(false);
    expect(result.current.cpNumber).toBe(0);
  });

  it('falls back to the device-local snapshot when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    saveActivePatrolSnapshot({
      patrolSessionId: 'patrol-offline',
      patrolSession: { id: 'patrol-offline', guard_id: 'guard-1' },
      zoneId: 'zone-1',
      guardUserId: 'guard-1',
      checkpoints: [{ id: 'cp-1', latitude: 1, longitude: 2 }],
      checkpointLogs: [{ id: 'evt-1', checkpoint_id: 'cp-1', is_within_geofence: false }],
      cpNumber: 1
    });

    const repository = {
      ...baseRepository(),
      getActivePatrolSession: vi.fn().mockResolvedValue(null)
    };

    const { result } = renderHook(() => usePatrolController(repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.cpNumber).toBe(1));

    // Offline restore must not hit the backend.
    expect(repository.getActivePatrolSession).not.toHaveBeenCalled();
    expect(result.current.patrols?.data?.id).toBe('patrol-offline');
    expect(result.current.patrolTrackingActive).toBe(true);
  });
});
