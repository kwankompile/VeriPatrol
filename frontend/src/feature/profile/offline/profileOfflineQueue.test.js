import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueItems = new Map();

vi.mock('pwa/db', () => ({
  db: {
    profile_update_queue: {
      add: vi.fn(async (item) => {
        queueItems.set(item.id, structuredClone(item));
      }),
      update: vi.fn(async (id, patch) => {
        const row = queueItems.get(id);
        if (row) {
          Object.assign(row, patch);
        }
      }),
      delete: vi.fn(async (id) => {
        queueItems.delete(id);
      }),
      get: vi.fn(async (id) => queueItems.get(id) ?? null),
      toArray: vi.fn(async () => [...queueItems.values()])
    }
  }
}));

import {
  __resetProfileOfflineQueueFlushForTests,
  enqueueContactUpdate,
  flushProfileOfflineQueue,
  getActiveOfflineQueueItem,
  isSafeContactQueuePayload,
  PROFILE_QUEUE_STATUS_CONFLICT,
  PROFILE_QUEUE_STATUS_EXHAUSTED,
  PROFILE_QUEUE_STATUS_PENDING,
  PROFILE_QUEUE_STATUS_SYNCED,
  PROFILE_QUEUE_STATUS_SYNCING,
  PROFILE_QUEUE_SYNC_STALE_MS,
  PROFILE_QUEUE_TYPE_CONTACT_UPDATE,
  resetExhaustedQueueItemForRetry,
  resetStaleSyncingQueueItems
} from './profileOfflineQueue';

describe('profileOfflineQueue', () => {
  const repository = {
    updateProfile: vi.fn()
  };

  beforeEach(() => {
    queueItems.clear();
    vi.clearAllMocks();
    __resetProfileOfflineQueueFlushForTests();
  });

  it('enqueues offline phone/address updates with safe fields only', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 4
    });

    const item = queueItems.get(id);
    expect(item.type).toBe(PROFILE_QUEUE_TYPE_CONTACT_UPDATE);
    expect(item.payload).toEqual({
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profile_version: 4
    });
    expect(isSafeContactQueuePayload(item.payload)).toBe(true);
  });

  it('rejects unsafe queue payloads', () => {
    expect(
      isSafeContactQueuePayload({
        phone: '0123',
        address: 'HQ',
        profile_version: 1,
        password: 'secret'
      })
    ).toBe(false);

    expect(
      isSafeContactQueuePayload({
        phone: '0123',
        address: 'token-value',
        profile_version: 1
      })
    ).toBe(false);
  });

  it('coalesces pending contact updates for the same profile', async () => {
    await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0111111111',
      address: 'Old',
      profileVersion: 4
    });
    await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'New',
      profileVersion: 4
    });

    expect(queueItems.size).toBe(1);
    const [item] = [...queueItems.values()];
    expect(item.payload.phone).toBe('0123456789');
    expect(item.payload.address).toBe('New');
  });

  it('flush success marks item synced and returns updated profile', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 4
    });

    repository.updateProfile.mockResolvedValue({
      id: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 5
    });

    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-1' });

    expect(repository.updateProfile).toHaveBeenCalledWith({
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profile_version: 4
    });
    expect(queueItems.get(id).status).toBe(PROFILE_QUEUE_STATUS_SYNCED);
    expect(result.syncedProfile.profileVersion).toBe(5);
  });

  it('flush handles profile_version_conflict and preserves local/server values', async () => {
    await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Offline address',
      profileVersion: 4
    });

    const conflictError = new Error('Profile has been modified. Please refresh and try again.');
    conflictError.status = 409;
    conflictError.code = 'profile_version_conflict';
    conflictError.profile = {
      id: 'user-1',
      phone: 'Server phone',
      address: 'Server address',
      profileVersion: 6
    };
    repository.updateProfile.mockRejectedValue(conflictError);

    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-1' });

    expect(result.conflictItem.status).toBe(PROFILE_QUEUE_STATUS_CONFLICT);
    expect(result.conflictItem.localValues.address).toBe('Offline address');
    expect(result.conflictItem.serverValues.address).toBe('Server address');
    expect(result.conflictItem.serverProfile.profileVersion).toBe(6);
  });

  it('flush handles 422 as terminal validation failure', async () => {
    await enqueueContactUpdate({
      profileId: 'user-1',
      phone: 'bad',
      address: 'Kuala Lumpur',
      profileVersion: 4
    });

    repository.updateProfile.mockRejectedValue({
      message: 'Validation failed.',
      status: 422,
      data: {
        data: {
          errors: {
            phone: ['The phone field is invalid.']
          }
        }
      }
    });

    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-1' });

    expect(result.validationError?.fieldErrors.phone[0]).toBe('The phone field is invalid.');
    const [item] = [...queueItems.values()];
    expect(item.status).toBe(PROFILE_QUEUE_STATUS_EXHAUSTED);
  });

  it('shares one active flush run for overlapping calls', async () => {
    await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 4
    });

    repository.updateProfile.mockResolvedValue({
      id: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 5
    });

    await Promise.all([
      flushProfileOfflineQueue({ repository, profileId: 'user-1' }),
      flushProfileOfflineQueue({ repository, profileId: 'user-1' })
    ]);

    expect(repository.updateProfile).toHaveBeenCalledTimes(1);
  });

  it('increments retry count on transient failure', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 4
    });

    repository.updateProfile.mockRejectedValue({
      message: 'Network error',
      status: 500
    });

    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-1' });

    expect(result.retryableFailure).toBe('Network error');
    expect(queueItems.get(id).retryCount).toBe(1);
    expect(queueItems.get(id).status).toBe('failed');
  });

  it('exposes active conflict queue item for UI recovery', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Offline',
      profileVersion: 4
    });

    queueItems.set(id, {
      ...queueItems.get(id),
      status: PROFILE_QUEUE_STATUS_CONFLICT,
      serverValues: { phone: 'Server', address: 'Server address' },
      localValues: { phone: '0123456789', address: 'Offline' }
    });

    const active = await getActiveOfflineQueueItem({ profileId: 'user-1' });
    expect(active.status).toBe(PROFILE_QUEUE_STATUS_CONFLICT);
  });

  it('does not flush queued items for a different profile', async () => {
    await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'User A address',
      profileVersion: 4
    });

    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-2' });

    expect(repository.updateProfile).not.toHaveBeenCalled();
    expect(result.syncedProfile).toBeNull();
    const [item] = [...queueItems.values()];
    expect(item.status).toBe(PROFILE_QUEUE_STATUS_PENDING);
  });

  it('does not return active queue items for a different profile', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Offline',
      profileVersion: 4
    });

    queueItems.set(id, {
      ...queueItems.get(id),
      status: PROFILE_QUEUE_STATUS_CONFLICT,
      serverValues: { phone: 'Server', address: 'Server address' },
      localValues: { phone: '0123456789', address: 'Offline' }
    });

    const active = await getActiveOfflineQueueItem({ profileId: 'user-2' });
    expect(active).toBeNull();
  });

  it('resets exhausted queue rows for manual retry', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 4
    });

    queueItems.set(id, {
      ...queueItems.get(id),
      status: PROFILE_QUEUE_STATUS_EXHAUSTED,
      resultStatus: 'exhausted',
      retryCount: 5
    });

    const reset = await resetExhaustedQueueItemForRetry({ profileId: 'user-1', itemId: id });

    expect(reset).toBe(true);
    expect(queueItems.get(id).status).toBe(PROFILE_QUEUE_STATUS_PENDING);
    expect(queueItems.get(id).retryCount).toBe(0);
  });

  it('resets stale syncing rows and replays them on flush', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 4
    });

    const staleLastAttempt = Date.now() - PROFILE_QUEUE_SYNC_STALE_MS - 1000;
    queueItems.set(id, {
      ...queueItems.get(id),
      status: PROFILE_QUEUE_STATUS_SYNCING,
      lastAttempt: staleLastAttempt
    });

    repository.updateProfile.mockResolvedValue({
      id: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 5
    });

    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-1' });

    expect(queueItems.get(id).status).toBe(PROFILE_QUEUE_STATUS_SYNCED);
    expect(repository.updateProfile).toHaveBeenCalledTimes(1);
    expect(result.syncedProfile.profileVersion).toBe(5);
  });

  it('recovers interrupted flush after mount via getActiveOfflineQueueItem', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Interrupted address',
      profileVersion: 4
    });

    queueItems.set(id, {
      ...queueItems.get(id),
      status: PROFILE_QUEUE_STATUS_SYNCING,
      lastAttempt: Date.now() - PROFILE_QUEUE_SYNC_STALE_MS - 5000
    });

    await resetStaleSyncingQueueItems({ profileId: 'user-1' });

    expect(queueItems.get(id).status).toBe(PROFILE_QUEUE_STATUS_PENDING);
    expect(queueItems.get(id).errorMessage).toBe('Previous sync was interrupted. Retrying.');

    const active = await getActiveOfflineQueueItem({ profileId: 'user-1' });
    expect(active?.status).toBe(PROFILE_QUEUE_STATUS_PENDING);
  });

  it('does not reset fresh syncing rows during an active flush window', async () => {
    const id = await enqueueContactUpdate({
      profileId: 'user-1',
      phone: '0123456789',
      address: 'Kuala Lumpur',
      profileVersion: 4
    });

    queueItems.set(id, {
      ...queueItems.get(id),
      status: PROFILE_QUEUE_STATUS_SYNCING,
      lastAttempt: Date.now() - 1000
    });

    await resetStaleSyncingQueueItems({ profileId: 'user-1' });
    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-1' });

    expect(queueItems.get(id).status).toBe(PROFILE_QUEUE_STATUS_SYNCING);
    expect(repository.updateProfile).not.toHaveBeenCalled();
    expect(result.syncedProfile).toBeNull();
  });

  it('marks unsupported same-profile queue rows as terminal validation failure without network', async () => {
    queueItems.set('unsafe-queue-1', {
      id: 'unsafe-queue-1',
      profileId: 'user-1',
      type: 'profile_password_change',
      status: PROFILE_QUEUE_STATUS_PENDING,
      resultStatus: null,
      payload: { password: 'secret', profile_version: 4 },
      localValues: { phone: null, address: null },
      serverValues: null,
      serverProfile: null,
      retryCount: 0,
      errorMessage: null,
      createdAt: Date.now(),
      lastAttempt: null,
      syncedAt: null
    });

    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-1' });

    expect(repository.updateProfile).not.toHaveBeenCalled();
    expect(queueItems.get('unsafe-queue-1').status).toBe(PROFILE_QUEUE_STATUS_EXHAUSTED);
    expect(queueItems.get('unsafe-queue-1').resultStatus).toBe('validation_failed');
    expect(result.validationError?.message).toBe('Queued profile update is invalid and cannot be synced.');
  });

  it('marks unsafe payload queue rows as terminal validation failure without network', async () => {
    queueItems.set('unsafe-queue-2', {
      id: 'unsafe-queue-2',
      profileId: 'user-1',
      type: PROFILE_QUEUE_TYPE_CONTACT_UPDATE,
      status: PROFILE_QUEUE_STATUS_PENDING,
      resultStatus: null,
      payload: {
        phone: '0123456789',
        address: 'token-value',
        profile_version: 4
      },
      localValues: { phone: '0123456789', address: 'token-value' },
      serverValues: null,
      serverProfile: null,
      retryCount: 0,
      errorMessage: null,
      createdAt: Date.now(),
      lastAttempt: null,
      syncedAt: null
    });

    const result = await flushProfileOfflineQueue({ repository, profileId: 'user-1' });

    expect(repository.updateProfile).not.toHaveBeenCalled();
    expect(queueItems.get('unsafe-queue-2').status).toBe(PROFILE_QUEUE_STATUS_EXHAUSTED);
    expect(result.validationError?.message).toBe('Queued profile update is invalid and cannot be synced.');
  });
});
