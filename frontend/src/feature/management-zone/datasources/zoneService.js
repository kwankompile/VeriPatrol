import api from 'api/api';

const extractValidationErrors = (details) => details?.data?.errors || details?.errors || null;

const extractFirstValidationMessage = (validationErrors) => {
  if (!validationErrors || typeof validationErrors !== 'object') return null;
  const firstFieldErrors = Object.values(validationErrors).find((messages) => Array.isArray(messages) && messages.length > 0);
  return Array.isArray(firstFieldErrors) ? firstFieldErrors[0] : null;
};

const buildServiceError = (error, action) => {
  const status = error?.status || (error?.message === 'Unauthorized' ? 401 : undefined);
  const details = error?.data;
  const validationErrors = extractValidationErrors(details);
  const firstValidationMessage = extractFirstValidationMessage(validationErrors);
  const messageFromApi = firstValidationMessage || details?.message;

  let message = messageFromApi || `Failed to ${action}.`;

  if (status === 401) {
    message = 'Unauthorized. Please log in again.';
  } else if (status === 403) {
    message = 'Forbidden. Admin access is required.';
  }

  const serviceError = new Error(message);
  serviceError.status = status;
  serviceError.data = details;
  serviceError.validationErrors = validationErrors;
  serviceError.originalError = error;

  return serviceError;
};

const extractResponsePayload = (response) => response?.data;

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
};

const zoneService = {
  getAllZones: async (params = {}) => {
    try {
      const response = await api.get(`/zones${buildQueryString(params)}`);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'fetch zones');
    }
  },

  getZoneById: async (id) => {
    try {
      const response = await api.get(`/zones/${id}`);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'fetch zone');
    }
  },

  createZone: async (zoneData) => {
    try {
      const response = await api.post('/zones', zoneData);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'create zone');
    }
  },

  updateZone: async (id, zoneData) => {
    try {
      const response = await api.patch(`/zones/${id}`, zoneData);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'update zone');
    }
  },

  deleteZone: async (id) => {
    try {
      const response = await api.delete(`/zones/${id}`);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'delete zone');
    }
  }
};

export default zoneService;
