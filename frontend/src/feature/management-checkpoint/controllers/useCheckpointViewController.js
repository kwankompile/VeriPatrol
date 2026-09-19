import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const useCheckpointViewController = (repository, checkpointId) => {
  const navigate = useNavigate();
  const [checkpoint, setCheckpoint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadCheckpoint();
  }, [checkpointId]);

  const loadCheckpoint = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await repository.getCheckpointById(checkpointId);
      setCheckpoint(response?.data ?? response);
    } catch (err) {
      console.error('Failed to load checkpoint:', err);
      setCheckpoint(null);
      if (err?.status === 404) {
        setError('Checkpoint not found.');
      } else {
        setError(err?.message || 'Failed to load checkpoint.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    const zoneId = checkpoint?.zone_id ?? checkpoint?.zone?.id;
    if (zoneId) {
      navigate(`/admin/management-zone/view/${zoneId}`);
      return;
    }
    navigate('/admin/management-checkpoint');
  };

  const handleEdit = () => {
    navigate(`/admin/management-checkpoint/${checkpointId}/edit`);
  };

  return {
    checkpoint,
    loading,
    error,
    handleBack,
    handleEdit
  };
};
