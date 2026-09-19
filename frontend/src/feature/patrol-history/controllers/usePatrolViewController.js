import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const usePatrolViewController = (repository, patrolHistoryId) => {
  const navigate = useNavigate();
  const [patrolLog, setPatrolLog] = useState(null);
  const [checkpointLog, setCheckpointLog] = useState(null);
  const [routeLog, setRouteLog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPatrol();
  }, [patrolHistoryId]);

  const loadPatrol = async () => {
    try {
      setLoading(true);
      const patrolData = await repository.getPatrolById(patrolHistoryId);
      setPatrolLog(patrolData);

      const checkpointData = await repository.getAllCheckpointById(patrolHistoryId);
      setCheckpointLog(checkpointData);

      const routeData = await repository.getAllRouteById(patrolHistoryId);
      setRouteLog(routeData);

      // console.log('Patrol Data:', patrolData);
      // console.log('Checkpoint Data:', checkpointData);
      console.log('Route Data:', routeData);
    } catch (error) {
      console.error('Failed to load patrol:', error);
      alert('Failed to load patrol data');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/operator/patrol/history');
  };

  const handleEdit = () => {
    navigate(`/admin/patrolManagement/edit/${patrolHistoryId}`);
  };

  return {
    patrolLog,
    checkpointLog,
    routeLog,
    loading,
    handleBack,
    handleEdit
  };
};
