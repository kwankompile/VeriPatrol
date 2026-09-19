import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import { useBlockchainMonitoringController } from './useBlockchainMonitoringController';

const defaultPagination = { total: 1, page: 1, perPage: 10, lastPage: 1 };

const makeRepository = (overrides = {}) => ({
  buildListQueryParams: vi.fn(() => ({ page: 1, per_page: 10, sort_by: 'created_at', sort_order: 'desc' })),
  getBlockchainSummary: vi.fn().mockResolvedValue({
    total: 2,
    pending: 1,
    queued: 0,
    processing: 0,
    submitted: 0,
    confirmed: 1,
    failed: 0,
    inFlight: 1
  }),
  getBlockchainRecords: vi.fn().mockResolvedValue({
    records: [{ id: 'rec-1', status: 'confirmed' }],
    pagination: defaultPagination
  }),
  ...overrides
});

const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useBlockchainMonitoringController', () => {
  it('loads summary and records on mount', async () => {
    const repository = makeRepository();
    const { result } = renderHook(() => useBlockchainMonitoringController(repository), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summary?.total).toBe(2);
    expect(result.current.records).toHaveLength(1);
    expect(repository.getBlockchainSummary).toHaveBeenCalled();
    expect(repository.getBlockchainRecords).toHaveBeenCalled();
  });

  it('manual refresh reloads summary and records', async () => {
    const repository = makeRepository();
    const { result } = renderHook(() => useBlockchainMonitoringController(repository), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      result.current.handleRefresh();
    });
    await waitFor(() => expect(result.current.refreshing).toBe(false));

    expect(repository.getBlockchainSummary).toHaveBeenCalledTimes(2);
    expect(repository.getBlockchainRecords).toHaveBeenCalledTimes(2);
  });

  it('changing a filter while the first request is unresolved eventually loads the latest filter', async () => {
    const resolvers = [];
    const repository = makeRepository({
      buildListQueryParams: vi.fn((filters) => ({
        page: 1,
        per_page: 10,
        status: filters.status === 'all' ? undefined : filters.status
      })),
      getBlockchainRecords: vi.fn(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      )
    });

    const { result } = renderHook(() => useBlockchainMonitoringController(repository), { wrapper });
    await waitFor(() => expect(resolvers).toHaveLength(1));

    act(() => {
      result.current.handleStatusFilterChange('failed');
    });

    await waitFor(() => expect(resolvers).toHaveLength(2));
    expect(repository.buildListQueryParams).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'failed' }),
      0,
      10
    );

    await act(async () => {
      resolvers[1]({
        records: [{ id: 'rec-failed', status: 'failed' }],
        pagination: defaultPagination
      });
    });

    await waitFor(() => expect(result.current.records[0]?.id).toBe('rec-failed'));
    expect(result.current.filters.status).toBe('failed');
  });

  it('stale first response does not overwrite the later response', async () => {
    const resolvers = [];
    const repository = makeRepository({
      getBlockchainRecords: vi.fn(
        () =>
          new Promise((resolve) => {
            resolvers.push(resolve);
          })
      )
    });

    const { result } = renderHook(() => useBlockchainMonitoringController(repository), { wrapper });
    await waitFor(() => expect(resolvers).toHaveLength(1));

    act(() => {
      result.current.handleStatusFilterChange('failed');
    });
    await waitFor(() => expect(resolvers).toHaveLength(2));

    await act(async () => {
      resolvers[1]({
        records: [{ id: 'rec-latest', status: 'failed' }],
        pagination: { total: 1, page: 1, perPage: 10, lastPage: 1 }
      });
    });
    await waitFor(() => expect(result.current.records[0]?.id).toBe('rec-latest'));

    await act(async () => {
      resolvers[0]({
        records: [{ id: 'rec-stale', status: 'confirmed' }],
        pagination: { total: 99, page: 1, perPage: 10, lastPage: 1 }
      });
    });

    expect(result.current.records[0]?.id).toBe('rec-latest');
    expect(result.current.pagination.total).toBe(1);
  });
});
