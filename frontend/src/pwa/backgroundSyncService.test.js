import { describe, expect, it, vi } from 'vitest';

import { isBackgroundSyncSupported, registerPwaSyncQueueBackgroundSync } from './backgroundSyncService';

describe('backgroundSyncService', () => {
  it('returns false when Background Sync is unsupported', async () => {
    const originalServiceWorker = navigator.serviceWorker;
    const originalSyncManager = window.SyncManager;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
    if ('SyncManager' in window) {
      delete window.SyncManager;
    }

    expect(isBackgroundSyncSupported()).toBe(false);
    await expect(registerPwaSyncQueueBackgroundSync()).resolves.toBe(false);

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: originalServiceWorker });
    if (originalSyncManager !== undefined) {
      Object.defineProperty(window, 'SyncManager', { configurable: true, value: originalSyncManager });
    }
  });

  it('registers pwa-sync-queue when supported', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const originalServiceWorker = navigator.serviceWorker;
    const originalSyncManager = window.SyncManager;
    Object.defineProperty(window, 'SyncManager', { configurable: true, value: function SyncManager() {} });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          sync: {
            register
          }
        })
      }
    });

    await expect(registerPwaSyncQueueBackgroundSync()).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith('pwa-sync-queue');

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: originalServiceWorker });
    if (originalSyncManager !== undefined) {
      Object.defineProperty(window, 'SyncManager', { configurable: true, value: originalSyncManager });
    }
  });

  it('returns false silently for NotAllowedError without console warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const register = vi.fn().mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    const originalServiceWorker = navigator.serviceWorker;
    const originalSyncManager = window.SyncManager;
    Object.defineProperty(window, 'SyncManager', { configurable: true, value: function SyncManager() {} });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          sync: {
            register
          }
        })
      }
    });

    await expect(registerPwaSyncQueueBackgroundSync()).resolves.toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: originalServiceWorker });
    if (originalSyncManager !== undefined) {
      Object.defineProperty(window, 'SyncManager', { configurable: true, value: originalSyncManager });
    }
  });
});
