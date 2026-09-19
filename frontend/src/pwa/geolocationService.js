/**
 * PWA layer — browser geolocation infrastructure only.
 *
 * Responsibilities: access `navigator.geolocation`, optional wrappers with shared defaults,
 * permission/device errors as normalized `{ code, message }` objects.
 *
 * Does not persist positions or encode patrol/domain rules — that belongs to feature modules
 * (e.g. patrol geolocation) calling into `pwa/locationLogService`.
 */

export const GEO_ERROR_UNSUPPORTED = 'GEO_UNSUPPORTED';
export const GEO_ERROR_PERMISSION_DENIED = 'GEO_PERMISSION_DENIED';
export const GEO_ERROR_POSITION_UNAVAILABLE = 'GEO_POSITION_UNAVAILABLE';
export const GEO_ERROR_TIMEOUT = 'GEO_TIMEOUT';
export const GEO_ERROR_UNKNOWN = 'GEO_UNKNOWN';

/** Shared defaults for patrol-grade fixes (high accuracy, bounded staleness). */
export const DEFAULT_GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 5000
});

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && !!navigator.geolocation;
}

export function normalizeGeolocationError(error) {
  const base = { message: error?.message || 'Geolocation error' };
  switch (error?.code) {
    case 1:
      return { ...base, code: GEO_ERROR_PERMISSION_DENIED };
    case 2:
      return { ...base, code: GEO_ERROR_POSITION_UNAVAILABLE };
    case 3:
      return { ...base, code: GEO_ERROR_TIMEOUT };
    default:
      return { ...base, code: GEO_ERROR_UNKNOWN };
  }
}

function unsupportedError() {
  return {
    code: GEO_ERROR_UNSUPPORTED,
    message: 'Geolocation is not supported by this browser'
  };
}

/**
 * One-shot browser position (does not write to storage).
 * @param {PositionOptions} [options]
 * @returns {Promise<GeolocationPosition>}
 */
export function getCurrentPosition(options = DEFAULT_GEOLOCATION_OPTIONS) {
  return new Promise((resolve, reject) => {
    if (!isGeolocationSupported()) {
      reject(unsupportedError());
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(normalizeGeolocationError(err)), options);
  });
}

/**
 * Continuous fixes (does not write to storage).
 * @returns {number | null} watch id, or null if unsupported / failed to start
 */
export function watchPosition(onSuccess, onError, options = DEFAULT_GEOLOCATION_OPTIONS) {
  if (!isGeolocationSupported()) {
    if (typeof onError === 'function') {
      onError(unsupportedError());
    }
    return null;
  }
  return navigator.geolocation.watchPosition(
    onSuccess,
    (err) => {
      if (typeof onError === 'function') {
        onError(normalizeGeolocationError(err));
      }
    },
    options
  );
}

/** Stops a watch id returned by `watchPosition`. */
export function clearWatch(watchId) {
  if (watchId == null || !isGeolocationSupported()) return;
  try {
    navigator.geolocation.clearWatch(watchId);
  } catch (e) {
    console.warn('[pwa/geolocation] clearWatch failed', e);
  }
}
