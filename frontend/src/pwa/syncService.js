import api from 'api/api';
import { registerPwaSyncQueueBackgroundSync } from './backgroundSyncService';
import { db } from './db';
import { SYNC_QUEUE_TYPE_LOCATION_LOG, SYNC_STATUS_SYNCED } from './locationLogService';

export const SYNC_QUEUE_STATUS_PENDING = 'pending';
export const SYNC_QUEUE_STATUS_FAILED = 'failed';
export const SYNC_QUEUE_STATUS_SYNCING = 'syncing';
export const SYNC_QUEUE_STATUS_SYNCED = 'synced';

/** Outcome of a single queue item after POST /pwa/sync (stored on sync_queue.resultStatus). */
export const SYNC_RESULT_STATUS_SYNCED = 'synced';
export const SYNC_RESULT_STATUS_DUPLICATE_SYNCED = 'duplicate_synced';
export const SYNC_RESULT_STATUS_VALIDATION_FAILED = 'validation_failed';
export const SYNC_RESULT_STATUS_CONFLICT = 'conflict';
export const SYNC_RESULT_STATUS_FAILED = 'failed';
export const SYNC_RESULT_STATUS_EXHAUSTED = 'exhausted';

export const MAX_SYNC_RETRY_COUNT = 5;

const TERMINAL_RESULT_STATUSES = [SYNC_RESULT_STATUS_VALIDATION_FAILED, SYNC_RESULT_STATUS_CONFLICT, SYNC_RESULT_STATUS_EXHAUSTED];

let activeFlush = null;

function isEligibleForAutoRetry(item) {
  if (item.status === SYNC_QUEUE_STATUS_PENDING) {
    return true;
  }
  if (item.status !== SYNC_QUEUE_STATUS_FAILED) {
    return false;
  }
  if (TERMINAL_RESULT_STATUSES.includes(item.resultStatus)) {
    return false;
  }
  if ((item.retryCount ?? 0) >= MAX_SYNC_RETRY_COUNT) {
    return false;
  }
  return true;
}

async function collectPendingOrFailedSorted() {
  const [pending, failed] = await Promise.all([
    db.sync_queue.where('status').equals(SYNC_QUEUE_STATUS_PENDING).toArray(),
    db.sync_queue.where('status').equals(SYNC_QUEUE_STATUS_FAILED).toArray()
  ]);
  return [...pending, ...failed].filter(isEligibleForAutoRetry).sort((a, b) => a.createdAt - b.createdAt);
}

async function markSyncing(id) {
  await db.sync_queue.update(id, { status: SYNC_QUEUE_STATUS_SYNCING });
}

async function markSyncSuccess(item, resultStatus) {
  await db.transaction('rw', db.sync_queue, db.location_logs, async () => {
    await db.sync_queue.update(item.id, {
      status: SYNC_QUEUE_STATUS_SYNCED,
      resultStatus,
      errorMessage: undefined,
      lastAttempt: Date.now()
    });
    if (item.type === SYNC_QUEUE_TYPE_LOCATION_LOG && item.payload?.locationLogId) {
      await db.location_logs.update(item.payload.locationLogId, { syncStatus: SYNC_STATUS_SYNCED });
    }
  });
}

async function markTerminalFailure(item, resultStatus, errorMessage) {
  await db.sync_queue.update(item.id, {
    status: SYNC_QUEUE_STATUS_FAILED,
    resultStatus,
    errorMessage: errorMessage ?? null,
    lastAttempt: Date.now()
  });
}

async function markTransientFailure(item, { retryCount, resultStatus, errorMessage }) {
  await db.sync_queue.update(item.id, {
    status: SYNC_QUEUE_STATUS_FAILED,
    retryCount,
    resultStatus,
    errorMessage: errorMessage ?? null,
    lastAttempt: Date.now()
  });
  try {
    await registerPwaSyncQueueBackgroundSync();
  } catch {
    /* registration is best-effort */
  }
}

function extractApiErrorMessage(error) {
  const data = error?.data;
  if (typeof data === 'string') {
    return data;
  }
  if (data?.message) {
    return data.message;
  }
  if (data?.data?.message) {
    return data.data.message;
  }
  return error?.message || 'Sync failed';
}

function resolveDuplicateFromResponse(response) {
  const body = response?.data;
  return body?.data?.duplicate === true || body?.duplicate === true;
}

async function processSyncItem(item) {
  if (item.type !== SYNC_QUEUE_TYPE_LOCATION_LOG) {
    await markTerminalFailure(item, SYNC_RESULT_STATUS_VALIDATION_FAILED, 'Unsupported sync queue type');
    return { stopFlush: true };
  }

  if (item.payload == null || typeof item.payload !== 'object') {
    await markTerminalFailure(item, SYNC_RESULT_STATUS_VALIDATION_FAILED, 'Invalid sync payload');
    return { stopFlush: true };
  }

  await markSyncing(item.id);

  try {
    const response = await api.post('/pwa/sync', item.payload);
    const isDuplicate = resolveDuplicateFromResponse(response);
    const resultStatus = isDuplicate ? SYNC_RESULT_STATUS_DUPLICATE_SYNCED : SYNC_RESULT_STATUS_SYNCED;
    await markSyncSuccess(item, resultStatus);
    return { stopFlush: false };
  } catch (error) {
    const status = error?.status;
    const message = extractApiErrorMessage(error);

    if (status === 422) {
      await markTerminalFailure(item, SYNC_RESULT_STATUS_VALIDATION_FAILED, message);
      return { stopFlush: true };
    }

    if (status === 409) {
      await markTerminalFailure(item, SYNC_RESULT_STATUS_CONFLICT, message);
      return { stopFlush: true };
    }

    const retryCount = (item.retryCount ?? 0) + 1;
    const resultStatus = retryCount >= MAX_SYNC_RETRY_COUNT ? SYNC_RESULT_STATUS_EXHAUSTED : SYNC_RESULT_STATUS_FAILED;
    await markTransientFailure(item, { retryCount, resultStatus, errorMessage: message });
    return { stopFlush: true };
  }
}

async function runFlush() {
  while (true) {
    const items = await collectPendingOrFailedSorted();
    const item = items[0];
    if (!item) break;

    const { stopFlush } = await processSyncItem(item);
    if (stopFlush) break;
  }
}

/**
 * Processes sync_queue items one at a time (oldest first). Serialized — concurrent calls share one run.
 * Errors are contained; does not throw to callers for normal sync/API failures.
 */
export function flushSyncQueue() {
  if (!activeFlush) {
    activeFlush = runFlush()
      .catch((err) => {
        console.warn('[sync] flush aborted', err);
      })
      .finally(() => {
        activeFlush = null;
      });
  }
  return activeFlush;
}

/**
 * Resets terminal failed rows so Retry Sync can attempt them again.
 */
export async function resetTerminalSyncFailures() {
  const failed = await db.sync_queue.where('status').equals(SYNC_QUEUE_STATUS_FAILED).toArray();
  const terminal = failed.filter((row) => TERMINAL_RESULT_STATUSES.includes(row.resultStatus));
  await Promise.all(
    terminal.map((row) =>
      db.sync_queue.update(row.id, {
        status: SYNC_QUEUE_STATUS_PENDING,
        resultStatus: undefined,
        errorMessage: undefined,
        retryCount: 0
      })
    )
  );
  return terminal.length;
}

/** Registers Background Sync when Dexie still has pending or retry-eligible failed queue rows. */
export async function registerBackgroundSyncIfQueueHasWork() {
  const items = await collectPendingOrFailedSorted();
  if (items.length === 0) {
    return false;
  }
  return registerPwaSyncQueueBackgroundSync();
}
