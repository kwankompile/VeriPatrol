import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { usePatrolController } from './usePatrolController';
import { flushSyncQueue } from 'pwa/syncService';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate
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
  calculateDistance: vi.fn(() => 0)
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

describe('usePatrolController completePatrol', () => {
  const createRepository = () => ({
    getAllZones: vi.fn().mockResolvedValue([{ id: 'zone-1', name: 'Zone A' }]),
    createPatrol: vi.fn().mockResolvedValue({ data: { id: 'patrol-1', guard_id: 'guard-1', zone_id: 'zone-1' } }),
    getAllCheckpointsByZoneId: vi.fn().mockResolvedValue([{ id: 'cp-1', name: 'CP 1', latitude: 1, longitude: 2 }]),
    createBatchCheckpointLogs: vi.fn().mockResolvedValue([{ data: { id: 'log-1', checkpoint_id: 'cp-1', is_within_geofence: false } }]),
    createPatrolRoute: vi.fn().mockResolvedValue({ data: {} }),
    updatePatrol: vi.fn().mockResolvedValue({ data: { id: 'patrol-1', status: 'completed' } }),
    validatePatrolSession: vi.fn().mockResolvedValue({ success: true, data: { checkpoint_results: [] } }),
    getPatrolSummary: vi.fn().mockResolvedValue({ success: true, data: { verified_checkpoints: 1, total_checkpoints: 1 } })
  });

  const startPatrol = async (result) => {
    await act(async () => {
      result.current.handleChange('zone_id')({ target: { value: 'zone-1' } });
    });
    await waitFor(() => expect(result.current.formData.zone_id).toBe('zone-1'));
    await act(async () => {
      await result.current.handleStartPatrol();
    });
    await waitFor(() => expect(result.current.cpNumber).toBe(1));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('skips updatePatrol when offline and sets offline finalization pending', async () => {
    const repository = createRepository();
    const { result } = renderHook(() => usePatrolController(repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await startPatrol(result);

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    await act(async () => {
      await result.current.completePatrol();
    });

    expect(repository.updatePatrol).not.toHaveBeenCalled();
    expect(repository.validatePatrolSession).not.toHaveBeenCalled();
    expect(repository.createPatrolRoute).not.toHaveBeenCalled();
    expect(String(result.current.validationWarning ?? '')).toMatch(/offline/i);
    expect(result.current.offlineFinalizationPending).toBe(true);
    expect(result.current.cpNumber).toBe(0);
  });

  it('finalizes the same session online after offline stop', async () => {
    const repository = createRepository();
    const { result } = renderHook(() => usePatrolController(repository));

    await waitFor(() => expect(result.current.loading).toBe(false));
    await startPatrol(result);

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    await act(async () => {
      await result.current.completePatrol();
    });

    expect(result.current.offlineFinalizationPending).toBe(true);

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });

    await act(async () => {
      await result.current.finalizePatrolOnline();
    });

    expect(flushSyncQueue).toHaveBeenCalled();
    expect(repository.updatePatrol).toHaveBeenCalledWith(
      'patrol-1',
      expect.objectContaining({ status: 'completed' })
    );
    expect(repository.validatePatrolSession).toHaveBeenCalledWith('patrol-1');
    expect(repository.getPatrolSummary).toHaveBeenCalledWith('patrol-1');
    expect(repository.createPatrolRoute).not.toHaveBeenCalled();
    expect(result.current.offlineFinalizationPending).toBe(false);
    expect(result.current.finalizingStep).toBe('completed');
  });
});
