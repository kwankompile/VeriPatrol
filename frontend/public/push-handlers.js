/**
 * Custom service worker handlers loaded by Workbox via `importScripts` (see vite.config.mjs).
 * Push delivery / click handling — complementary to Laravel Reverb WebSockets.
 */

function resolveNotificationUrl(payload) {
  if (!payload || typeof payload !== 'object') {
    return './';
  }

  const dataUrl = payload.data?.url;
  if (typeof dataUrl === 'string' && dataUrl.trim()) {
    return dataUrl;
  }

  if (typeof payload.url === 'string' && payload.url.trim()) {
    return payload.url;
  }

  return './';
}

function resolveAbsoluteNotificationUrl(targetUrl) {
  const baseUrl = self.registration?.scope || self.location.href;
  return new URL(targetUrl, baseUrl).href;
}

function buildNotificationOptions(payload) {
  const url = resolveNotificationUrl(payload);

  return {
    body: payload.body || '',
    icon: payload.icon || 'icons/icon-192.png',
    badge: payload.badge || 'icons/icon-192.png',
    tag: payload.tag || 'patrol-alert',
    data: {
      ...(payload.data && typeof payload.data === 'object' ? payload.data : {}),
      url
    }
  };
}

self.addEventListener('push', (event) => {
  const fallback = {
    title: 'VeriPatrol',
    body: '',
    url: './'
  };

  let payload = fallback;

  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() };
    } catch {
      payload = { ...fallback, body: event.data.text() || '' };
    }
  }

  const title = payload.title || fallback.title;
  const options = buildNotificationOptions(payload);

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'pwa-sync-queue') {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      clientList.forEach((client) => {
        client.postMessage({ type: 'PWA_SYNC_REQUEST' });
      });
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = resolveNotificationUrl(event.notification?.data || {});
  const absoluteUrl = resolveAbsoluteNotificationUrl(targetUrl);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            return client.focus().then(() => client.navigate(absoluteUrl));
          }

          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(absoluteUrl);
      }

      return undefined;
    })
  );
});
