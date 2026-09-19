import { beforeEach, describe, expect, it, vi } from 'vitest';

import authMonitoringService from './authMonitoringService';

vi.mock('api/api', () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
    post: vi.fn()
  }
}));

import api from 'api/api';

describe('authMonitoringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logoutAllSessions posts to /auth/logout-all', async () => {
    api.post.mockResolvedValue({ data: { success: true } });

    const result = await authMonitoringService.logoutAllSessions();

    expect(api.post).toHaveBeenCalledWith('/auth/logout-all');
    expect(result).toEqual({ success: true });
  });
});
