import { describe, expect, it, vi } from 'vitest';

import dashboardService from './dashboardService';

vi.mock('api/api', () => ({
  default: {
    get: vi.fn(async () => ({
      data: {
        success: true,
        message: 'ok',
        data: {
          role: 'admin',
          summary: { totalUsers: 3 },
          sections: {}
        }
      }
    }))
  }
}));

describe('dashboardService', () => {
  it('returns the Laravel envelope from api.get', async () => {
    const envelope = await dashboardService.getDashboardSummary();
    expect(envelope.success).toBe(true);
    expect(envelope.data.summary.totalUsers).toBe(3);
  });
});
