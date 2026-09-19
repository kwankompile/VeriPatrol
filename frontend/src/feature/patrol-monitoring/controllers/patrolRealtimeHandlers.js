import { emitPatrolRealtimeNotification } from 'services/realtime/patrolRealtimeNotifier';
import { normalizeRoutePoint } from '../utils/patrolRoutePointUtils';

function upsertById(list, item) {
  if (!item?.id) {
    return [item, ...list];
  }
  const index = list.findIndex((row) => row.id === item.id);
  if (index === -1) {
    return [item, ...list];
  }
  const next = [...list];
  next[index] = { ...next[index], ...item };
  return next;
}

/**
 * Map checkpoint review broadcast statuses to dashboard stat increments and copy.
 */
export function resolveCheckpointRealtimeUpdate(status) {
  const normalized = String(status ?? '').toLowerCase();

  if (normalized === 'suspicious') {
    return {
      increment: { suspiciousEvents: 1 },
      severity: 'warning',
      message: 'Suspicious checkpoint detected.'
    };
  }

  if (normalized === 'needs_review' || normalized === 'uncertain') {
    return {
      increment: { needsReviewEvents: 1 },
      severity: 'info',
      message: 'Checkpoint needs review.'
    };
  }

  if (normalized === 'partial') {
    return {
      increment: {},
      severity: 'info',
      message: 'Partial checkpoint evidence recorded.'
    };
  }

  return null;
}

function checkpointStatusFromPayload(payload) {
  return payload?.status ?? payload?.event?.status ?? null;
}

function isFullValidationResult(validation) {
  return Boolean(
    validation &&
    (Array.isArray(validation.checkpoint_results) ||
      Array.isArray(validation?.anomalies?.items))
  );
}

export function handleMonitoringRealtimeEvent(
  { name, payload },
  { setSessions, setStats, setSummariesBySessionId, loadStats, loadSessions }
) {
  switch (name) {
    case 'PatrolSessionStarted': {
      const session = payload?.session;
      setStats((prev) => ({
        ...prev,
        total: prev.total + 1,
        active: prev.active + 1
      }));
      emitPatrolRealtimeNotification({
        severity: 'info',
        message: `Patrol started${session?.user?.name ? ` — ${session.user.name}` : ''}.`
      });
      void loadStats();
      void loadSessions();
      break;
    }
    case 'PatrolSessionCompleted': {
      const session = payload?.session;
      const status = payload?.status ?? session?.status;
      setStats((prev) => ({
        ...prev,
        active: Math.max(0, prev.active - 1),
        completed: status === 'completed' ? prev.completed + 1 : prev.completed,
        aborted: status === 'aborted' ? prev.aborted + 1 : prev.aborted
      }));
      emitPatrolRealtimeNotification({
        severity: status === 'aborted' ? 'warning' : 'success',
        message: status === 'aborted' ? 'Patrol aborted.' : 'Patrol completed.'
      });
      void loadStats();
      void loadSessions();
      break;
    }
    case 'PatrolCheckpointSuspicious': {
      const update = resolveCheckpointRealtimeUpdate(checkpointStatusFromPayload(payload));
      if (update) {
        setStats((prev) => ({ ...prev, ...Object.fromEntries(
          Object.entries(update.increment).map(([key, delta]) => [key, (prev[key] ?? 0) + delta])
        ) }));
        emitPatrolRealtimeNotification({
          severity: update.severity,
          message: update.message
        });
      }
      void loadSessions();
      break;
    }
    case 'PatrolCheckpointVerified': {
      emitPatrolRealtimeNotification({
        severity: 'success',
        message: 'Checkpoint verified.'
      });
      break;
    }
    case 'PatrolValidationCompleted': {
      emitPatrolRealtimeNotification({
        severity: 'info',
        message: 'Patrol validation completed.'
      });
      void loadStats();
      void loadSessions();
      break;
    }
    default:
      break;
  }
}

export function handleSessionRealtimeEvent(
  { name, payload },
  patrolSessionId,
  {
    setSession,
    setPatrolRoutes,
    setCheckpointEvents,
    setValidationResult,
    setSummary,
    loadSummary,
    loadCheckpointEvents,
    loadSession,
    queueRoutePoint
  }
) {
  if (payload?.patrol_session_id && payload.patrol_session_id !== patrolSessionId) {
    return;
  }

  switch (name) {
    case 'PatrolRouteUpdated': {
      // Payload originates from location_logs; event name kept for compatibility.
      const point = normalizeRoutePoint({
        id: payload?.id ?? payload?.location_log_id,
        location_log_id: payload?.location_log_id ?? payload?.id,
        patrol_session_id: payload?.patrol_session_id,
        latitude: payload?.latitude,
        longitude: payload?.longitude,
        accuracy: payload?.accuracy ?? null,
        recorded_at: payload?.recorded_at
      });
      if (point) {
        queueRoutePoint(point);
      }
      break;
    }
    case 'PatrolCheckpointVerified':
    case 'PatrolCheckpointSuspicious': {
      const event = payload?.event;
      if (event?.id) {
        setCheckpointEvents((prev) => upsertById(prev, event));
      } else {
        void loadCheckpointEvents();
      }
      if (name === 'PatrolCheckpointSuspicious') {
        const update = resolveCheckpointRealtimeUpdate(checkpointStatusFromPayload(payload));
        if (update) {
          emitPatrolRealtimeNotification({
            severity: update.severity,
            message: update.message
          });
        }
      }
      break;
    }
    case 'PatrolSessionCompleted': {
      const session = payload?.session;
      if (session) {
        setSession(session);
      }
      emitPatrolRealtimeNotification({
        severity: payload?.status === 'aborted' ? 'warning' : 'success',
        message: payload?.status === 'aborted' ? 'Patrol aborted.' : 'Patrol completed.'
      });
      break;
    }
    case 'PatrolValidationCompleted': {
      if (payload?.validation && isFullValidationResult(payload.validation)) {
        setValidationResult(payload.validation);
      }
      emitPatrolRealtimeNotification({
        severity: 'info',
        message: 'Validation completed for this patrol session.'
      });
      void loadSummary();
      void loadCheckpointEvents();
      if (typeof loadSession === 'function') {
        void loadSession();
      }
      break;
    }
    default:
      break;
  }
}
