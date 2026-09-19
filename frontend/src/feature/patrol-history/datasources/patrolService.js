import api from 'api/api';
import { DEFAULT_ROUTE_PAGE_SIZE, fetchAllPatrolRoutePages } from 'feature/patrol-monitoring/utils/fetchAllPatrolRoutePages';

const patrolService = {
  // Get all patrols
  getAllPatrols: async () => {
    try {
      const response = await api.get('/patrol-logs');
      return response.data.data;
    } catch (error) {
      throw error;
    }
  },

  // Get single patrol
  getPatrolById: async (id) => {
    try {
      const response = await api.get(`/patrol-logs/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create patrol
  createPatrol: async (patrolData) => {
    try {
      const response = await api.post('/patrol-logs', patrolData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update patrol
  updatePatrol: async (id, patrolData) => {
    try {
      const response = await api.put(`/patrol-logs/${id}`, patrolData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete patrol
  deletePatrol: async (id) => {
    try {
      const response = await api.delete(`/patrol-logs/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getAllCheckpointById: async (id) => {
    try {
      const response = await api.get(`/patrol-checkpoint-logs/by-patrol/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Complete route for a patrol session (all pages).
   * Uses canonical `patrol_session_id` (legacy `patrol_log_id` is not used for pagination).
   */
  getAllRouteById: async (id, options = {}) => {
    try {
      return await fetchAllPatrolRoutePages(
        async (page, perPage) => {
          const query = new URLSearchParams({
            patrol_session_id: id,
            per_page: String(perPage),
            page: String(page)
          });
          const response = await api.get(`/patrol-routes?${query.toString()}`, {
            signal: options.signal
          });
          return response.data;
        },
        {
          perPage: options.perPage ?? DEFAULT_ROUTE_PAGE_SIZE,
          signal: options.signal
        }
      );
    } catch (error) {
      throw error;
    }
  }
};

export default patrolService;
