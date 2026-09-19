import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildUserPayload,
  extractBackendErrorMessage,
  extractBackendValidationErrors,
  mapRolesToOptions,
  normalizeValidationErrorsForForm,
  validateUserForm
} from '../utils/userValidation';

export const useUserAddController = (repository) => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    role_id: '',
    password: ''
  });

  const [roleOptions, setRoleOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [newUserId, setNewUserId] = useState(null);

  const loadRoles = useCallback(async () => {
    try {
      setRolesLoading(true);
      const response = await repository.getRoles();
      setRoleOptions(mapRolesToOptions(repository.normalizeRolesList(response)));
    } catch (error) {
      console.error('Failed to load roles:', error);
      setSubmitError('Failed to load roles. Please refresh and try again.');
    } finally {
      setRolesLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    let timer;
    if (showSuccessModal) {
      timer = setTimeout(() => {
        handleModalClose();
      }, 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [showSuccessModal]);

  const handleChange = (field) => (event) => {
    setFormData((prev) => ({
      ...prev,
      [field]: event.target.value
    }));

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    setSubmitError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const { errors: validationErrors, isValid } = validateUserForm(formData, { requirePassword: true });
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    try {
      setLoading(true);
      setSubmitError('');
      const payload = buildUserPayload(formData, { includePassword: true });
      const response = await repository.createUser(payload);
      const createdUser = repository.normalizeUser(response);
      setNewUserId(createdUser?.id ?? null);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to create user:', error);
      const backendErrors = extractBackendValidationErrors(error);
      if (backendErrors) {
        setErrors(normalizeValidationErrorsForForm(backendErrors));
      }
      setSubmitError(extractBackendErrorMessage(error, 'Failed to create user.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/management-user');
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    if (newUserId) {
      navigate(`/admin/management-user/view/${newUserId}`);
    } else {
      navigate('/admin/management-user');
    }
  };

  return {
    formData,
    errors,
    loading,
    rolesLoading,
    roleOptions,
    submitError,
    showSuccessModal,
    handleChange,
    handleSubmit,
    handleCancel,
    handleModalClose
  };
};
