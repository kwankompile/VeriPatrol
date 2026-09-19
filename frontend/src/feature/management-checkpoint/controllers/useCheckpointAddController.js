import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
export const useCheckpointAddController = (repository, zoneId) => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    zone_id: zoneId,
    name: '',
    description: '',
    latitude: '',
    longitude: ''
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [previewUrl] = useState(null);
  const [newCheckpointId, setNewCheckpointId] = useState(null);

  const extractBackendValidationErrors = (error) => {
    return error?.validationErrors || error?.data?.data?.errors || error?.data?.errors || null;
  };

  const extractBackendErrorMessage = (error) => {
    const validationErrors = extractBackendValidationErrors(error);
    if (validationErrors && typeof validationErrors === 'object') {
      const firstFieldErrors = Object.values(validationErrors).find((messages) => Array.isArray(messages) && messages.length > 0);
      if (Array.isArray(firstFieldErrors)) {
        return firstFieldErrors[0];
      }
    }

    return error?.data?.message || error?.message || 'Failed to create checkpoint.';
  };

  const normalizeValidationErrorsForForm = (validationErrors) => {
    if (!validationErrors || typeof validationErrors !== 'object') return {};

    return Object.entries(validationErrors).reduce((acc, [field, messages]) => {
      acc[field] = Array.isArray(messages) ? messages[0] : messages;
      return acc;
    }, {});
  };

  /* ----------------------------------
   * Effects
   * ---------------------------------- */

  useEffect(() => {
    let timer;
    if (showSuccessModal) {
      timer = setTimeout(handleModalClose, 2000);
    }
    return () => timer && clearTimeout(timer);
  }, [showSuccessModal]);

  useEffect(() => {
    if (zoneId != null) {
      setFormData((prev) => ({ ...prev, zone_id: zoneId }));
    }
  }, [zoneId]);

  /* ----------------------------------
   * Handlers
   * ---------------------------------- */

  const handleChange = (field) => (event) => {
    const value = event?.target?.value ?? event;

    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  /* ----------------------------------
   * Validation
   * ---------------------------------- */

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    if (!formData.latitude.trim()) newErrors.latitude = 'Latitude is required';
    if (!formData.longitude.trim()) newErrors.longitude = 'Longitude is required';

    // const start = formData.time_window_start;
    // const end = formData.time_window_end;

    // if (start || end) {
    //    if (!start) newErrors.time_window_start = 'Start time is required';
    //    if (!end) newErrors.time_window_end = 'End time is required';

    //    if (start && end) {
    //       const startTime = dayjs(start, 'HH:mm');
    //       const endTime = dayjs(end, 'HH:mm');

    //       if (!endTime.isAfter(startTime)) {
    //          newErrors.time_window_end = 'End time must be after start time';
    //       }
    //    }
    // }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /* ----------------------------------
   * API Payload
   * ---------------------------------- */

  const prepareFormDataForAPI = () => {
    const data = {
      ...formData,
      zone_id: zoneId || formData.zone_id,
      latitude: Number.parseFloat(formData.latitude),
      longitude: Number.parseFloat(formData.longitude),
      radius: 20,
      location_type: 'outdoor',
      is_active: true
    };

    return data;
  };

  /* ----------------------------------
   * Submit
   * ---------------------------------- */

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    try {
      setLoading(true);
      const payload = prepareFormDataForAPI();
      const res = await repository.createCheckpoint(payload);
      setNewCheckpointId(res.data.id);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      const backendValidationErrors = extractBackendValidationErrors(error);
      if (backendValidationErrors) {
        const normalizedErrors = normalizeValidationErrorsForForm(backendValidationErrors);
        setErrors((prev) => ({ ...prev, ...normalizedErrors }));
      }
      alert(extractBackendErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------------------
   * Navigation
   * ---------------------------------- */

  const handleCancel = () => {
    navigate(`/admin/management-zone/view/${zoneId}`);
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    navigate(newCheckpointId ? `/admin/management-checkpoint/view/${newCheckpointId}` : '/admin/management-checkpoint');
  };

  /* ----------------------------------
   * Public API
   * ---------------------------------- */

  return {
    formData,
    errors,
    loading,
    showSuccessModal,
    previewUrl,
    fileInputRef,
    handleChange,
    handleSubmit,
    handleCancel,
    handleModalClose
  };
};
