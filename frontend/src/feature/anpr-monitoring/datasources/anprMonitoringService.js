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
 * Unwrap Laravel paginator inside `{ success, message, data: { data, ...pagination } }`.
 */
export function unwrapPaginatedEnvelope(envelope) {
  const payload = envelope?.data ?? envelope;
  const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
  const nestedMeta = payload?.meta ?? {};

  return {
    rows,
    meta: {
      total: payload?.total ?? nestedMeta.total ?? rows.length,
      currentPage: payload?.current_page ?? nestedMeta.current_page ?? 1,
      lastPage: payload?.last_page ?? nestedMeta.last_page ?? 1,
      perPage: payload?.per_page ?? nestedMeta.per_page ?? rows.length
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

const anprMonitoringService = {
  getAnprEvents: async (params = {}) => {
    try {
      const response = await api.get(`/anpr-events${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch ANPR events');
    }
  },

  getAnprEventById: async (id) => {
    try {
      const response = await api.get(`/anpr-events/${id}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch ANPR event');
    }
  },

  getAnprImages: async (params = {}) => {
    try {
      const response = await api.get(`/anpr-images${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch ANPR images');
    }
  }
};

export default anprMonitoringService;
