import Dexie from 'dexie';

export const db = new Dexie('PatrolPWA');

db.version(1).stores({
  location_logs: 'id, patrolId, userId, timestamp, syncStatus',
  sync_queue: 'id, type, status, createdAt',
  patrol_sessions: 'patrolId, status, startTime',
  notifications: 'id, type, timestamp, read'
});

db.version(2)
  .stores({
    location_logs: 'id, patrolId, userId, timestamp, syncStatus',
    sync_queue: 'id, type, status, createdAt, retryCount',
    patrol_sessions: 'patrolId, status, startTime',
    notifications: 'id, type, timestamp, read'
  })
  .upgrade(async (tx) => {
    await tx
      .table('sync_queue')
      .toCollection()
      .modify((row) => {
        if (row.retryCount === undefined) row.retryCount = 0;
        if (row.payload === undefined) row.payload = null;
      });
  });

db.version(3)
  .stores({
    location_logs: 'id, patrolId, userId, timestamp, syncStatus, source, trackingState',
    sync_queue: 'id, type, status, createdAt, retryCount',
    patrol_sessions: 'patrolId, status, startTime',
    notifications: 'id, type, timestamp, read'
  })
  .upgrade(async (tx) => {
    await tx
      .table('location_logs')
      .toCollection()
      .modify((row) => {
        if (row.source === undefined) row.source = 'sync';
        if (row.trackingState === undefined) row.trackingState = 'active';
      });
  });

db.version(4)
  .stores({
    location_logs: 'id, patrolId, userId, timestamp, syncStatus, source, trackingState',
    sync_queue: 'id, type, status, createdAt, retryCount, resultStatus',
    patrol_sessions: 'patrolId, status, startTime',
    notifications: 'id, type, timestamp, read'
  })
  .upgrade(async (tx) => {
    await tx
      .table('sync_queue')
      .toCollection()
      .modify((row) => {
        if (row.resultStatus === undefined) row.resultStatus = null;
        if (row.errorMessage === undefined) row.errorMessage = null;
        if (row.lastAttempt === undefined) row.lastAttempt = null;
      });
  });

db.version(5)
  .stores({
    location_logs: 'id, patrolId, userId, timestamp, syncStatus, source, trackingState',
    sync_queue: 'id, type, status, createdAt, retryCount, resultStatus',
    patrol_sessions: 'patrolId, status, startTime',
    notifications: 'id, type, timestamp, read'
  })
  .upgrade(async (tx) => {
    await tx
      .table('location_logs')
      .toCollection()
      .modify((row) => {
        if (row.source === 'manual') row.source = 'sync';
      });
    await tx
      .table('sync_queue')
      .toCollection()
      .modify((row) => {
        if (row.payload?.source === 'manual') {
          row.payload = { ...row.payload, source: 'sync' };
        }
      });
  });

db.version(6)
  .stores({
    location_logs: 'id, patrolId, userId, timestamp, syncStatus, source, trackingState',
    sync_queue: 'id, type, status, createdAt, retryCount, resultStatus',
    patrol_sessions: 'patrolId, status, startTime',
    notifications: 'id, type, timestamp, read',
    profile_update_queue: 'id, profileId, type, status, createdAt'
  })
  .upgrade(async () => {
    /* profile_update_queue is new in v6 */
  });
