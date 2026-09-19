import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { extractBackendErrorMessage } from '../utils/userValidation';

export const useUserViewController = (repository, userId) => {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadUser = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await repository.getUserById(userId);
      setUser(repository.normalizeUser(response));
    } catch (err) {
      console.error('Failed to load user:', err);
      setError(extractBackendErrorMessage(err, 'Failed to load user data.'));
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [repository, userId]);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const handleBack = () => {
    navigate('/admin/management-user');
  };

  const handleEdit = () => {
    navigate(`/admin/management-user/edit/${userId}`);
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      await repository.deleteUser(userId);
      navigate('/admin/management-user');
    } catch (err) {
      console.error('Failed to delete user:', err);
      alert(extractBackendErrorMessage(err, 'Failed to delete user.'));
    }
  };

  return {
    user,
    loading,
    error,
    handleBack,
    handleEdit,
    handleDelete
  };
};
