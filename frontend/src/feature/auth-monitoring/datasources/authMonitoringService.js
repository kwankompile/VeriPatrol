import api from 'api/api';

const buildServiceError = (error, action) => {
  const status = error?.status;
  const details = error?.data;
  const messageFromApi = details?.message;

  let message = messageFromApi || `Failed to ${action}.`;

  if (status === 401) {
    message = 'Unauthorized. Please log in again.';
  } else if (status === 403) {
    message = 'You do not have permission to perform this action.';
  } else if (status >= 500) {
    message = messageFromApi || 'Server error. Please try again later.';
  }

  const serviceError = new Error(message);
  serviceError.status = status;
  serviceError.data = details;
  serviceError.originalError = error;

  return serviceError;
};

export function unwrapPaginatedEnvelope(envelope) {
  const topMeta = envelope?.meta ?? {};

  if (envelope?.data && !Array.isArray(envelope.data) && Array.isArray(envelope.data.data)) {
    const payload = envelope.data;
    return {
      rows: payload.data,
      meta: {
        total: payload.total ?? topMeta.total ?? payload.data.length,
        currentPage: payload.current_page ?? topMeta.current_page ?? 1,
        lastPage: payload.last_page ?? topMeta.last_page ?? 1,
        perPage: payload.per_page ?? topMeta.per_page ?? payload.data.length
      }
    };
  }

  if (Array.isArray(envelope?.data)) {
    return {
      rows: envelope.data,
      meta: {
        total: topMeta.total ?? envelope.data.length,
        currentPage: topMeta.current_page ?? 1,
        lastPage: topMeta.last_page ?? 1,
        perPage: topMeta.per_page ?? envelope.data.length
      }
    };
  }

  const rows = Array.isArray(envelope) ? envelope : [];
  return {
    rows,
    meta: {
      total: rows.length,
      currentPage: 1,
      lastPage: 1,
      perPage: rows.length
    }
  };
}

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
};

const authMonitoringService = {
  getAuditLogs: async (params = {}) => {
    try {
      const response = await api.get(`/auth/audit-logs${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch auth audit logs');
    }
  },

  getSessions: async (params = {}) => {
    try {
      const response = await api.get(`/auth/sessions${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch auth sessions');
    }
  },

  revokeSession: async (sessionId) => {
    try {
      const response = await api.delete(`/auth/sessions/${sessionId}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'revoke auth session');
    }
  },

  logoutAllSessions: async () => {
    try {
      const response = await api.post('/auth/logout-all');
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'revoke all auth sessions');
    }
  }
};

export default authMonitoringService;
