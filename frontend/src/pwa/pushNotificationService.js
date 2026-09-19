import api from 'api/api';

const PUSH_SUBSCRIPTION_ID_STORAGE_KEY = 'pwa_push_subscription_id';
const SERVICE_WORKER_READY_TIMEOUT_MS = 5000;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export function isPushNotificationSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isSecurePushContext() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.isSecureContext === true;
}

export function getNotificationPermission() {
  if (!isPushNotificationSupported()) {
    return 'unsupported';
  }

  return Notification.permission;
}

export function requestNotificationPermission() {
  if (!isPushNotificationSupported()) {
    return Promise.resolve('unsupported');
  }

  return Notification.requestPermission();
}

export function isValidVapidPublicKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  const trimmed = key.trim();
  return /^[A-Za-z0-9_-]{80,}$/.test(trimmed);
}

function getVapidPublicKey() {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!isValidVapidPublicKey(key)) {
    throw new Error('VITE_VAPID_PUBLIC_KEY is missing or invalid.');
  }

  return key.trim();
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function getServiceWorkerRegistration() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  // Check all registered scopes — handles apps served under a base path where
  // getRegistration() with no argument might miss a scoped SW.
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length > 0) {
      // Prefer an active/controlling registration; fall back to first found.
      const active = registrations.find((r) => r.active || r.installing || r.waiting);
      if (active) {
        return active;
      }
    }
  } catch {
    // getRegistrations() may throw in some sandboxed contexts; fall through.
  }

  // Also try the exact scope for the current page origin/path.
  try {
    const scoped = await navigator.serviceWorker.getRegistration(window.location.href);
    if (scoped) {
      return scoped;
    }
  } catch {
    // Ignore; fall through to .ready timeout below.
  }

  try {
    return await withTimeout(
      navigator.serviceWorker.ready,
      SERVICE_WORKER_READY_TIMEOUT_MS,
      'Service worker is not available. Reload the app or check PWA installation.'
    );
  } catch {
    return null;
  }
}

/** True when running Vite dev server (import.meta.env.DEV). */
function isViteDevMode() {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

export async function getExistingPushSubscription() {
  const registration = await getServiceWorkerRegistration();
  if (!registration?.pushManager) {
    return null;
  }

  return registration.pushManager.getSubscription();
}

function subscriptionToApiPayload(subscription) {
  const json = subscription.toJSON();

  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid push subscription payload');
  }

  return {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth
    },
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
  };
}

function extractApiErrorMessage(error, fallback) {
  return error?.data?.message || error?.message || fallback;
}

export async function subscribeToPushNotifications() {
  if (!isPushNotificationSupported()) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  if (!isSecurePushContext()) {
    throw new Error('Push notifications require a secure HTTPS context.');
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error(`Notification permission: ${permission}`);
  }

  const registration = await getServiceWorkerRegistration();
  if (!registration?.pushManager) {
    if (isViteDevMode()) {
      throw new Error(
        'Push notifications require an active service worker. ' +
          'Run `npm run build && npm run preview` to test with the production PWA, ' +
          'or use a Chromium browser which may support SW in dev mode.'
      );
    }
    throw new Error(
      'The service worker is unavailable. ' +
        'Reload the installed PWA or ensure the app finished loading before enabling notifications.'
    );
  }

  const vapidKey = getVapidPublicKey();

  let subscription;
  try {
    const existing = await registration.pushManager.getSubscription();
    subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      }));
  } catch (error) {
    const rawMsg = error?.message || 'subscription failed';
    throw new Error(`push_service_error: ${rawMsg}`);
  }

  try {
    const response = await api.post('/push-subscriptions', subscriptionToApiPayload(subscription));
    const serverId = response?.data?.data?.id;

    if (serverId && typeof localStorage !== 'undefined') {
      localStorage.setItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY, serverId);
    }

    return { subscription, server: response?.data };
  } catch (error) {
    throw new Error(extractApiErrorMessage(error, 'Failed to save push subscription on the server.'));
  }
}

export async function sendTestNotification(payload = {}) {
  try {
    const response = await api.post('/push-notifications/test', {
      title: payload.title ?? 'Test notification',
      body: payload.body ?? 'This is a test push notification.'
    });

    return response?.data;
  } catch (error) {
    throw new Error(extractApiErrorMessage(error, 'Test notification failed.'));
  }
}

export async function unsubscribeFromPushNotifications() {
  const subscription = await getExistingPushSubscription();

  if (!subscription) {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY);
    }
    return;
  }

  const storedId = typeof localStorage !== 'undefined' ? localStorage.getItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY) : null;

  await subscription.unsubscribe();

  if (storedId) {
    try {
      await api.delete(`/push-subscriptions/${storedId}`);
    } catch (error) {
      console.warn('[push] failed to delete server subscription', error);
    }
    localStorage.removeItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY);
  }
}

/**
 * Dev-only diagnostic helper. Returns a plain object describing the push environment
 * without exposing secrets. Safe to log or display in development tooling.
 *
 * @returns {Promise<object>}
 */
export async function diagnosePushEnvironment() {
  const serviceWorkerSupported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const pushManagerSupported = typeof window !== 'undefined' && 'PushManager' in window;
  const notificationSupported = typeof window !== 'undefined' && 'Notification' in window;
  const secureContext = typeof window !== 'undefined' ? window.isSecureContext === true : false;

  let permission = 'unsupported';
  if (notificationSupported) {
    try {
      permission = Notification.permission;
    } catch {
      permission = 'error';
    }
  }

  let registrationCount = 0;
  let activeServiceWorkerScriptUrl = null;
  let subscribed = false;

  if (serviceWorkerSupported) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      registrationCount = regs.length;
      const active = regs.find((r) => r.active);
      activeServiceWorkerScriptUrl = active?.active?.scriptURL ?? null;

      if (pushManagerSupported && active?.pushManager) {
        const sub = await active.pushManager.getSubscription();
        subscribed = sub !== null;
      }
    } catch {
      // Cannot access service worker registrations.
    }
  }

  const vapidKey = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_VAPID_PUBLIC_KEY ?? null) : null;
  const hasVapidPublicKey = isValidVapidPublicKey(vapidKey);
  const vapidPublicKeyLength = typeof vapidKey === 'string' ? vapidKey.trim().length : 0;

  return {
    secureContext,
    serviceWorkerSupported,
    pushManagerSupported,
    notificationSupported,
    permission,
    registrationCount,
    activeServiceWorkerScriptUrl,
    hasVapidPublicKey,
    vapidPublicKeyLength,
    subscribed
  };
}

export async function resolvePushNotificationStatus() {
  if (!isPushNotificationSupported()) {
    return { status: 'unsupported_browser', subscribed: false };
  }

  if (!isSecurePushContext()) {
    return { status: 'insecure_context', subscribed: false };
  }

  const permission = getNotificationPermission();

  if (permission === 'denied') {
    return { status: 'permission_denied', subscribed: false, permission };
  }

  if (permission === 'default') {
    return { status: 'permission_default', subscribed: false, permission };
  }

  try {
    const registration = await getServiceWorkerRegistration();

    if (!registration?.pushManager) {
      if (isViteDevMode()) {
        return {
          status: 'sw_unavailable_dev',
          subscribed: false,
          permission,
          message:
            'Push notifications require a production PWA service worker. ' +
            'Run `npm run build && npm run preview` or install the deployed PWA.'
        };
      }

      return {
        status: 'sw_unavailable',
        subscribed: false,
        permission,
        message: 'Service worker is unavailable. Reload the installed PWA.'
      };
    }

    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return { status: 'permission_granted_not_subscribed', subscribed: false, permission };
    }

    return { status: 'subscribed', subscribed: true, permission };
  } catch (error) {
    return {
      status: 'registration_failed',
      subscribed: false,
      permission,
      message: error?.message || 'Failed to read push subscription state.'
    };
  }
}
