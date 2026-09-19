import api from 'api/api';

export async function getDashboardSummary() {
  const response = await api.get('/dashboard/summary');
  return response.data;
}

export default {
  getDashboardSummary
};
