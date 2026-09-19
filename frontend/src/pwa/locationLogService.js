import { registerPwaSyncQueueBackgroundSync } from './backgroundSyncService';
import { db } from './db';

export const SYNC_STATUS_PENDING = 'pending';
export const SYNC_STATUS_SYNCED = 'synced';

export const SYNC_QUEUE_TYPE_LOCATION_LOG = 'location_log';

export const LOCATION_SOURCE = Object.freeze({
  LIVE: 'live',
  RESUME: 'resume',
  SYNC: 'sync'
});

export const TRACKING_STATE = Object.freeze({
  ACTIVE: 'active',
  RESUMED: 'resumed',
  OFFLINE: 'offline'
});

const SOURCE_VALUES = new Set(Object.values(LOCATION_SOURCE));
const TRACKING_VALUES = new Set(Object.values(TRACKING_STATE));

/** @type {Map<string, number>} */
const lastTimestampByPatrolId = new Map();

async function resolveLastTimestampForPatrol(patrolId) {
  const cached = lastTimestampByPatrolId.get(patrolId);
  if (cached != null && cached > 0) {
    return cached;
  }

  const rows = await db.location_logs.where('patrolId').equals(patrolId).sortBy('timestamp');
  const last = rows.length > 0 ? Number(rows[rows.length - 1].timestamp) : 0;
  if (last > 0) {
    lastTimestampByPatrolId.set(patrolId, last);
  }

  return last;
}

/**
 * Mobile GPS often repeats `position.timestamp` at second precision; backend movement
 * validation requires strictly increasing millisecond timestamps per patrol session.
 */
async function ensureStrictlyIncreasingTimestamp(patrolId, proposedTimestamp) {
  let ts = Number(proposedTimestamp);
  if (!Number.isFinite(ts) || ts <= 0) {
    ts = Date.now();
  }

  const lastTs = await resolveLastTimestampForPatrol(patrolId);
  if (ts <= lastTs) {
    ts = lastTs + 1;
  }

  lastTimestampByPatrolId.set(patrolId, ts);
  return ts;
}

/** @param {string} v */
function normalizeSource(v) {
  return SOURCE_VALUES.has(v) ? v : LOCATION_SOURCE.SYNC;
}

/** @param {string} v */
function normalizeTrackingState(v) {
  return TRACKING_VALUES.has(v) ? v : TRACKING_STATE.ACTIVE;
}

/** Saves to `location_logs` and appends a `sync_queue` row (no API calls). */
export async function saveLocationLog(locationLog) {
  const lat = Number(locationLog.lat);
  const lng = Number(locationLog.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('saveLocationLog requires finite numeric lat and lng');
  }

  const id = crypto.randomUUID();
  const proposedTimestamp = locationLog.timestamp !== undefined && locationLog.timestamp !== null ? locationLog.timestamp : Date.now();
  const timestamp = await ensureStrictlyIncreasingTimestamp(locationLog.patrolId, proposedTimestamp);
  const source = normalizeSource(locationLog.source);
  const trackingState = normalizeTrackingState(locationLog.trackingState);
  const accuracy = locationLog.accuracy != null && Number.isFinite(Number(locationLog.accuracy)) ? Number(locationLog.accuracy) : null;
  const speed = locationLog.speed != null && Number.isFinite(Number(locationLog.speed)) ? Number(locationLog.speed) : null;
  const heading = locationLog.heading != null && Number.isFinite(Number(locationLog.heading)) ? Number(locationLog.heading) : null;

  const record = {
    id,
    patrolId: locationLog.patrolId,
    userId: locationLog.userId,
    lat,
    lng,
    accuracy,
    timestamp,
    source,
    trackingState,
    speed,
    heading,
    syncStatus: locationLog.syncStatus ?? SYNC_STATUS_PENDING
  };

  const payload = {
    type: SYNC_QUEUE_TYPE_LOCATION_LOG,
    locationLogId: id,
    patrolId: record.patrolId,
    userId: record.userId,
    timestamp: record.timestamp,
    lat: record.lat,
    lng: record.lng,
    accuracy: record.accuracy,
    source: record.source,
    trackingState: record.trackingState,
    speed: record.speed,
    heading: record.heading
  };

  await db.transaction('rw', db.location_logs, db.sync_queue, async () => {
    await db.location_logs.add(record);
    await db.sync_queue.add({
      id: crypto.randomUUID(),
      type: SYNC_QUEUE_TYPE_LOCATION_LOG,
      status: SYNC_STATUS_PENDING,
      createdAt: Date.now(),
      retryCount: 0,
      payload
    });
  });

  try {
    await registerPwaSyncQueueBackgroundSync();
  } catch {
    /* registration is best-effort; online event + Retry Sync remain */
  }

  return record;
}
