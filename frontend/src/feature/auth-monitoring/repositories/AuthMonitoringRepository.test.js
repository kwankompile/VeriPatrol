import { describe, expect, it, vi } from 'vitest';

import { AuthMonitoringRepository } from './AuthMonitoringRepository';

describe('AuthMonitoringRepository', () => {
  it('builds audit log query params without all sentinel values', () => {
    const repository = new AuthMonitoringRepository({});
    const params = repository.buildAuditLogQueryParams(
      { action: 'all', status: 'all', email: '', dateFrom: '', dateTo: '' },
      0,
      25
    );

    expect(params).toEqual({ page: 1, per_page: 25 });
  });

  it('builds audit log query params with profile action filter', () => {
    const repository = new AuthMonitoringRepository({});
    const params = repository.buildAuditLogQueryParams(
      { action: 'password_change_failed', status: 'all', email: '', dateFrom: '', dateTo: '' },
      0,
      25
    );

    expect(params).toEqual({
      action: 'password_change_failed',
      page: 1,
      per_page: 25
    });
  });

  it('normalizes paginated audit log envelope', async () => {
    const service = {
      getAuditLogs: vi.fn().mockResolvedValue({
        data: [{ id: '1', action: 'login_password_failure' }],
        meta: { total: 1, current_page: 1, last_page: 1, per_page: 25 }
      })
    };
    const repository = new AuthMonitoringRepository(service);
    const result = await repository.getAuditLogs({ page: 1, per_page: 25 });

    expect(result.logs).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });

  it('delegates logoutAllSessions to the service', async () => {
    const service = {
      logoutAllSessions: vi.fn().mockResolvedValue({ success: true })
    };
    const repository = new AuthMonitoringRepository(service);

    await repository.logoutAllSessions();

    expect(service.logoutAllSessions).toHaveBeenCalled();
  });
});
