import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AUTH_TOKEN_KEY,
  clearAuthSession,
  setAuthToken
} from 'utils/auth';

const runAuthRefreshMock = vi.fn();

vi.mock('api/authRefreshQueue', () => ({
  runAuthRefresh: (...args) => runAuthRefreshMock(...args),
  SessionExpiredError: class SessionExpiredError extends Error {
    constructor(message = 'Session expired') {
      super(message);
      this.name = 'SessionExpiredError';
      this.status = 401;
    }
  }
}));

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

describe('api.js refresh-on-401', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    setAuthToken('stale-token');
    runAuthRefreshMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearAuthSession();
  });

  const loadApi = async () => (await import('./api')).default;

  it('retries protected request once after successful refresh', async () => {
    runAuthRefreshMock.mockImplementation(() => {
      setAuthToken('fresh-token');
      return Promise.resolve('fresh-token');
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { ok: true } }, 200));

    const api = await loadApi();
    const result = await api.get('/auth/me');

    expect(runAuthRefreshMock).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ success: true, data: { ok: true } });

    const retryCall = vi.mocked(fetch).mock.calls[1];
    expect(retryCall[1].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('routes each parallel 401 through the refresh queue and retries each request', async () => {
    const attemptByUrl = new Map();

    runAuthRefreshMock.mockImplementation(() => {
      setAuthToken('parallel-token');
      return Promise.resolve('parallel-token');
    });

    vi.mocked(fetch).mockImplementation(async (url, options) => {
      const key = `${options.method}:${url}`;
      const attempt = (attemptByUrl.get(key) ?? 0) + 1;
      attemptByUrl.set(key, attempt);
      if (attempt === 1) {
        return jsonResponse({ message: 'expired' }, 401);
      }
      return jsonResponse({ ok: true }, 200);
    });

    const api = await loadApi();
    await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect(runAuthRefreshMock).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('rejects when refresh fails', async () => {
    const { SessionExpiredError } = await import('api/authRefreshQueue');
    runAuthRefreshMock.mockRejectedValue(new SessionExpiredError());

    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'expired' }, 401));

    const api = await loadApi();
    await expect(api.get('/protected')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(runAuthRefreshMock).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on login 401', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, message: 'Invalid credentials.' }, 401));

    const api = await loadApi();
    await expect(api.post('/auth/login', { email: 'a@b.com', password: 'x' })).rejects.toMatchObject({ status: 401 });
    expect(runAuthRefreshMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('stale-token');
  });

  it('does not refresh on login 429', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(
        {
          success: false,
          message: 'Too many unsuccessful sign-in attempts. Please try again later.',
          data: { retry_after: 900 }
        },
        429
      )
    );

    const api = await loadApi();
    await expect(api.post('/auth/login', { email: 'a@b.com', password: 'x' })).rejects.toMatchObject({ status: 429 });
    expect(runAuthRefreshMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('stale-token');
  });

  it('does not refresh on legacy login 401', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false, message: 'Invalid credentials.' }, 401));

    const api = await loadApi();
    await expect(api.post('/login', { email: 'a@b.com', password: 'x' })).rejects.toMatchObject({ status: 401 });
    expect(runAuthRefreshMock).not.toHaveBeenCalled();
  });

  it('does not refresh on logout 401', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false }, 401));

    const api = await loadApi();
    await expect(api.post('/auth/logout')).rejects.toMatchObject({ status: 401 });
    expect(runAuthRefreshMock).not.toHaveBeenCalled();
  });

  it('does not refresh on refresh endpoint 401 via api client', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: false }, 401));

    const api = await loadApi();
    await expect(api.post('/auth/refresh')).rejects.toMatchObject({ status: 401 });
    expect(runAuthRefreshMock).not.toHaveBeenCalled();
  });

  it('does not refresh on 403', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'Forbidden' }, 403));

    const api = await loadApi();
    await expect(api.get('/admin-only')).rejects.toMatchObject({ status: 403 });
    expect(runAuthRefreshMock).not.toHaveBeenCalled();
  });

  it('preserves FormData without forcing JSON Content-Type', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ success: true }, 200));

    const api = await loadApi();
    const formData = new FormData();
    formData.append('file', new Blob(['x']), 'test.txt');

    await api.post('/upload', formData);

    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.headers['Content-Type']).toBeUndefined();
  });

  it('honors skipAuthRefresh option', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'expired' }, 401));

    const api = await loadApi();
    await expect(api.get('/probe', { skipAuthRefresh: true })).rejects.toMatchObject({ status: 401 });
    expect(runAuthRefreshMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('stale-token');
  });
});

describe('PWA sync path via shared api client', () => {
  beforeEach(async () => {
    localStorage.clear();
    setAuthToken('sync-token');
    runAuthRefreshMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retries /pwa/sync after refresh without clearing queue semantics', async () => {
    runAuthRefreshMock.mockResolvedValue('sync-refreshed');

    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ message: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { synced: true } }, 200));

    const api = (await import('./api')).default;
    const result = await api.post('/pwa/sync', { patrolId: 'p1' });

    expect(runAuthRefreshMock).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ success: true, data: { synced: true } });
  });
});
