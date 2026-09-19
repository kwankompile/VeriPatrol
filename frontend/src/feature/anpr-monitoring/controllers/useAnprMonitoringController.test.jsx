import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { useAnprMonitoringController } from './useAnprMonitoringController';

const makeRepository = (overrides = {}) => ({
  buildListQueryParams: vi.fn(() => ({ page: 1, per_page: 10, sort: 'detection_time', direction: 'desc' })),
  getAnprEvents: vi.fn().mockResolvedValue({
    events: [{ id: 'evt-1', plateNumber: 'ABC1234' }],
    pagination: { total: 1, page: 1, perPage: 10, lastPage: 1 }
  }),
  ...overrides
});

const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useAnprMonitoringController', () => {
  it('initial load populates events', async () => {
    const repository = makeRepository();
    const { result } = renderHook(() => useAnprMonitoringController(repository), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe('evt-1');
  });

  it('manual refresh works', async () => {
    const repository = makeRepository();
    const { result } = renderHook(() => useAnprMonitoringController(repository), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.handleRefresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));

    expect(repository.getAnprEvents).toHaveBeenCalledTimes(2);
  });

  describe('live polling', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('live polling starts and can be stopped', async () => {
      const repository = makeRepository();
      const { result } = renderHook(() => useAnprMonitoringController(repository), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(repository.getAnprEvents.mock.calls.length).toBeGreaterThanOrEqual(2);

      act(() => {
        result.current.setLiveEnabled(false);
      });
      expect(result.current.liveStatus).toBe('paused');

      const callsBeforePause = repository.getAnprEvents.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(repository.getAnprEvents.mock.calls.length).toBe(callsBeforePause);
    });

    it('polling failure sets reconnecting state without clearing rows', async () => {
      const repository = makeRepository({
        getAnprEvents: vi
          .fn()
          .mockResolvedValueOnce({
            events: [{ id: 'evt-1', plateNumber: 'ABC1234' }],
            pagination: { total: 1, page: 1, perPage: 10, lastPage: 1 }
          })
          .mockRejectedValueOnce(new Error('Network down'))
      });

      const { result } = renderHook(() => useAnprMonitoringController(repository), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(result.current.liveStatus).toBe('reconnecting');
      expect(result.current.events).toHaveLength(1);
      expect(result.current.liveError).toBe('Network down');
    });

    it('repeated poll failures increase backoff delay', async () => {
      const repository = makeRepository({
        getAnprEvents: vi
          .fn()
          .mockResolvedValueOnce({
            events: [{ id: 'evt-1', plateNumber: 'ABC1234' }],
            pagination: { total: 1, page: 1, perPage: 10, lastPage: 1 }
          })
          .mockRejectedValueOnce(new Error('Network down'))
          .mockRejectedValueOnce(new Error('Network down'))
      });

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const { result } = renderHook(() => useAnprMonitoringController(repository), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(result.current.liveStatus).toBe('reconnecting');

      const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
      expect(delays.some((delay) => delay > 5000)).toBe(true);
      setTimeoutSpy.mockRestore();
    });

    it('successful poll resets live status after failures', async () => {
      const repository = makeRepository({
        getAnprEvents: vi
          .fn()
          .mockResolvedValueOnce({
            events: [{ id: 'evt-1', plateNumber: 'ABC1234' }],
            pagination: { total: 1, page: 1, perPage: 10, lastPage: 1 }
          })
          .mockRejectedValueOnce(new Error('Network down'))
          .mockResolvedValueOnce({
            events: [{ id: 'evt-1', plateNumber: 'ABC1234' }],
            pagination: { total: 1, page: 1, perPage: 10, lastPage: 1 }
          })
      });

      const { result } = renderHook(() => useAnprMonitoringController(repository), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(result.current.liveStatus).toBe('reconnecting');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(result.current.liveStatus).toBe('live');
      expect(result.current.liveError).toBeNull();
    });

    it('highlights clear after duration', async () => {
      const repository = makeRepository({
        getAnprEvents: vi
          .fn()
          .mockResolvedValueOnce({
            events: [{ id: 'evt-1', plateNumber: 'ABC1234' }],
            pagination: { total: 1, page: 1, perPage: 10, lastPage: 1 }
          })
          .mockResolvedValueOnce({
            events: [
              { id: 'evt-2', plateNumber: 'PMK8811' },
              { id: 'evt-1', plateNumber: 'ABC1234' }
            ],
            pagination: { total: 2, page: 1, perPage: 10, lastPage: 1 }
          })
      });

      const { result } = renderHook(() => useAnprMonitoringController(repository), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(result.current.highlightedEventIds).toContain('evt-2');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(result.current.highlightedEventIds).not.toContain('evt-2');
    });

    it('highlights new event IDs on poll without duplicating rows', async () => {
      const repository = makeRepository({
        getAnprEvents: vi
          .fn()
          .mockResolvedValueOnce({
            events: [{ id: 'evt-1', plateNumber: 'ABC1234' }],
            pagination: { total: 1, page: 1, perPage: 10, lastPage: 1 }
          })
          .mockResolvedValueOnce({
            events: [
              { id: 'evt-2', plateNumber: 'PMK8811' },
              { id: 'evt-1', plateNumber: 'ABC1234' }
            ],
            pagination: { total: 2, page: 1, perPage: 10, lastPage: 1 }
          })
      });

      const { result } = renderHook(() => useAnprMonitoringController(repository), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });

      expect(result.current.events).toHaveLength(2);
      expect(result.current.highlightedEventIds).toContain('evt-2');
    });

    it('cleans up timers on unmount', async () => {
      const repository = makeRepository();
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const { unmount } = renderHook(() => useAnprMonitoringController(repository), { wrapper });
      await waitFor(() => expect(repository.getAnprEvents).toHaveBeenCalled());
      unmount();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
