import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePatrolController } from './usePatrolController';
import { capturePatrolLocationSnapshot, startPatrolTracking } from '../services/geolocationService';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}));

vi.mock('../../authentication/controllers/useAuthController', () => ({
  useAuthController: () => ({ currentUser: { id: 'guard-1', name: 'Guard' } })
}));

vi.mock('../services/geolocationService', () => ({
  capturePatrolLocationSnapshot: vi.fn().mockResolvedValue({
    position: {
      coords: { latitude: 3.139, longitude: 101.6869, accuracy: 8, altitude: null },
      timestamp: Date.now()
    }
  }),
  startPatrolTracking: vi.fn().mockResolvedValue(undefined),
  stopPatrolTracking: vi.fn(),
  warmUpCurrentLocation: vi.fn(),
  stopPrePatrolLocationWatch: vi.fn(),
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

describe('usePatrolController no deprecated route dual-write', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('never calls createPatrolRoute when starting, tracking, or completing a patrol', async () => {
    const repository = {
      getAllZones: vi.fn().mockResolvedValue([{ id: 'zone-1', name: 'Zone A' }]),
      getActivePatrolSession: vi.fn().mockResolvedValue(null),
      createPatrol: vi.fn().mockResolvedValue({
        data: { id: 'patrol-1', guard_id: 'guard-1', zone_id: 'zone-1', status: 'active' }
      }),
      getAllCheckpointsByZoneId: vi.fn().mockResolvedValue([
        { id: 'cp-1', name: 'CP 1', latitude: 1, longitude: 2 }
      ]),
      createBatchCheckpointLogs: vi.fn().mockResolvedValue([
        { data: { id: 'log-1', checkpoint_id: 'cp-1', is_within_geofence: false } }
      ]),
      createPatrolRoute: vi.fn().mockResolvedValue({ success: true, data: {} }),
      updatePatrol: vi.fn().mockResolvedValue({ data: { id: 'patrol-1', status: 'completed' } }),
      updateCheckpointLog: vi.fn().mockResolvedValue({ data: {} }),
      validatePatrolSession: vi.fn().mockResolvedValue({ success: true, data: { checkpoint_results: [] } }),
      getPatrolSummary: vi.fn().mockResolvedValue({
        success: true,
        data: { verified_checkpoints: 0, total_checkpoints: 1 }
      })
    };

    const { result } = renderHook(() => usePatrolController(repository));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.handleChange('zone_id')({ target: { value: 'zone-1' } });
    });
    await waitFor(() => expect(result.current.formData.zone_id).toBe('zone-1'));

    await act(async () => {
      await result.current.handleStartPatrol();
    });
    await waitFor(() => expect(result.current.cpNumber).toBe(1));
    expect(startPatrolTracking).toHaveBeenCalled();
    expect(capturePatrolLocationSnapshot).toHaveBeenCalled();

    // Simulate an additional live GPS callback from the watch.
    const onPosition = startPatrolTracking.mock.calls[0]?.[0]?.onPosition;
    expect(typeof onPosition).toBe('function');
    await act(async () => {
      onPosition({
        coords: { latitude: 3.14, longitude: 101.69, accuracy: 6, altitude: null },
        timestamp: Date.now()
      });
    });

    await act(async () => {
      await result.current.completePatrol();
    });

    expect(repository.createPatrolRoute).not.toHaveBeenCalled();
  });
});
