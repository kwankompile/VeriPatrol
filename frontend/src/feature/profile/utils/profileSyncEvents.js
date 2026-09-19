export const PROFILE_UPDATED_EVENT = 'profile:updated';
const STORAGE_KEY = 'profile:last-updated';
const BROADCAST_CHANNEL_NAME = 'profile-sync';
const MAX_SEEN_EVENT_IDS = 50;

function createEventId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}

/**
 * @param {Record<string, unknown>} payload
 */
export function publishProfileUpdated(payload) {
  const detail = {
    ...payload,
    eventId: createEventId(),
    publishedAt: Date.now()
  };

  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail }));

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.postMessage(detail);
    channel.close();
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(detail));
  } catch {
    // Ignore quota or privacy-mode failures.
  }
}

/**
 * @param {(detail: Record<string, unknown>) => void} callback
 * @returns {() => void}
 */
export function subscribeToProfileUpdates(callback) {
  const seenEventIds = new Set();

  const deliver = (detail) => {
    const eventId = detail?.eventId;

    if (typeof eventId === 'string' && eventId !== '') {
      if (seenEventIds.has(eventId)) {
        return;
      }

      seenEventIds.add(eventId);

      if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
        const oldest = seenEventIds.values().next().value;
        seenEventIds.delete(oldest);
      }
    }

    callback(detail ?? {});
  };

  const onCustomEvent = (event) => {
    deliver(event.detail ?? {});
  };

  window.addEventListener(PROFILE_UPDATED_EVENT, onCustomEvent);

  let channel = null;

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.onmessage = (event) => {
      deliver(event.data ?? {});
    };
  }

  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) {
      return;
    }

    try {
      deliver(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed sync payloads.
    }
  };

  if (typeof BroadcastChannel === 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    window.removeEventListener(PROFILE_UPDATED_EVENT, onCustomEvent);

    if (typeof BroadcastChannel === 'undefined') {
      window.removeEventListener('storage', onStorage);
    }

    if (channel) {
      channel.close();
    }
  };
}
