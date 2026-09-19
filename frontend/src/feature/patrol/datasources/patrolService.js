import api from 'api/api';

/**
 * Guard patrol HTTP adapter for Laravel `backend`.
 *
 * Canonical patrol entity for GPS + PWA sync: **`patrol_sessions`**
 * (`patrolId` in IndexedDB / `POST /pwa/sync` must equal `patrol_sessions.id`).
 *
 * Checkpoint placeholders use Laravel **`checkpoint_events`** (`pending` → later **`verified`** on reach).
 *
 * GPS evidence: Dexie **`location_logs`** → **`POST /pwa/sync`** (canonical movement).
 * Deprecated: **`POST /patrol-routes`** dual-write breadcrumbs — do not call from the SPA.
 */

/** Map frontend patrol lifecycle helpers → Laravel `patrol_sessions.status`. */
function mapStatusToPatrolSession(status) {
  if (!status) return undefined;
  if (status === 'in_progress') return 'active';
  if (status === 'cancelled') return 'aborted';
  return status;
}

/** Laravel returns nested `user` — expose `guard_id` and legacy UI timestamp aliases. */
function normalizePatrolSessionRecord(session) {
  if (!session || typeof session !== 'object') return session;
  const userId = session.user?.id ?? session.user_id ?? null;
  const startedAt = session.started_at ?? session.time_start ?? null;
  const endedAt = session.ended_at ?? session.time_end ?? null;
  return {
    ...session,
    guard_id: userId,
    started_at: startedAt,
    time_start: startedAt,
    ended_at: endedAt,
    time_end: endedAt
  };
}

function normalizePatrolApiEnvelope(envelope) {
  if (!envelope?.data || typeof envelope.data !== 'object') return envelope;
  return {
    ...envelope,
    data: normalizePatrolSessionRecord(envelope.data)
  };
}

/** Builds Laravel `StorePatrolSessionRequest` body from guard UI payload. */
function mapPatrolStorePayload(frontend) {
  const userId = frontend.guard_id ?? frontend.user_id;
  const startedAt = frontend.time_start ?? frontend.started_at;
  const mappedStatus = mapStatusToPatrolSession(frontend.status);

  const body = {
    user_id: userId,
    zone_id: frontend.zone_id,
    started_at: startedAt,
    ended_at: mappedStatus === 'completed' ? (frontend.time_end ?? frontend.ended_at ?? null) : null,
    status: mappedStatus ?? 'active'
  };

  if (frontend.blockchain_record_id != null) {
    body.blockchain_record_id = frontend.blockchain_record_id;
  }

  return body;
}

/** Builds Laravel `UpdatePatrolSessionRequest` body (`completion_percentage` has no server column — omitted). */
function mapPatrolUpdatePayload(frontend) {
  const body = {};
  if (frontend.time_end != null) body.ended_at = frontend.time_end;
  if (frontend.status != null) body.status = mapStatusToPatrolSession(frontend.status);
  return body;
}

/**
 * Checkpoint UI expects pseudo–checkpoint-log rows (`is_within_geofence`, `patrol_log_id`).
 * Laravel returns checkpoint **`events`** (no lat/lng on row — GPS stays client-side until backend extended).
 */
function normalizeCheckpointEventAsCheckpointLog(event) {
  if (!event || typeof event !== 'object') return event;
  const verified = event.status === 'verified';
  return {
    ...event,
    patrol_log_id: event.patrol_session_id,
    is_within_geofence: verified,
    actual_time: verified ? (event.detected_at ?? event.entered_at ?? null) : null
  };
}

function normalizeCheckpointEnvelope(envelope) {
  if (!envelope?.success || !envelope?.data) return envelope;
  return {
    ...envelope,
    data: normalizeCheckpointEventAsCheckpointLog(envelope.data)
  };
}

/**
 * Normalize `/zones` JSON into a zone array.
 * Handles: `[]`, `{ data: [] }`, Laravel pagination `{ data: { data: [], links, meta } }`,
 * and envelopes `{ success, message, data: … }` by unwrapping `.data` until an array is found.
 */
function normalizeZonesResponse(body) {
  let cur = body;
  for (let depth = 0; depth < 10; depth++) {
    if (cur == null) return [];
    if (Array.isArray(cur)) return cur;
    if (typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, 'data')) {
      cur = cur.data;
      continue;
    }
    return [];
  }
  return [];
}

/**
 * Unwrap Laravel checkpoint list payloads into a plain array.
 * Supports: raw array, `{ data: [...] }`, paginator `{ data: { data: [...], links, meta } }`,
 * and triple-nested `{ data: { data: { data: [...] } } }`.
 */
function extractCheckpointsArray(payload) {
  if (payload == null) {
    console.warn('[patrolService] getAllCheckpointsByZoneId: empty response body; using [].');
    return [];
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data?.data?.data)) return payload.data.data.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data)) return payload.data;
  console.warn('[patrolService] Unexpected checkpoints response shape; using [].', payload);
  return [];
}

const patrolService = {
  getAllZones: async () => {
    try {
      const response = await api.get('/zones');
      return normalizeZonesResponse(response?.data);
    } catch (error) {
      throw error;
    }
  },

  createPatrol: async (patrolData) => {
    try {
      const response = await api.post('/patrol-sessions', mapPatrolStorePayload(patrolData));
      return normalizePatrolApiEnvelope(response.data);
    } catch (error) {
      throw error;
    }
  },

  updatePatrol: async (id, patrolData) => {
    try {
      const response = await api.put(`/patrol-sessions/${id}`, mapPatrolUpdatePayload(patrolData));
      return normalizePatrolApiEnvelope(response.data);
    } catch (error) {
      throw error;
    }
  },

  /**
   * Fetch the authenticated user's active patrol session (backend source of truth) so the
   * Patrol page can restore the in-progress UI after a reload/navigation. Returns `null`
   * when there is no active session.
   *
   * @returns {Promise<{ session: object, checkpointLogs: object[] } | null>}
   */
  getActivePatrolSession: async () => {
    const response = await api.get('/patrol-sessions/active');
    const data = response?.data?.data;
    if (!data) return null;

    const events = Array.isArray(data.checkpoint_events) ? data.checkpoint_events : [];

    return {
      session: {
        ...normalizePatrolSessionRecord(data),
        zone_id: data.zone_id ?? data.zone?.id ?? null
      },
      checkpointLogs: events.map(normalizeCheckpointEventAsCheckpointLog)
    };
  },

  getAllCheckpointsByZoneId: async (id) => {
    try {
      const response = await api.get(`/checkpoints?zone_id=${id}`);
      return extractCheckpointsArray(response?.data);
    } catch (error) {
      throw error;
    }
  },

  createCheckpointLog: async (data) => {
    try {
      const patrolSessionId = data.patrol_session_id ?? data.patrol_log_id;
      const response = await api.post('/checkpoint-events', {
        patrol_session_id: patrolSessionId,
        checkpoint_id: data.checkpoint_id,
        status: 'pending'
      });
      return normalizeCheckpointEnvelope(response.data);
    } catch (error) {
      throw error;
    }
  },

  updateCheckpointLog: async (logId, data) => {
    try {
      const body = {};
      if (data.status != null) body.status = data.status;
      if (data.detected_at != null) body.detected_at = data.detected_at;
      if (data.detection_type != null) body.detection_type = data.detection_type;
      if (data.confidence_score != null) body.confidence_score = data.confidence_score;
      if (data.is_within_geofence === true) {
        body.status = body.status ?? 'verified';
        body.detected_at = body.detected_at ?? data.actual_time ?? new Date().toISOString();
        if (body.detection_type == null) {
          body.detection_type = 'continuous';
          body.confidence_score = body.confidence_score ?? 80;
        } else if (body.confidence_score == null && body.detection_type === 'resume') {
          body.confidence_score = 65;
        } else if (body.confidence_score == null) {
          body.confidence_score = 80;
        }
      }
      const response = await api.patch(`/checkpoint-events/${logId}`, body);
      return normalizeCheckpointEnvelope(response.data);
    } catch (error) {
      throw error;
    }
  },

  /**
   * @deprecated Prefer location_logs via POST /pwa/sync. Retained for legacy clients only.
   */
  createPatrolRoute: async (data) => {
    try {
      const response = await api.post('/patrol-routes', data);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getPatrolSummary: async (patrolSessionId) => {
    try {
      const response = await api.get(`/patrol-sessions/${patrolSessionId}/summary`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Backend validation engine (Milestone 1) — authoritative checkpoint scoring.
   * Call after PWA sync flush while online.
   */
  validatePatrolSession: async (patrolSessionId) => {
    try {
      const response = await api.post(`/patrol-sessions/${patrolSessionId}/validate`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default patrolService;
