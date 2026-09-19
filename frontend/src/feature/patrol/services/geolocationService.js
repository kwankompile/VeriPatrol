/**
 * Patrol domain layer — patrol GPS tracking orchestration.
 *
 * Uses `pwa/geolocationService` only for browser APIs (infra). Uses `pwa/locationLogService.saveLocationLog`
 * for persistence (IndexedDB + sync queue stay in the PWA data layer — not duplicated here).
 *
 * Geofence / checkpoint auto-complete is intentionally out of scope until a later milestone.
 */

import {
  clearWatch,
  getCurrentPosition as getBrowserPosition,
  isGeolocationSupported,
  watchPosition as browserWatchPosition,
  GEO_ERROR_UNSUPPORTED,
  normalizeGeolocationError
} from 'pwa/geolocationService';

import { LOCATION_SOURCE, TRACKING_STATE, saveLocationLog } from 'pwa/locationLogService';

/** High-accuracy options for pre-patrol location warm-up (no persistence). */
export const WARM_UP_GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 0
});

/** @type {number | null} */
let prePatrolWatchId = null;

/** @type {number | null} */
let activeWatchId = null;

export function stopPrePatrolLocationWatch() {
  if (prePatrolWatchId != null) {
    clearWatch(prePatrolWatchId);
    prePatrolWatchId = null;
  }
}

/**
 * One-shot pre-patrol location fix (does not persist to IndexedDB).
 * @param {PositionOptions} [options]
 * @returns {Promise<GeolocationPosition>}
 */
export async function detectCurrentLocation(options = WARM_UP_GEOLOCATION_OPTIONS) {
  return getBrowserPosition(options);
}

/**
 * Lightweight pre-patrol GPS watch for UI warm-up (does not persist).
 * @returns {number | null} watch id
 */
export function warmUpCurrentLocation(onPosition, onError) {
  stopPrePatrolLocationWatch();
  if (!isGeolocationSupported()) {
    const err = { code: GEO_ERROR_UNSUPPORTED, message: 'Geolocation is not supported by this browser' };
    onError?.(err);
    return null;
  }
  prePatrolWatchId = browserWatchPosition(onPosition, onError, WARM_UP_GEOLOCATION_OPTIONS);
  return prePatrolWatchId;
}

function patrolOfflineAwareTrackingState() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return TRACKING_STATE.OFFLINE;
  }
  return TRACKING_STATE.ACTIVE;
}

function trackingStateForSnapshotSource(source) {
  if (source === LOCATION_SOURCE.RESUME) return TRACKING_STATE.RESUMED;
  return patrolOfflineAwareTrackingState();
}

function positionToLogPayload(position, source, trackingState) {
  const ts = position.timestamp != null ? position.timestamp : Date.now();
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
    timestamp: ts,
    source,
    trackingState,
    speed: position.coords.speed ?? null,
    heading: position.coords.heading ?? null
  };
}

async function persistPatrolPosition(position, patrolId, userId, source, trackingStateOverride) {
  const trackingState =
    trackingStateOverride ?? (source === LOCATION_SOURCE.LIVE ? patrolOfflineAwareTrackingState() : trackingStateForSnapshotSource(source));
  const payload = positionToLogPayload(position, source, trackingState);
  return saveLocationLog({
    patrolId,
    userId,
    ...payload
  });
}

/**
 * Haversine distance in meters (display/helper only; not geofence logic).
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  if (lat2 == null || lon2 == null || !Number.isFinite(lat1) || !Number.isFinite(lon1)) {
    return NaN;
  }
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isPatrolTrackingActive() {
  return activeWatchId != null;
}

export function stopPatrolTracking() {
  if (activeWatchId != null) {
    clearWatch(activeWatchId);
    activeWatchId = null;
  }
}

/**
 * One-shot fix + IndexedDB log (live / resume snapshot flows).
 * `source` must be one of `LOCATION_SOURCE` (`live` | `resume` | `sync`).
 */
/** @returns {Promise<{ position: GeolocationPosition, record: Awaited<ReturnType<typeof saveLocationLog>> }>} */
export async function capturePatrolLocationSnapshot({ patrolId, userId, source }) {
  const position = await getBrowserPosition();
  const record = await persistPatrolPosition(position, patrolId, userId, source);
  return { position, record };
}

/**
 * Starts patrol tracking: optional initial fix + watch; each fix persisted via `saveLocationLog`.
 *
 * Set `skipInitialPersistAndFetch` when you already captured the first fix with `capturePatrolLocationSnapshot`
 * (one-shot IndexedDB log) and only want the continuous watch.
 *
 * @param {{
 *   patrolId: string | number,
 *   userId: string | number,
 *   skipInitialPersistAndFetch?: boolean,
 *   onPosition?: (position: GeolocationPosition) => void,
 *   onLocationSaved?: (record: Awaited<ReturnType<typeof saveLocationLog>>) => void,
 *   onError?: (err: Error | { code: string, message: string }) => void
 * }} opts
 */
export async function startPatrolTracking({ patrolId, userId, skipInitialPersistAndFetch = false, onPosition, onLocationSaved, onError }) {
  stopPrePatrolLocationWatch();
  stopPatrolTracking();

  if (!isGeolocationSupported()) {
    const err = { code: GEO_ERROR_UNSUPPORTED, message: 'Geolocation is not supported by this browser' };
    onError?.(err);
    throw err;
  }

  if (!skipInitialPersistAndFetch) {
    try {
      const initial = await getBrowserPosition();
      const saved = await persistPatrolPosition(initial, patrolId, userId, LOCATION_SOURCE.LIVE);
      onLocationSaved?.(saved);
      onPosition?.(initial);
    } catch (e) {
      const normalized = e && typeof e === 'object' && typeof e.code === 'string' ? e : normalizeGeolocationError(e);
      console.error('[patrol/geolocation] initial position failed', normalized);
      onError?.(normalized);
      throw normalized;
    }
  }

  activeWatchId = browserWatchPosition(
    (position) => {
      (async () => {
        try {
          const saved = await persistPatrolPosition(position, patrolId, userId, LOCATION_SOURCE.LIVE);
          onLocationSaved?.(saved);
          onPosition?.(position);
        } catch (persistErr) {
          const wrapped = persistErr instanceof Error ? persistErr : new Error(String(persistErr));
          onError?.(wrapped);
          console.warn('[patrol/geolocation] saveLocationLog failed', persistErr);
        }
      })();
    },
    (err) => {
      console.error('[patrol/geolocation] watch error', err);
      onError?.(err);
    }
  );

  if (activeWatchId === null || activeWatchId === undefined) {
    const err = { code: GEO_ERROR_UNSUPPORTED, message: 'Unable to start location watch' };
    onError?.(err);
  }
}

/** Convenience namespace for consumers that prefer a single import. */
export const patrolGeolocation = {
  startPatrolTracking,
  stopPatrolTracking,
  capturePatrolLocationSnapshot,
  detectCurrentLocation,
  warmUpCurrentLocation,
  stopPrePatrolLocationWatch,
  isPatrolTrackingActive,
  calculateDistance
};
