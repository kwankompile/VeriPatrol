import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  diagnosePushEnvironment,
  getServiceWorkerRegistration,
  isValidVapidPublicKey,
  resolvePushNotificationStatus,
  subscribeToPushNotifications
} from './pushNotificationService';

vi.mock('api/api', () => ({
  default: {
    post: vi.fn(),
    delete: vi.fn()
  }
}));

describe('pushNotificationService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('validates VAPID public key format', () => {
    expect(isValidVapidPublicKey('')).toBe(false);
    expect(isValidVapidPublicKey('short')).toBe(false);
    expect(isValidVapidPublicKey('B'.repeat(87))).toBe(true);
  });

  it('reports unsupported browser when APIs are missing', async () => {
    const originalNotification = global.Notification;
    // @ts-expect-error test override
    delete global.Notification;

    const status = await resolvePushNotificationStatus();
    expect(status.status).toBe('unsupported_browser');

    global.Notification = originalNotification;
  });

  it('getServiceWorkerRegistration finds existing registration via getRegistrations()', async () => {
    const fakeReg = { active: { state: 'activated' }, pushManager: {} };
    const sw = {
      getRegistrations: vi.fn().mockResolvedValue([fakeReg]),
      getRegistration: vi.fn().mockResolvedValue(null),
      ready: new Promise(() => {})
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });

    const result = await getServiceWorkerRegistration();
    expect(result).toBe(fakeReg);
    expect(sw.getRegistrations).toHaveBeenCalled();
  });

  it('getServiceWorkerRegistration falls back to navigator.serviceWorker.ready', async () => {
    const fakeReg = { active: { state: 'activated' }, pushManager: {} };
    const sw = {
      getRegistrations: vi.fn().mockResolvedValue([]),
      getRegistration: vi.fn().mockResolvedValue(null),
      ready: Promise.resolve(fakeReg)
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });

    const result = await getServiceWorkerRegistration();
    expect(result).toBe(fakeReg);
  });

  it('getServiceWorkerRegistration returns null on timeout when no SW registered', async () => {
    const sw = {
      getRegistrations: vi.fn().mockResolvedValue([]),
      getRegistration: vi.fn().mockResolvedValue(null),
      ready: new Promise(() => {}) // never resolves
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });

    vi.useFakeTimers();
    const resultPromise = getServiceWorkerRegistration();
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result).toBeNull();
    vi.useRealTimers();
  });

  it('resolvePushNotificationStatus reports unsupported_browser when PushManager is absent', async () => {
    // PushManager is not available in the jsdom test environment, so the status
    // must be 'unsupported_browser' without reaching the SW lookup.
    const result = await resolvePushNotificationStatus();
    expect(result.status).toBe('unsupported_browser');
  });

  it('pushManager.subscribe() failure maps to push_service_error', async () => {
    const mockPushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockRejectedValue(new Error('Registration failed - push service error'))
    };
    const fakeReg = { active: { state: 'activated' }, pushManager: mockPushManager };
    const sw = {
      getRegistrations: vi.fn().mockResolvedValue([fakeReg]),
      getRegistration: vi.fn().mockResolvedValue(fakeReg),
      ready: Promise.resolve(fakeReg)
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });

    // Simulate PushManager and Notification presence
    const origPushManager = global.PushManager;
    const origNotification = global.Notification;
    global.PushManager = class {};
    global.Notification = { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') };
    // isSecureContext must be true
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'B'.repeat(87));

    let caughtError = null;
    try {
      await subscribeToPushNotifications();
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toMatch(/push_service_error/i);

    global.PushManager = origPushManager;
    global.Notification = origNotification;
    vi.unstubAllEnvs();
  });

  it('missing VAPID key throws a readable error', async () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');

    const mockPushManager = { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() };
    const fakeReg = { active: {}, pushManager: mockPushManager };
    const sw = {
      getRegistrations: vi.fn().mockResolvedValue([fakeReg]),
      getRegistration: vi.fn().mockResolvedValue(fakeReg),
      ready: Promise.resolve(fakeReg)
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });

    const origPushManager = global.PushManager;
    const origNotification = global.Notification;
    global.PushManager = class {};
    global.Notification = { permission: 'granted', requestPermission: vi.fn().mockResolvedValue('granted') };
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    let err = null;
    try {
      await subscribeToPushNotifications();
    } catch (e) {
      err = e;
    }

    expect(err).not.toBeNull();
    expect(err.message).toMatch(/VITE_VAPID_PUBLIC_KEY/i);

    global.PushManager = origPushManager;
    global.Notification = origNotification;
    vi.unstubAllEnvs();
  });

  it('diagnosePushEnvironment reports push environment without exposing secrets', async () => {
    const sw = {
      getRegistrations: vi.fn().mockResolvedValue([]),
      getRegistration: vi.fn().mockResolvedValue(null),
      ready: new Promise(() => {})
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });

    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'B'.repeat(87));

    const result = await diagnosePushEnvironment();

    expect(result).toHaveProperty('secureContext');
    expect(result).toHaveProperty('serviceWorkerSupported');
    expect(result).toHaveProperty('pushManagerSupported');
    expect(result).toHaveProperty('notificationSupported');
    expect(result).toHaveProperty('permission');
    expect(result).toHaveProperty('registrationCount');
    expect(result).toHaveProperty('activeServiceWorkerScriptUrl');
    expect(result).toHaveProperty('hasVapidPublicKey');
    expect(result).toHaveProperty('vapidPublicKeyLength');
    expect(result).toHaveProperty('subscribed');

    // Must not expose the actual key value
    expect(Object.values(result)).not.toContain('B'.repeat(87));

    expect(typeof result.hasVapidPublicKey).toBe('boolean');
    expect(result.hasVapidPublicKey).toBe(true);
    expect(result.vapidPublicKeyLength).toBe(87);

    vi.unstubAllEnvs();
  });
});
