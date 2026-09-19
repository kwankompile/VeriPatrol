import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  SESSION_EXPIRED_FLAG_KEY,
  clearAuthSession,
  getAuthToken,
  markSessionExpired,
  setAuthToken,
  setAuthUser
} from 'utils/auth';

vi.mock('feature/authentication/datasources/authService', () => ({
  default: {
    refresh: vi.fn()
  }
}));

import authService from 'feature/authentication/datasources/authService';
import { resetAuthRefreshQueueForTests, runAuthRefresh, SessionExpiredError } from './authRefreshQueue';

describe('authRefreshQueue', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetAuthRefreshQueueForTests();
    vi.mocked(authService.refresh).mockReset();
  });

  afterEach(() => {
    resetAuthRefreshQueueForTests();
  });

  it('stores refreshed access token and user on success', async () => {
    vi.mocked(authService.refresh).mockResolvedValue({
      accessToken: 'new-token',
      user: { id: 1, email: 'user@test.com' },
      raw: {}
    });

    const token = await runAuthRefresh();

    expect(token).toBe('new-token');
    expect(getAuthToken()).toBe('new-token');
    expect(localStorage.getItem(AUTH_USER_KEY)).toContain('user@test.com');
  });

  it('deduplicates concurrent refresh calls', async () => {
    let resolveRefresh;
    vi.mocked(authService.refresh).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = () =>
            resolve({
              accessToken: 'shared-token',
              user: null,
              raw: {}
            });
        })
    );

    const first = runAuthRefresh();
    const second = runAuthRefresh();
    const third = runAuthRefresh();

    resolveRefresh();
    const tokens = await Promise.all([first, second, third]);

    expect(authService.refresh).toHaveBeenCalledTimes(1);
    expect(tokens).toEqual(['shared-token', 'shared-token', 'shared-token']);
  });

  it('clears session and marks session expired on failure', async () => {
    setAuthToken('old-token');
    setAuthUser({ id: 1 });

    vi.mocked(authService.refresh).mockRejectedValue({ status: 401, message: 'invalid' });

    await expect(runAuthRefresh()).rejects.toBeInstanceOf(SessionExpiredError);
    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG_KEY)).toBe('1');
  });

  it('never writes refresh token to web storage', async () => {
    vi.mocked(authService.refresh).mockResolvedValue({
      accessToken: 'only-access',
      user: null,
      raw: { data: { refresh_token: 'must-not-store' } }
    });

    await runAuthRefresh();

    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(sessionStorage.getItem('refresh_token')).toBeNull();
    const allLocalKeys = Object.keys(localStorage);
    const allSessionKeys = Object.keys(sessionStorage);
    expect(allLocalKeys).not.toContain('refresh_token');
    expect(allSessionKeys.filter((k) => k.includes('refresh'))).toEqual([]);
  });
});

describe('markSessionExpired storage safety', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('sets only the non-sensitive session flag', () => {
    markSessionExpired();
    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG_KEY)).toBe('1');
    expect(sessionStorage.length).toBe(1);
  });
});
