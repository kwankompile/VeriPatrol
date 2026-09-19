import api from 'api/api';

const buildServiceError = (error, action) => {
  const status = error?.status || (error?.message === 'Unauthorized' ? 401 : undefined);
  const details = error?.data;
  const messageFromApi = details?.message;

  let message = messageFromApi || `Failed to ${action}.`;

  if (status === 401) {
    message = 'Unauthorized. Please log in again.';
  } else if (status === 403) {
    message = 'You do not have permission to perform this action.';
  } else if (status === 422) {
    message = messageFromApi || 'Validation failed.';
  } else if (status === 409) {
    message = messageFromApi || 'Conflict while processing the request.';
  } else if (status >= 500) {
    message = messageFromApi || 'Server error. Please try again later.';
  }

  const serviceError = new Error(message);
  serviceError.status = status;
  serviceError.data = details;
  serviceError.originalError = error;

  return serviceError;
};

/**
 * Unwrap Laravel paginator inside `{ success, message, data: { data, meta, links } }`.
 */
export function unwrapPaginatedEnvelope(envelope) {
  const payload = envelope?.data ?? envelope;
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const meta = payload?.meta ?? {};
  return {
    rows,
    meta: {
      total: meta.total ?? rows.length,
      currentPage: meta.current_page ?? 1,
      lastPage: meta.last_page ?? 1,
      perPage: meta.per_page ?? rows.length
    }
  };
}

const patrolMonitoringService = {
  getPatrolSessions: async (params = {}) => {
    try {
      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.zone_id) query.set('zone_id', params.zone_id);
      if (params.user_id) query.set('user_id', params.user_id);
      if (params.sort) query.set('sort', params.sort);
      if (params.per_page) query.set('per_page', String(params.per_page));
      if (params.page) query.set('page', String(params.page));

      const qs = query.toString();
      const response = await api.get(`/patrol-sessions${qs ? `?${qs}` : ''}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch patrol sessions');
    }
  },

  getPatrolSessionById: async (id) => {
    try {
      const response = await api.get(`/patrol-sessions/${id}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch patrol session');
    }
  },

  getPatrolSummary: async (id) => {
    try {
      const response = await api.get(`/patrol-sessions/${id}/summary`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch patrol summary');
    }
  },

  validatePatrolSession: async (id) => {
    try {
      const response = await api.post(`/patrol-sessions/${id}/validate`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'validate patrol session');
    }
  },

  getPatrolRoutes: async (params = {}) => {
    try {
      const query = new URLSearchParams();
      if (params.patrol_session_id) query.set('patrol_session_id', params.patrol_session_id);
      if (params.per_page) query.set('per_page', String(params.per_page));
      if (params.page) query.set('page', String(params.page));

      const qs = query.toString();
      const response = await api.get(`/patrol-routes${qs ? `?${qs}` : ''}`, {
        signal: params.signal
      });
      return response.data;
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
        const abortError = new Error('Patrol route request was cancelled.');
        abortError.name = 'AbortError';
        throw abortError;
      }
      throw buildServiceError(error, 'fetch patrol routes');
    }
  },

  getCheckpointEvents: async (params = {}) => {
    try {
      const query = new URLSearchParams();
      if (params.patrol_session_id) query.set('patrol_session_id', params.patrol_session_id);
      if (params.status) query.set('status', params.status);
      if (params.per_page) query.set('per_page', String(params.per_page));
      if (params.page) query.set('page', String(params.page));
      if (params.sort) query.set('sort', params.sort ?? 'latest');

      const qs = query.toString();
      const response = await api.get(`/checkpoint-events${qs ? `?${qs}` : ''}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch checkpoint events');
    }
  },

  getZones: async () => {
    try {
      const response = await api.get('/zones');
      let cur = response?.data;
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
    } catch (error) {
      throw buildServiceError(error, 'fetch zones');
    }
  }
};

export default patrolMonitoringService;
