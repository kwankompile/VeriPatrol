import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

import { useAuthSessionController } from './useAuthSessionController';

describe('useAuthSessionController', () => {
  const getSessions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getSessions.mockResolvedValue({
      sessions: [],
      pagination: { total: 0, page: 1, perPage: 25, lastPage: 1 }
    });
  });

  it('requests sessions without scope by default', async () => {
    const repository = {
      buildSessionQueryParams: vi.fn().mockReturnValue({ page: 1, per_page: 25 }),
      getSessions,
      revokeSession: vi.fn()
    };

    renderHook(() => useAuthSessionController(repository));

    await waitFor(() => {
      expect(getSessions).toHaveBeenCalledWith({ page: 1, per_page: 25 });
    });
  });

  it('requests sessions with scope=mine when configured for account security', async () => {
    const repository = {
      buildSessionQueryParams: vi.fn().mockReturnValue({ page: 1, per_page: 25 }),
      getSessions,
      revokeSession: vi.fn()
    };

    renderHook(() => useAuthSessionController(repository, { scope: 'mine' }));

    await waitFor(() => {
      expect(getSessions).toHaveBeenCalledWith({ page: 1, per_page: 25, scope: 'mine' });
    });
  });
});
