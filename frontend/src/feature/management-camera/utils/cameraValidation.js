/** Operational status thresholds (minutes since last_seen_at). */
export const ONLINE_THRESHOLD_MINUTES = 5;
export const RECENT_THRESHOLD_MINUTES = 60;

/**
 * Mask embedded RTSP credentials for safe UI display when backend masking is absent.
 * @param {string|null|undefined} url
 * @returns {string}
 */
export function maskRtspUrl(url) {
  if (!url || typeof url !== 'string' || !url.trim()) {
    return null;
  }
  return url.replace(/\/\/([^@/]+)@/, '//***@');
}

/**
 * Derive a simple operational label from last_seen_at.
 * @param {string|null|undefined} lastSeenAt ISO timestamp
 * @returns {{ label: string, color: 'success'|'info'|'warning'|'default' }}
 */
export function deriveOperationalStatus(lastSeenAt) {
  if (!lastSeenAt) {
    return { label: 'Never seen', color: 'default' };
  }

  const seenAt = new Date(lastSeenAt);
  if (Number.isNaN(seenAt.getTime())) {
    return { label: 'Never seen', color: 'default' };
  }

  const diffMinutes = (Date.now() - seenAt.getTime()) / 60000;

  if (diffMinutes <= ONLINE_THRESHOLD_MINUTES) {
    return { label: 'Online', color: 'success' };
  }
  if (diffMinutes <= RECENT_THRESHOLD_MINUTES) {
    return { label: 'Recently seen', color: 'info' };
  }
  return { label: 'Offline', color: 'warning' };
}

/**
 * Client-side search across name, email, and location.
 * @param {Array} cameras
 * @param {string} searchText
 */
export function filterCamerasBySearch(cameras, searchText) {
  const query = searchText.trim().toLowerCase();
  if (!query) return cameras;

  return cameras.filter((camera) => {
    const haystack = [camera.name, camera.email, camera.location, camera.rtspUrlMasked]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseOptionalInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}
