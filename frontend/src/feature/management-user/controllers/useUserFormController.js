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

export const useUserFormController = (repository, userId = null) => {
  const navigate = useNavigate();
  const isEdit = Boolean(userId);

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
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

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

  const loadUser = useCallback(async () => {
    if (!userId) return;

    try {
      setInitialLoading(true);
      setSubmitError('');
      const response = await repository.getUserById(userId);
      const user = repository.normalizeUser(response);

      if (user) {
        setFormData({
          name: user.name ?? '',
          phone: user.phone ?? '',
          email: user.email ?? '',
          address: user.address ?? '',
          role_id: user.role?.id ?? '',
          password: ''
        });
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      setSubmitError(extractBackendErrorMessage(error, 'Failed to load user data.'));
    } finally {
      setInitialLoading(false);
    }
  }, [repository, userId]);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    if (isEdit) {
      void loadUser();
    }
  }, [isEdit, loadUser]);

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

    const { errors: validationErrors, isValid } = validateUserForm(formData, { requirePassword: false });
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    try {
      setLoading(true);
      setSubmitError('');
      const payload = buildUserPayload(formData, { includePassword: true });

      if (isEdit) {
        await repository.updateUser(userId, payload);
      } else {
        await repository.createUser(payload);
      }

      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to save user:', error);
      const backendErrors = extractBackendValidationErrors(error);
      if (backendErrors) {
        setErrors(normalizeValidationErrorsForForm(backendErrors));
      }
      setSubmitError(extractBackendErrorMessage(error, 'Failed to save user.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/management-user');
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    if (isEdit) {
      navigate(`/admin/management-user/view/${userId}`);
    } else {
      navigate('/admin/management-user');
    }
  };

  return {
    formData,
    errors,
    loading,
    initialLoading,
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
