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

const vehicleManagementService = {
  getVehicles: async (params = {}) => {
    try {
      const response = await api.get(`/vehicles${buildQueryString(params)}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch vehicles');
    }
  },

  getVehicleById: async (id) => {
    try {
      const response = await api.get(`/vehicles/${id}`);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'fetch vehicle');
    }
  },

  updateVehicle: async (id, payload) => {
    try {
      const response = await api.patch(`/vehicles/${id}`, payload);
      return response.data;
    } catch (error) {
      throw buildServiceError(error, 'update vehicle');
    }
  }
};

export default vehicleManagementService;
