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
  } else if (status === 404) {
    message = messageFromApi || 'Blockchain record not found.';
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
 * Unwrap Laravel paginator envelopes:
 * - `{ data: [...], meta: {...} }` (resource collection)
 * - `{ success, data: { data, ...pagination } }` (custom envelope)
 */
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

const blockchainMonitoringService = {
  getBlockchainRecords: async (params = {}) => {
    try {
      const response = await api.get(`/blockchain-records${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch blockchain records');
    }
  },

  getBlockchainRecordById: async (id) => {
    try {
      const response = await api.get(`/blockchain-records/${id}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch blockchain record');
    }
  },

  getBlockchainSummary: async (params = {}) => {
    try {
      const response = await api.get(`/blockchain-records/summary${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch blockchain summary');
    }
  },

  verifyBlockchainRecord: async (id) => {
    try {
      const response = await api.post(`/blockchain-records/${id}/verify`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'verify blockchain record');
    }
  },

  retryBlockchainRecord: async (id) => {
    try {
      const response = await api.post(`/blockchain-records/${id}/retry`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'retry blockchain record');
    }
  },

  refreshSubmittedBlockchainRecord: async (id) => {
    try {
      const response = await api.post(`/blockchain-records/${id}/refresh`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'refresh blockchain record confirmation');
    }
  },

  verifyAllBlockchainRecords: async (params = {}) => {
    try {
      const response = await api.post(`/blockchain-records/verify-all${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'verify all blockchain records');
    }
  }
};

export default blockchainMonitoringService;
