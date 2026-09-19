import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { DEFAULT_MAP_CENTER, RECOMMENDED_RADIUS, normalizeLocationType } from '../utils/checkpointConstants';
import { normalizeCoordinate } from '../utils/coordinateUtils';
import {
  buildCheckpointPayload,
  extractBackendErrorMessage,
  extractBackendValidationErrors,
  normalizeValidationErrorsForForm,
  validateCheckpointForm
} from '../utils/checkpointValidation';

const defaultFormData = (zoneId = '') => ({
  zone_id: zoneId,
  name: '',
  latitude: '',
  longitude: '',
  radius: RECOMMENDED_RADIUS.outdoor,
  location_type: 'outdoor',
  is_active: true
});

const resolveZoneId = (...candidates) => {
  for (const value of candidates) {
    if (value) return value;
  }
  return '';
};

export const useCheckpointFormController = (repository, checkpointId = null) => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeZoneId = location.state?.zoneId ?? '';

  const isEdit = Boolean(checkpointId);
  const [formData, setFormData] = useState(() => defaultFormData(routeZoneId));
  const [zoneContext, setZoneContext] = useState(null);
  const [zoneLoading, setZoneLoading] = useState(Boolean(routeZoneId));
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedCheckpointId, setSavedCheckpointId] = useState(null);

  const activeZoneId = resolveZoneId(formData.zone_id, zoneContext?.id, routeZoneId);
  const missingZoneContext = !zoneLoading && !initialLoading && !activeZoneId;
  const zoneName = zoneContext?.name ?? '';

  const navigateToZoneDetails = useCallback(
    (zoneId) => {
      const targetZoneId = resolveZoneId(zoneId, activeZoneId, routeZoneId);
      if (targetZoneId) {
        navigate(`/admin/management-zone/view/${targetZoneId}`);
        return;
      }
      navigate('/admin/management-checkpoint');
    },
    [navigate, activeZoneId, routeZoneId]
  );

  const loadZoneContext = useCallback(
    async (zoneId) => {
      if (!zoneId) {
        setZoneContext(null);
        setZoneLoading(false);
        return;
      }

      try {
        setZoneLoading(true);
        const response = await repository.getZoneById(zoneId);
        const zone = response?.data ?? response;
        setZoneContext(zone ?? null);
      } catch (err) {
        console.error('Failed to load zone:', err);
        setZoneContext(null);
        setSubmitError(err?.message || 'Failed to load zone context.');
      } finally {
        setZoneLoading(false);
      }
    },
    [repository]
  );

  const loadCheckpoint = useCallback(async () => {
    if (!checkpointId) return;
    try {
      setInitialLoading(true);
      const response = await repository.getCheckpointById(checkpointId);
      const cp = response?.data ?? response;
      if (!cp) return;

      const zoneId = resolveZoneId(cp.zone_id, cp.zone?.id, routeZoneId);

      setFormData({
        zone_id: zoneId,
        name: cp.name ?? '',
        latitude: normalizeCoordinate(cp.latitude, 'latitude'),
        longitude: normalizeCoordinate(cp.longitude, 'longitude'),
        radius: cp.radius ?? RECOMMENDED_RADIUS.outdoor,
        location_type: normalizeLocationType(cp.location_type),
        is_active: cp.is_active !== false
      });

      if (zoneId) {
        await loadZoneContext(zoneId);
      } else {
        setZoneLoading(false);
      }
    } catch (err) {
      console.error('Failed to load checkpoint:', err);
      setSubmitError(err?.message || 'Failed to load checkpoint.');
      setZoneLoading(false);
    } finally {
      setInitialLoading(false);
    }
  }, [repository, checkpointId, routeZoneId, loadZoneContext]);

  useEffect(() => {
    if (isEdit) {
      loadCheckpoint();
      return;
    }

    if (routeZoneId) {
      setFormData((prev) => ({ ...prev, zone_id: routeZoneId }));
      loadZoneContext(routeZoneId);
    } else {
      setZoneLoading(false);
    }
  }, [isEdit, loadCheckpoint, routeZoneId, loadZoneContext]);

  useEffect(() => {
    let timer;
    if (showSuccessModal) {
      timer = setTimeout(() => handleModalClose(), 2000);
    }
    return () => timer && clearTimeout(timer);
  }, [showSuccessModal]);

  const handleChange = (field) => (eventOrValue) => {
    let value = eventOrValue?.target !== undefined ? eventOrValue.target.value : eventOrValue;

    if (field === 'is_active' && eventOrValue?.target) {
      value = eventOrValue.target.checked;
    }

    if (field === 'latitude') {
      value = normalizeCoordinate(value, 'latitude');
    }

    if (field === 'longitude') {
      value = normalizeCoordinate(value, 'longitude');
    }

    setFormData((prev) => {
      const next = { ...prev, [field]: value };

      if (field === 'location_type' && !isEdit) {
        next.radius = RECOMMENDED_RADIUS[value] ?? prev.radius;
      }

      return next;
    });

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
    setSubmitError('');
  };

  const handleCoordinatesChange = ({ latitude, longitude }) => {
    setFormData((prev) => ({
      ...prev,
      latitude: latitude == null ? prev.latitude : normalizeCoordinate(latitude, 'latitude'),
      longitude: longitude == null ? prev.longitude : normalizeCoordinate(longitude, 'longitude')
    }));
    setErrors((prev) => ({ ...prev, latitude: '', longitude: '' }));
  };

  const handleApplyRecommendedRadius = () => {
    const recommended = RECOMMENDED_RADIUS[formData.location_type] ?? RECOMMENDED_RADIUS.outdoor;
    setFormData((prev) => ({ ...prev, radius: recommended }));
    if (errors.radius) {
      setErrors((prev) => ({ ...prev, radius: '' }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');

    const { errors: validationErrors, isValid } = validateCheckpointForm(formData, { isEdit });
    if (!isValid) {
      setErrors(validationErrors);
      return;
    }

    if (missingZoneContext) {
      setSubmitError('Zone context is missing. Open create or edit from a zone details page.');
      return;
    }

    try {
      setLoading(true);
      const payload = buildCheckpointPayload({
        ...formData,
        zone_id: activeZoneId
      });

      if (isEdit) {
        await repository.updateCheckpoint(checkpointId, payload);
        setSavedCheckpointId(checkpointId);
      } else {
        const response = await repository.createCheckpoint(payload);
        const created = response?.data ?? response;
        setSavedCheckpointId(created?.id ?? null);
      }

      setShowSuccessModal(true);
    } catch (err) {
      console.error('Failed to save checkpoint:', err);
      const backendValidationErrors = extractBackendValidationErrors(err);
      if (backendValidationErrors) {
        setErrors((prev) => ({ ...prev, ...normalizeValidationErrorsForForm(backendValidationErrors) }));
      }
      setSubmitError(extractBackendErrorMessage(err, 'Failed to save checkpoint.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigateToZoneDetails(activeZoneId);
  };

  const handleModalClose = () => {
    setShowSuccessModal(false);
    if (savedCheckpointId) {
      navigate(`/admin/management-checkpoint/${savedCheckpointId}`);
      return;
    }
    navigateToZoneDetails(activeZoneId);
  };

  const mapLatitude =
    formData.latitude === '' || formData.latitude == null
      ? DEFAULT_MAP_CENTER.latitude
      : (normalizeCoordinate(formData.latitude, 'latitude', { asNumber: true }) ?? DEFAULT_MAP_CENTER.latitude);
  const mapLongitude =
    formData.longitude === '' || formData.longitude == null
      ? DEFAULT_MAP_CENTER.longitude
      : (normalizeCoordinate(formData.longitude, 'longitude', { asNumber: true }) ?? DEFAULT_MAP_CENTER.longitude);

  const hasUserSelectedCoordinates =
    formData.latitude !== '' && formData.latitude != null && formData.longitude !== '' && formData.longitude != null;
  const recenterLatitude = hasUserSelectedCoordinates ? mapLatitude : DEFAULT_MAP_CENTER.latitude;
  const recenterLongitude = hasUserSelectedCoordinates ? mapLongitude : DEFAULT_MAP_CENTER.longitude;

  return {
    formData,
    errors,
    loading,
    initialLoading,
    submitError,
    zoneName,
    zoneLoading,
    missingZoneContext,
    isEdit,
    showSuccessModal,
    mapLatitude,
    mapLongitude,
    recenterLatitude,
    recenterLongitude,
    handleChange,
    handleCoordinatesChange,
    handleApplyRecommendedRadius,
    handleSubmit,
    handleCancel,
    handleModalClose
  };
};
