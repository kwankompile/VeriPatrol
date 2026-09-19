import { db } from 'pwa/db';

import { extractValidationErrors } from '../utils/profileErrors';

export const PROFILE_QUEUE_TYPE_CONTACT_UPDATE = 'profile_update_contact';

export const PROFILE_QUEUE_STATUS_PENDING = 'pending';
export const PROFILE_QUEUE_STATUS_SYNCING = 'syncing';
export const PROFILE_QUEUE_STATUS_SYNCED = 'synced';
export const PROFILE_QUEUE_STATUS_FAILED = 'failed';
export const PROFILE_QUEUE_STATUS_CONFLICT = 'conflict';
export const PROFILE_QUEUE_STATUS_EXHAUSTED = 'exhausted';

export const PROFILE_QUEUE_RESULT_SYNCED = 'synced';
export const PROFILE_QUEUE_RESULT_VALIDATION_FAILED = 'validation_failed';
export const PROFILE_QUEUE_RESULT_CONFLICT = 'conflict';
export const PROFILE_QUEUE_RESULT_FAILED = 'failed';
export const PROFILE_QUEUE_RESULT_EXHAUSTED = 'exhausted';

export const MAX_PROFILE_QUEUE_RETRY_COUNT = 5;
export const PROFILE_QUEUE_SYNC_STALE_MS = 2 * 60 * 1000;

const ALLOWED_PAYLOAD_KEYS = new Set(['phone', 'address', 'profile_version']);
const FORBIDDEN_QUEUE_STRING_PATTERNS = /password|otp|token|secret|refresh/i;

/** @type {Map<string, Promise<import('./profileOfflineQueue').ProfileFlushResult>>} */
const activeFlushByProfile = new Map();

/** @internal Test helper */
export function __resetProfileOfflineQueueFlushForTests() {
  activeFlushByProfile.clear();
}

/**
 * @returns {string}
 */
export function createQueueItemId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `profile-queue-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {unknown} payload
 * @returns {boolean}
 */
export function isSafeContactQueuePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const keys = Object.keys(payload);
  if (!keys.every((key) => ALLOWED_PAYLOAD_KEYS.has(key))) {
    return false;
  }

  const serialized = JSON.stringify(payload);
  return !FORBIDDEN_QUEUE_STRING_PATTERNS.test(serialized);
}

/**
 * @param {{ phone?: string | null; address?: string | null }} values
 */
function normalizeQueuedContactValue(values) {
  return {
    phone: values.phone === '' || values.phone == null ? null : String(values.phone),
    address: values.address === '' || values.address == null ? null : String(values.address)
  };
}

/**
 * @param {import('../repositories/ProfileRepository').NormalizedProfileUser | null | undefined} profile
 */
function serializeServerProfile(profile) {
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    phone: profile.phone ?? null,
    address: profile.address ?? null,
    profileVersion: profile.profileVersion
  };
}

/**
 * @returns {Promise<import('./profileOfflineQueue').ProfileOfflineQueueItem[]>}
 */
export async function getAllProfileQueueItems() {
  const items = await db.profile_update_queue.toArray();
  return items.sort((left, right) => left.createdAt - right.createdAt);
}

/**
 * @param {{ profileId?: string }} params
 */
export async function resetStaleSyncingQueueItems({ profileId }) {
  if (!profileId) {
    return;
  }

  const now = Date.now();
  const items = await getAllProfileQueueItems();

  await Promise.all(
    items
      .filter(
        (item) =>
          item.profileId === profileId &&
          item.type === PROFILE_QUEUE_TYPE_CONTACT_UPDATE &&
          item.status === PROFILE_QUEUE_STATUS_SYNCING &&
          item.lastAttempt &&
          now - item.lastAttempt > PROFILE_QUEUE_SYNC_STALE_MS
      )
      .map((item) =>
        db.profile_update_queue.update(item.id, {
          status: PROFILE_QUEUE_STATUS_PENDING,
          errorMessage: 'Previous sync was interrupted. Retrying.'
        })
      )
  );
}

/**
 * @param {{ profileId?: string }} [params]
 * @returns {Promise<import('./profileOfflineQueue').ProfileOfflineQueueItem | null>}
 */
export async function getActiveOfflineQueueItem({ profileId } = {}) {
  if (!profileId) {
    return null;
  }

  await resetStaleSyncingQueueItems({ profileId });

  const items = await getAllProfileQueueItems();
  const scopedItems = items.filter(
    (item) => item.profileId === profileId && item.type === PROFILE_QUEUE_TYPE_CONTACT_UPDATE
  );
  const priority = [
    PROFILE_QUEUE_STATUS_CONFLICT,
    PROFILE_QUEUE_STATUS_SYNCING,
    PROFILE_QUEUE_STATUS_PENDING,
    PROFILE_QUEUE_STATUS_FAILED,
    PROFILE_QUEUE_STATUS_EXHAUSTED
  ];

  for (const status of priority) {
    const match = scopedItems.find((item) => item.status === status);
    if (match) {
      return match;
    }
  }

  return null;
}

function isEligibleForReplay(item) {
  if (item.status === PROFILE_QUEUE_STATUS_PENDING) {
    return true;
  }

  if (item.status !== PROFILE_QUEUE_STATUS_FAILED) {
    return false;
  }

  if (item.resultStatus === PROFILE_QUEUE_RESULT_VALIDATION_FAILED || item.resultStatus === PROFILE_QUEUE_RESULT_EXHAUSTED) {
    return false;
  }

  return (item.retryCount ?? 0) < MAX_PROFILE_QUEUE_RETRY_COUNT;
}

/**
 * @param {import('./profileOfflineQueue').ProfileOfflineQueueItem} item
 * @param {string} profileId
 * @returns {boolean}
 */
export function isReplayableContactQueueItem(item, profileId) {
  return (
    item.profileId === profileId &&
    item.type === PROFILE_QUEUE_TYPE_CONTACT_UPDATE &&
    isSafeContactQueuePayload(item.payload) &&
    isEligibleForReplay(item)
  );
}

/**
 * @param {string} itemId
 * @param {string} message
 */
async function markQueueItemTerminalValidationFailed(itemId, message) {
  await db.profile_update_queue.update(itemId, {
    status: PROFILE_QUEUE_STATUS_EXHAUSTED,
    resultStatus: PROFILE_QUEUE_RESULT_VALIDATION_FAILED,
    errorMessage: message,
    lastAttempt: Date.now()
  });
}

/**
 * @param {string} profileId
 * @param {{ phone: string; address: string; profileVersion: number }} input
 */
export async function enqueueContactUpdate({ profileId, phone, address, profileVersion }) {
  const localValues = normalizeQueuedContactValue({ phone, address });
  const payload = {
    ...localValues,
    profile_version: profileVersion
  };

  if (!isSafeContactQueuePayload(payload)) {
    throw new Error('Unsafe profile queue payload.');
  }

  const existingItems = await getAllProfileQueueItems();
  const replaceable = existingItems.find(
    (item) =>
      item.type === PROFILE_QUEUE_TYPE_CONTACT_UPDATE &&
      item.profileId === profileId &&
      (item.status === PROFILE_QUEUE_STATUS_PENDING || item.status === PROFILE_QUEUE_STATUS_FAILED)
  );

  const now = Date.now();

  if (replaceable) {
    await db.profile_update_queue.update(replaceable.id, {
      payload,
      localValues,
      status: PROFILE_QUEUE_STATUS_PENDING,
      resultStatus: null,
      serverValues: null,
      serverProfile: null,
      retryCount: 0,
      errorMessage: null,
      lastAttempt: null,
      syncedAt: null,
      createdAt: now
    });
    return replaceable.id;
  }

  const id = createQueueItemId();
  await db.profile_update_queue.add({
    id,
    profileId,
    type: PROFILE_QUEUE_TYPE_CONTACT_UPDATE,
    status: PROFILE_QUEUE_STATUS_PENDING,
    resultStatus: null,
    payload,
    localValues,
    serverValues: null,
    serverProfile: null,
    retryCount: 0,
    errorMessage: null,
    createdAt: now,
    lastAttempt: null,
    syncedAt: null
  });

  return id;
}

/**
 * @param {string} id
 */
export async function dismissOfflineQueueItem(id) {
  await db.profile_update_queue.delete(id);
}

/**
 * Resets an exhausted queue row so manual retry can replay it.
 *
 * @param {{ profileId: string; itemId: string }} params
 * @returns {Promise<boolean>}
 */
export async function resetExhaustedQueueItemForRetry({ profileId, itemId }) {
  const item = await db.profile_update_queue.get(itemId);

  if (!item || item.profileId !== profileId || item.status !== PROFILE_QUEUE_STATUS_EXHAUSTED) {
    return false;
  }

  await db.profile_update_queue.update(itemId, {
    status: PROFILE_QUEUE_STATUS_PENDING,
    resultStatus: null,
    retryCount: 0,
    errorMessage: null
  });

  return true;
}

/**
 * @param {{
 *   item: import('./profileOfflineQueue').ProfileOfflineQueueItem;
 *   repository: import('../repositories/ProfileRepository').ProfileRepository;
 * }} params
 */
export async function reapplyOfflineQueueItem({ item, repository }) {
  if (!item.serverProfile?.profileVersion) {
    throw new Error('Missing server profile version for offline conflict recovery.');
  }

  const payload = {
    phone: item.localValues.phone,
    address: item.localValues.address,
    profile_version: item.serverProfile.profileVersion
  };

  if (!isSafeContactQueuePayload(payload)) {
    throw new Error('Unsafe profile queue payload.');
  }

  const updated = await repository.updateProfile(payload);
  await dismissOfflineQueueItem(item.id);
  return updated;
}

/**
 * @param {import('./profileOfflineQueue').ProfileOfflineQueueItem} item
 * @param {import('../repositories/ProfileRepository').ProfileRepository} repository
 */
async function processQueueItem(item, repository) {
  await db.profile_update_queue.update(item.id, {
    status: PROFILE_QUEUE_STATUS_SYNCING,
    lastAttempt: Date.now()
  });

  try {
    const updated = await repository.updateProfile(item.payload);
    await db.profile_update_queue.update(item.id, {
      status: PROFILE_QUEUE_STATUS_SYNCED,
      resultStatus: PROFILE_QUEUE_RESULT_SYNCED,
      syncedAt: Date.now(),
      lastAttempt: Date.now(),
      errorMessage: null
    });

    return { type: 'synced', profile: updated, itemId: item.id };
  } catch (error) {
    if (error?.code === 'profile_version_conflict' && error.profile) {
      const serverValues = {
        phone: error.profile.phone ?? null,
        address: error.profile.address ?? null
      };

      await db.profile_update_queue.update(item.id, {
        status: PROFILE_QUEUE_STATUS_CONFLICT,
        resultStatus: PROFILE_QUEUE_RESULT_CONFLICT,
        serverValues,
        serverProfile: serializeServerProfile(error.profile),
        errorMessage: error.message || 'Profile version conflict.',
        lastAttempt: Date.now()
      });

      const conflictItem = await db.profile_update_queue.get(item.id);
      return { type: 'conflict', conflictItem, profile: error.profile };
    }

    if (error?.status === 422) {
      await db.profile_update_queue.update(item.id, {
        status: PROFILE_QUEUE_STATUS_EXHAUSTED,
        resultStatus: PROFILE_QUEUE_RESULT_VALIDATION_FAILED,
        errorMessage: error.message || 'Validation failed.',
        lastAttempt: Date.now()
      });

      return {
        type: 'validation_failed',
        fieldErrors: extractValidationErrors(error),
        message: error.message || 'Validation failed.',
        itemId: item.id
      };
    }

    if (error?.status === 401) {
      await db.profile_update_queue.update(item.id, {
        status: PROFILE_QUEUE_STATUS_PENDING,
        lastAttempt: Date.now()
      });

      return { type: 'auth_required' };
    }

    const retryCount = (item.retryCount ?? 0) + 1;
    const exhausted = retryCount >= MAX_PROFILE_QUEUE_RETRY_COUNT;
    const resultStatus = exhausted ? PROFILE_QUEUE_RESULT_EXHAUSTED : PROFILE_QUEUE_RESULT_FAILED;

    await db.profile_update_queue.update(item.id, {
      status: exhausted ? PROFILE_QUEUE_STATUS_EXHAUSTED : PROFILE_QUEUE_STATUS_FAILED,
      resultStatus,
      retryCount,
      errorMessage: error?.message || 'Failed to sync offline profile update.',
      lastAttempt: Date.now()
    });

    return {
      type: exhausted ? 'exhausted' : 'retryable_failure',
      itemId: item.id,
      message: error?.message || 'Failed to sync offline profile update.'
    };
  }
}

async function runFlush(repository, profileId) {
  await resetStaleSyncingQueueItems({ profileId });

  /** @type {import('./profileOfflineQueue').ProfileFlushResult} */
  const result = {
    syncedProfile: null,
    conflictItem: null,
    validationError: null,
    exhausted: false,
    authRequired: false,
    retryableFailure: null
  };

  while (true) {
    const items = await getAllProfileQueueItems();
    const blockedItem = items.find(
      (item) =>
        item.profileId === profileId &&
        isEligibleForReplay(item) &&
        (item.type !== PROFILE_QUEUE_TYPE_CONTACT_UPDATE || !isSafeContactQueuePayload(item.payload))
    );

    if (blockedItem) {
      const message = 'Queued profile update is invalid and cannot be synced.';
      await markQueueItemTerminalValidationFailed(blockedItem.id, message);
      result.validationError = {
        fieldErrors: {},
        message
      };
      break;
    }

    const nextItem = items.find((item) => isReplayableContactQueueItem(item, profileId));

    if (!nextItem) {
      break;
    }

    const outcome = await processQueueItem(nextItem, repository);

    if (outcome.type === 'synced') {
      result.syncedProfile = outcome.profile;
      continue;
    }

    if (outcome.type === 'conflict') {
      result.conflictItem = outcome.conflictItem;
      result.syncedProfile = null;
      break;
    }

    if (outcome.type === 'validation_failed') {
      result.validationError = {
        fieldErrors: outcome.fieldErrors,
        message: outcome.message
      };
      break;
    }

    if (outcome.type === 'auth_required') {
      result.authRequired = true;
      break;
    }

    if (outcome.type === 'exhausted') {
      result.exhausted = true;
      result.retryableFailure = outcome.message;
      break;
    }

    if (outcome.type === 'retryable_failure') {
      result.retryableFailure = outcome.message;
      break;
    }
  }

  return result;
}

const EMPTY_FLUSH_RESULT = {
  syncedProfile: null,
  conflictItem: null,
  validationError: null,
  exhausted: false,
  authRequired: false,
  retryableFailure: null
};

/**
 * @param {{
 *   repository: import('../repositories/ProfileRepository').ProfileRepository;
 *   profileId?: string;
 * }} params
 * @returns {Promise<import('./profileOfflineQueue').ProfileFlushResult>}
 */
export function flushProfileOfflineQueue({ repository, profileId }) {
  if (!profileId) {
    return Promise.resolve({ ...EMPTY_FLUSH_RESULT });
  }

  if (!activeFlushByProfile.has(profileId)) {
    const promise = runFlush(repository, profileId)
      .catch((error) => {
        console.warn('[profile-offline] flush aborted', error);
        return {
          ...EMPTY_FLUSH_RESULT,
          retryableFailure: error?.message || 'Offline profile sync failed.'
        };
      })
      .finally(() => {
        activeFlushByProfile.delete(profileId);
      });

    activeFlushByProfile.set(profileId, promise);
  }

  return activeFlushByProfile.get(profileId);
}

/**
 * @typedef {object} ProfileOfflineQueueItem
 * @property {string} id
 * @property {string} profileId
 * @property {string} type
 * @property {string} status
 * @property {string | null} resultStatus
 * @property {{ phone: string | null; address: string | null; profile_version: number }} payload
 * @property {{ phone: string | null; address: string | null }} localValues
 * @property {{ phone: string | null; address: string | null } | null} serverValues
 * @property {{ id: string; phone: string | null; address: string | null; profileVersion: number } | null} serverProfile
 * @property {number} retryCount
 * @property {string | null} errorMessage
 * @property {number} createdAt
 * @property {number | null} lastAttempt
 * @property {number | null} syncedAt
 */

/**
 * @typedef {object} ProfileFlushResult
 * @property {import('../repositories/ProfileRepository').NormalizedProfileUser | null} syncedProfile
 * @property {ProfileOfflineQueueItem | null} conflictItem
 * @property {{ fieldErrors: Record<string, string[]>; message: string } | null} validationError
 * @property {boolean} exhausted
 * @property {boolean} authRequired
 * @property {string | null} retryableFailure
 */
