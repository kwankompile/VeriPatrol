import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setAuthToken } from 'utils/auth';
import { SYNC_QUEUE_TYPE_LOCATION_LOG, SYNC_STATUS_PENDING } from './locationLogService';

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

vi.mock('./backgroundSyncService.js', () => ({
  registerPwaSyncQueueBackgroundSync: vi.fn().mockResolvedValue(undefined)
}));

function createFakeDb() {
  /** @type {Map<number, object>} */
  const syncQueue = new Map();
  /** @type {Map<string, object>} */
  const locationLogs = new Map();

  return {
    sync_queue: {
      where(field) {
        return {
          equals(value) {
            return {
              toArray: async () =>
                [...syncQueue.values()].filter((row) => {
                  if (field === 'status') {
                    return row.status === value;
                  }
                  return false;
                })
            };
          }
        };
      },
      update(id, patch) {
        const row = syncQueue.get(id);
        if (row) {
          Object.assign(row, patch);
        }
        return Promise.resolve();
      }
    },
    location_logs: {
      update(id, patch) {
        const row = locationLogs.get(id);
        if (row) {
          Object.assign(row, patch);
        }
        return Promise.resolve();
      }
    },
    transaction(_mode, ...args) {
      const fn = args[args.length - 1];
      return fn();
    },
    seedQueueItem(item) {
      syncQueue.set(item.id, structuredClone(item));
    },
    seedLocationLog(log) {
      locationLogs.set(log.id, structuredClone(log));
    },
    getQueueItem(id) {
      return syncQueue.get(id);
    },
    getLocationLog(id) {
      return locationLogs.get(id);
    },
    allQueueItems() {
      return [...syncQueue.values()];
    },
    allLocationLogs() {
      return [...locationLogs.values()];
    }
  };
}

let fakeDb = createFakeDb();

vi.mock('./db.js', () => ({
  get db() {
    return fakeDb;
  }
}));

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

const isPwaSyncPost = (url, options) => String(url).includes('/pwa/sync') && options?.method === 'POST';

describe('syncService M3 patrol token expiry safety', () => {
  let pwaSyncAttempts = 0;
  let flushSyncQueue;

  beforeEach(async () => {
    fakeDb = createFakeDb();
    pwaSyncAttempts = 0;
    localStorage.clear();
    sessionStorage.clear();
    setAuthToken('expired-access-token');
    runAuthRefreshMock.mockReset();
    vi.stubGlobal('fetch', vi.fn());
    vi.resetModules();

    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (isPwaSyncPost(url, options)) {
        pwaSyncAttempts += 1;
        if (pwaSyncAttempts === 1) {
          return jsonResponse({ message: 'Token expired' }, 401);
        }
        return jsonResponse({ success: true, data: { duplicate: false } }, 201);
      }
      return jsonResponse({ success: true }, 200);
    });

    flushSyncQueue = (await import('./syncService')).flushSyncQueue;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const seedPendingLocationLogItem = (overrides = {}) => {
    const locationLogId = 'loc-1';
    fakeDb.seedLocationLog({
      id: locationLogId,
      patrolId: 'patrol-1',
      userId: 'user-1',
      timestamp: 1710000000000,
      syncStatus: SYNC_STATUS_PENDING
    });
    fakeDb.seedQueueItem({
      id: 1,
      type: SYNC_QUEUE_TYPE_LOCATION_LOG,
      status: 'pending',
      createdAt: 1710000000000,
      retryCount: 0,
      payload: {
        type: 'location_log',
        locationLogId,
        patrolId: 'patrol-1',
        userId: 'user-1',
        timestamp: 1710000000000,
        lat: 3.139,
        lng: 101.6869,
        source: 'live',
        trackingState: 'active'
      },
      ...overrides
    });
    return locationLogId;
  };

  it('shared api client retries /pwa/sync after refresh in this test harness', async () => {
    runAuthRefreshMock.mockImplementation(() => {
      setAuthToken('refreshed-access-token');
      return Promise.resolve('refreshed-access-token');
    });

    let attempts = 0;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (isPwaSyncPost(url, options)) {
        attempts += 1;
        if (attempts === 1) {
          return jsonResponse({ message: 'Token expired' }, 401);
        }
        return jsonResponse({ success: true, data: { duplicate: false } }, 201);
      }
      return jsonResponse({ success: true }, 200);
    });

    const api = (await import('api/api')).default;
    const response = await api.post('/pwa/sync', { type: 'location_log' });
    expect(response.status).toBe(201);
    expect(runAuthRefreshMock).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
  });

  it('syncs queue item after expired access token when refresh succeeds', async () => {
    runAuthRefreshMock.mockImplementation(() => {
      setAuthToken('refreshed-access-token');
      return Promise.resolve('refreshed-access-token');
    });

    const locationLogId = seedPendingLocationLogItem();
    await flushSyncQueue();

    expect(pwaSyncAttempts).toBe(2);
    expect(runAuthRefreshMock).toHaveBeenCalledTimes(1);

    const queueRow = fakeDb.getQueueItem(1);
    expect(queueRow.status).toBe('synced');
    expect(queueRow.resultStatus).toBe('synced');
    expect(fakeDb.getLocationLog(locationLogId).syncStatus).toBe('synced');
    expect(fakeDb.allQueueItems()).toHaveLength(1);
  });

  it('marks duplicate_synced after refresh and duplicate replay response', async () => {
    runAuthRefreshMock.mockImplementation(() => {
      setAuthToken('refreshed-access-token');
      return Promise.resolve('refreshed-access-token');
    });

    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (isPwaSyncPost(url, options)) {
        pwaSyncAttempts += 1;
        if (pwaSyncAttempts === 1) {
          return jsonResponse({ message: 'Token expired' }, 401);
        }
        return jsonResponse({ success: true, data: { duplicate: true } }, 200);
      }
      return jsonResponse({ success: true }, 200);
    });

    const locationLogId = seedPendingLocationLogItem();
    await flushSyncQueue();

    const queueRow = fakeDb.getQueueItem(1);
    expect(queueRow.status).toBe('synced');
    expect(queueRow.resultStatus).toBe('duplicate_synced');
    expect(fakeDb.getLocationLog(locationLogId).syncStatus).toBe('synced');
  });

  it('preserves local queue and location evidence when refresh fails', async () => {
    const { SessionExpiredError } = await import('api/authRefreshQueue');
    runAuthRefreshMock.mockRejectedValue(new SessionExpiredError());

    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (isPwaSyncPost(url, options)) {
        return jsonResponse({ message: 'Token expired' }, 401);
      }
      return jsonResponse({ success: true }, 200);
    });

    const locationLogId = seedPendingLocationLogItem();
    await flushSyncQueue();

    expect(runAuthRefreshMock).toHaveBeenCalledTimes(1);
    expect(fakeDb.allQueueItems()).toHaveLength(1);
    expect(fakeDb.allLocationLogs()).toHaveLength(1);

    const queueRow = fakeDb.getQueueItem(1);
    expect(queueRow.status).toBe('failed');
    expect(queueRow.resultStatus).toBe('failed');
    expect(queueRow.retryCount).toBe(1);
    expect(queueRow.errorMessage).toBeTruthy();
    expect(fakeDb.getLocationLog(locationLogId).syncStatus).toBe(SYNC_STATUS_PENDING);
  });

  it('marks unsupported sync_queue types as terminal validation failures', async () => {
    fakeDb.seedQueueItem({
      id: 99,
      type: 'profile_update_contact',
      status: 'pending',
      createdAt: 1710000000000,
      retryCount: 0,
      payload: {
        phone: '0123456789',
        address: 'HQ',
        profile_version: 4
      }
    });

    await flushSyncQueue();

    const queueRow = fakeDb.getQueueItem(99);
    expect(queueRow.status).toBe('failed');
    expect(queueRow.resultStatus).toBe('validation_failed');
    expect(queueRow.errorMessage).toBe('Unsupported sync queue type');
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('syncService auth coupling inspection', () => {
  it('uses shared api client without direct refresh or token reads in source', () => {
    const syncServicePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'syncService.js');
    const fileContents = readFileSync(syncServicePath, 'utf8');

    expect(fileContents).toContain("import api from 'api/api'");
    expect(fileContents).toContain("api.post('/pwa/sync', item.payload)");
    expect(fileContents).not.toMatch(/auth\/refresh/);
    expect(fileContents).not.toMatch(/getAuthToken|access_token|refresh_token/);
  });
});
