import api from 'api/api';

import { buildProfileServiceError } from '../utils/profileErrors';

const profileService = {
  getProfile: async () => {
    try {
      const response = await api.get('/profile');
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'load profile');
    }
  },

  updateProfile: async (payload) => {
    try {
      const response = await api.patch('/profile', payload);
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'update profile');
    }
  },

  uploadProfilePicture: async (formData) => {
    try {
      const response = await api.post('/profile/picture', formData);
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'upload profile picture');
    }
  },

  deleteProfilePicture: async () => {
    try {
      const response = await api.delete('/profile/picture');
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'remove profile picture');
    }
  },

  changePassword: async (payload) => {
    try {
      const response = await api.post('/profile/password/change', payload);
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'change password');
    }
  },

  startEmailChange: async (payload) => {
    try {
      const response = await api.post('/profile/email/start', payload);
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'start email change');
    }
  },

  confirmEmailChange: async (payload) => {
    try {
      const response = await api.post('/profile/email/confirm', payload);
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'confirm email change');
    }
  },

  startTwoFactorReconfigure: async (payload) => {
    try {
      const response = await api.post('/profile/2fa/reconfigure/start', payload);
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'start two-factor reconfiguration');
    }
  },

  verifyTwoFactorReconfigure: async (payload) => {
    try {
      const response = await api.post('/profile/2fa/reconfigure/verify', payload);
      return response.data;
    } catch (error) {
      throw buildProfileServiceError(error, 'verify two-factor reconfiguration');
    }
  }
};

export default profileService;
