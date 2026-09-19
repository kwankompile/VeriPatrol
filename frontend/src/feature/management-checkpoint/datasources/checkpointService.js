import api from 'api/api';
import zoneService from 'feature/management-zone/datasources/zoneService';

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

const checkpointService = {
  async getCheckpoints(params = {}) {
    try {
      const response = await api.get(`/checkpoints${buildQueryString(params)}`);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'fetch checkpoints');
    }
  },

  async getCheckpointById(id) {
    try {
      const response = await api.get(`/checkpoints/${id}`);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'fetch checkpoint');
    }
  },

  async createCheckpoint(data) {
    try {
      const response = await api.post('/checkpoints', data);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'create checkpoint');
    }
  },

  async updateCheckpoint(id, data) {
    try {
      const response = await api.patch(`/checkpoints/${id}`, data);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'update checkpoint');
    }
  },

  async deleteCheckpoint(id) {
    try {
      const response = await api.delete(`/checkpoints/${id}`);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'delete checkpoint');
    }
  },

  async getZones() {
    try {
      return await zoneService.getAllZones();
    } catch (error) {
      throw buildServiceError(error, 'fetch zones');
    }
  },

  async getZoneById(id) {
    try {
      return await zoneService.getZoneById(id);
    } catch (error) {
      throw buildServiceError(error, 'fetch zone');
    }
  }
};

export default checkpointService;
