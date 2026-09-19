import api from 'api/api';

const buildServiceError = (error, action) => {
  const status = error?.status;
  const details = error?.data;
  const messageFromApi = details?.message;

  let message = messageFromApi || `Failed to ${action}.`;

  if (status === 401) {
    message = 'Unauthorized. Please log in again.';
  } else if (status === 403) {
    message = 'Forbidden. Admin access is required.';
  }

  const serviceError = new Error(message);
  serviceError.status = status;
  serviceError.data = details;
  serviceError.originalError = error;

  return serviceError;
};

const extractResponsePayload = (response) => response?.data;

const userService = {
  // Get all users
  getAllUsers: async () => {
    try {
      const response = await api.get('/users');
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'fetch users');
    }
  },

  // Get single user
  getUserById: async (id) => {
    try {
      const response = await api.get(`/users/${id}`);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'fetch user');
    }
  },

  // Get all roles
  getRoles: async () => {
    try {
      const response = await api.get('/roles');
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'fetch roles');
    }
  },

  // Create user
  createUser: async (userData) => {
    try {
      const response = await api.post('/users', userData);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'create user');
    }
  },

  // Update user
  updateUser: async (id, userData) => {
    try {
      const response = await api.patch(`/users/${id}`, userData);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'update user');
    }
  },

  // Delete user
  deleteUser: async (id) => {
    try {
      const response = await api.delete(`/users/${id}`);
      return extractResponsePayload(response);
    } catch (error) {
      throw buildServiceError(error, 'delete user');
    }
  }
};

export default userService;
