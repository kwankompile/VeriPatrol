/**
 * Device-local source of truth for the guard's in-progress patrol session.
 *
 * Guards cannot list/read patrol sessions from the monitoring API (that endpoint is
 * restricted to admins/operators), and the PWA is offline-first, so the authoritative
 * record of an *active* patrol on the guard device is persisted here. This lets the
 * Patrol page restore the active session after the guard navigates away and returns,
 * instead of incorrectly falling back to the idle "Start patrol" screen.
 */

const STORAGE_KEY = 'veripatrol.activePatrolSession.v1';

function isStorageAvailable() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   patrolSessionId: string,
 *   patrolSession: object,
 *   zoneId: string,
 *   guardUserId: string|number|null,
 *   checkpoints: object[],
 *   checkpointLogs: object[],
 *   cpNumber: number
 * }} snapshot
 */
export function saveActivePatrolSnapshot(snapshot) {
  if (!isStorageAvailable() || !snapshot?.patrolSessionId) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...snapshot, savedAt: Date.now() }));
  } catch (error) {
    console.warn('[patrol] Failed to persist active patrol snapshot', error);
  }
}

/** @returns {object|null} */
export function loadActivePatrolSnapshot() {
  if (!isStorageAvailable()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[patrol] Failed to read active patrol snapshot', error);
    return null;
  }
}

export function clearActivePatrolSnapshot() {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[patrol] Failed to clear active patrol snapshot', error);
  }
}

export const ACTIVE_PATROL_STORAGE_KEY = STORAGE_KEY;
