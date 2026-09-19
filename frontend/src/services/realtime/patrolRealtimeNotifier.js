const listeners = new Set();

/**
 * @typedef {object} PatrolRealtimeNotification
 * @property {string} id
 * @property {'success'|'info'|'warning'|'error'} severity
 * @property {string} message
 */

/**
 * @param {(notification: PatrolRealtimeNotification) => void} listener
 */
export function subscribePatrolRealtimeNotifications(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {Omit<PatrolRealtimeNotification, 'id'> & { id?: string }} notification
 */
export function emitPatrolRealtimeNotification(notification) {
  const payload = {
    id: notification.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    severity: notification.severity ?? 'info',
    message: notification.message ?? ''
  };

  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (err) {
      console.warn('[patrol-realtime] notification listener failed', err);
    }
  });
}
