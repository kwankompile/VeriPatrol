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

const cameraManagementService = {
  getCameras: async (params = {}) => {
    try {
      const response = await api.get(`/cameras${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch cameras');
    }
  },

  getCameraById: async (id) => {
    try {
      const response = await api.get(`/cameras/${id}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch camera');
    }
  },

  createCamera: async (payload) => {
    try {
      const response = await api.post('/cameras', payload);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'create camera');
    }
  },

  updateCamera: async (id, payload) => {
    try {
      const response = await api.patch(`/cameras/${id}`, payload);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'update camera');
    }
  },

  deleteCamera: async (id) => {
    try {
      const response = await api.delete(`/cameras/${id}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'delete camera');
    }
  }
};

export default cameraManagementService;
