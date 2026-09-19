/**
 * Normalized route-point shape for maps, replay, and live tracking.
 * Canonical backend source: location_logs (legacy patrol_routes fallback may appear).
 *
 * @typedef {object} PatrolRoutePoint
 * @property {string} id
 * @property {string|null} patrol_session_id
 * @property {number} latitude
 * @property {number} longitude
 * @property {number|null} accuracy
 * @property {string|null} recorded_at
 */

/**
 * @param {unknown} raw
 * @returns {PatrolRoutePoint|null}
 */
export function normalizeRoutePoint(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const latitude = Number(raw.latitude ?? raw.lat);
  const longitude = Number(raw.longitude ?? raw.lng ?? raw.lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  const recordedAt =
    raw.recorded_at ??
    (Number.isFinite(Number(raw.timestamp)) && Number(raw.timestamp) > 0
      ? new Date(Number(raw.timestamp)).toISOString()
      : null);

  const id =
    raw.id ??
    raw.location_log_id ??
    (recordedAt != null
      ? `${raw.patrol_session_id ?? 'unknown'}-${recordedAt}-${latitude}-${longitude}`
      : null);

  if (!id) {
    return null;
  }

  const accuracyRaw = raw.accuracy;
  const accuracy =
    accuracyRaw === null || accuracyRaw === undefined || accuracyRaw === ''
      ? null
      : Number(accuracyRaw);

  return {
    id: String(id),
    patrol_session_id: raw.patrol_session_id ?? raw.patrolSessionId ?? null,
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    recorded_at: recordedAt
  };
}

/**
 * Stable dedupe key: prefer location-log id; legacy fallback uses session+coords+time.
 * Does not collapse distinct points that merely share coordinates.
 *
 * @param {Pick<PatrolRoutePoint, 'id'|'patrol_session_id'|'latitude'|'longitude'|'recorded_at'>} point
 */
export function routePointDedupeKey(point) {
  if (point?.id) {
    return `id:${point.id}`;
  }
  return `legacy:${point?.patrol_session_id ?? ''}:${point?.latitude}:${point?.longitude}:${point?.recorded_at ?? ''}`;
}

/**
 * @param {unknown[]} rows
 * @returns {PatrolRoutePoint[]}
 */
export function normalizeRoutePoints(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const seen = new Set();
  const points = [];

  for (const row of rows) {
    const point = normalizeRoutePoint(row);
    if (!point) {
      continue;
    }
    const key = routePointDedupeKey(point);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    points.push(point);
  }

  return sortRoutePoints(points);
}

/**
 * Sort by recorded_at; stable for missing timestamps.
 * @param {PatrolRoutePoint[]} points
 */
export function sortRoutePoints(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return [];
  }

  return [...points]
    .map((point, index) => ({ point, index }))
    .sort((a, b) => {
      const ta = a.point.recorded_at ? new Date(a.point.recorded_at).getTime() : NaN;
      const tb = b.point.recorded_at ? new Date(b.point.recorded_at).getTime() : NaN;
      const aValid = Number.isFinite(ta);
      const bValid = Number.isFinite(tb);
      if (aValid && bValid && ta !== tb) {
        return ta - tb;
      }
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;
      return a.index - b.index;
    })
    .map(({ point }) => point);
}

/**
 * Merge realtime/REST points without duplicating by stable id.
 * @param {PatrolRoutePoint[]} existing
 * @param {PatrolRoutePoint[]} incoming
 */
export function mergeRoutePoints(existing, incoming) {
  const map = new Map();
  for (const point of existing ?? []) {
    const normalized = normalizeRoutePoint(point);
    if (normalized) {
      map.set(routePointDedupeKey(normalized), normalized);
    }
  }
  for (const point of incoming ?? []) {
    const normalized = normalizeRoutePoint(point);
    if (normalized) {
      map.set(routePointDedupeKey(normalized), normalized);
    }
  }
  return sortRoutePoints([...map.values()]);
}
