import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildZonePayload,
  extractBackendErrorMessage,
  extractBackendValidationErrors,
  normalizeValidationErrorsForForm,
  validateZoneForm
} from '../utils/zoneValidation';

export const useZoneFormController = (repository, zoneId = null) => {
  const navigate = useNavigate();
  const isEdit = Boolean(zoneId);

  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const loadZone = useCallback(async () => {
    if (!zoneId) return;

    try {
      setInitialLoading(true);
      setSubmitError('');
      const response = await repository.getZoneById(zoneId);
      const zone = repository.normalizeZone(response);

      if (zone) {
        setFormData({
          name: zone.name ?? '',
          description: zone.description ?? ''
        });
      }
    } catch (err) {
      console.error('Failed to load zone:', err);
      setSubmitError(err?.message || 'Failed to load zone data.');
    } finally {
      setInitialLoading(false);
    }
  }, [repository, zoneId]);

  useEffect(() => {
    if (isEdit) {
      loadZone();
    }
  }, [isEdit, loadZone]);

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

    const { errors: validationErrors, isValid } = validateZoneForm(formData);
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    try {
      setLoading(true);
      setSubmitError('');
      const payload = buildZonePayload(formData);

      if (isEdit) {
        await repository.updateZone(zoneId, payload);
      } else {
        await repository.createZone(payload);
      }

      setShowSuccessModal(true);
    } catch (err) {
      console.error('Failed to save zone:', err);
      const backendErrors = extractBackendValidationErrors(err);
      if (backendErrors) {
        setErrors(normalizeValidationErrorsForForm(backendErrors));
      }
      setSubmitError(extractBackendErrorMessage(err, 'Failed to save zone.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/admin/management-zone');
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    if (isEdit) {
      navigate(`/admin/management-zone/view/${zoneId}`);
    } else {
      navigate('/admin/management-zone');
    }
  };

  return {
    formData,
    errors,
    loading,
    initialLoading,
    submitError,
    showSuccessModal,
    handleChange,
    handleSubmit,
    handleCancel,
    handleModalClose
  };
};
