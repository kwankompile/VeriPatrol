import api from 'api/api';

const cameraService = {
  // Get all cameras
  getAllCameras: async () => {
    try {
      const response = await api.get('/cameras');
      return response.data.data;
    } catch (error) {
      throw error;
    }
  },

  // Get single camera
  getCameraById: async (id) => {
    try {
      const response = await api.get(`/cameras/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create camera
  createCamera: async (cameraData) => {
    try {
      const response = await api.post('/cameras', cameraData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update camera
  updateCamera: async (id, cameraData) => {
    try {
      const response = await api.put(`/cameras/${id}`, cameraData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete camera
  deleteCamera: async (id) => {
    try {
      const response = await api.delete(`/cameras/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default cameraService;
