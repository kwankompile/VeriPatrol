import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAuthAuditLogController } from './useAuthAuditLogController';

describe('useAuthAuditLogController', () => {
  it('resets page to 0 when audit filters change', async () => {
    const repository = {
      buildAuditLogQueryParams: vi.fn().mockReturnValue({ page: 1, per_page: 25 }),
      getAuditLogs: vi.fn().mockResolvedValue({
        logs: [],
        pagination: { total: 0, page: 1, perPage: 25, lastPage: 1 }
      })
    };

    const { result } = renderHook(() => useAuthAuditLogController(repository));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.page).toBe(2);

    act(() => {
      result.current.updateFilters({
        ...result.current.filters,
        email: 'guard@example.com'
      });
    });

    expect(result.current.page).toBe(0);
  });
});
