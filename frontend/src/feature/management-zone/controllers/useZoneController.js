import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildZonePayload,
  extractBackendErrorMessage,
  extractBackendValidationErrors,
  normalizeValidationErrorsForForm,
  validateZoneForm
} from '../utils/zoneValidation';

export const useZoneController = (repository) => {
  const navigate = useNavigate();
  const [zones, setZones] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Right-side drawer (add/edit) state — mirrors Camera Management UX
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [formZone, setFormZone] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  const loadZones = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const payload = await repository.getAllZones({
        page: page + 1,
        per_page: rowsPerPage,
        search: filterText.trim() || undefined,
        sort: 'latest'
      });

      const normalized = repository.normalizeZoneListResponse(payload);
      setZones(normalized.items);
      setTotalCount(normalized.total);
    } catch (err) {
      console.error('Failed to load zones:', err);
      setError(err?.message || 'Failed to load zones.');
      setZones([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [repository, page, rowsPerPage, filterText]);

  useEffect(() => {
    loadZones();
  }, [loadZones]);

  const handleChangePage = (_event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleFilterChange = (text) => {
    setFilterText(text);
    setPage(0);
  };

  const handleAddZone = () => {
    setFormMode('create');
    setFormZone(null);
    setFormErrors({});
    setFormOpen(true);
  };

  const handleViewZone = (zoneId) => {
    navigate(`/admin/management-zone/view/${zoneId}`);
  };

  const handleEditZone = async (zoneId) => {
    setFormErrors({});
    setFormMode('edit');

    const existing = zones.find((zone) => zone.id === zoneId) ?? null;
    setFormZone(existing);
    setFormOpen(true);

    try {
      const response = await repository.getZoneById(zoneId);
      const zone = repository.normalizeZone(response);
      if (zone) {
        setFormZone(zone);
      }
    } catch (err) {
      console.error('Failed to load zone for editing:', err);
    }
  };

  const handleCloseForm = () => {
    if (saving) return;
    setFormOpen(false);
    setFormZone(null);
    setFormErrors({});
  };

  const handleSaveZone = async (form) => {
    const { errors: validationErrors, isValid } = validateZoneForm(form);
    if (!isValid) {
      setFormErrors(validationErrors);
      return;
    }

    try {
      setSaving(true);
      setFormErrors({});
      const payload = buildZonePayload(form);

      if (formMode === 'edit' && formZone?.id) {
        await repository.updateZone(formZone.id, payload);
        setFeedback({ type: 'success', message: 'Zone updated successfully.' });
      } else {
        await repository.createZone(payload);
        setFeedback({ type: 'success', message: 'Zone created successfully.' });
      }

      setFormOpen(false);
      setFormZone(null);
      await loadZones();
    } catch (err) {
      console.error('Failed to save zone:', err);
      const backendErrors = extractBackendValidationErrors(err);
      if (backendErrors) {
        setFormErrors(normalizeValidationErrorsForForm(backendErrors));
      }
      setFeedback({ type: 'error', message: extractBackendErrorMessage(err, 'Failed to save zone.') });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (!window.confirm('Are you sure you want to delete this zone?')) return;

    try {
      await repository.deleteZone(zoneId);
      setFeedback({ type: 'success', message: 'Zone deleted successfully.' });
      await loadZones();
    } catch (err) {
      console.error('Failed to delete zone:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete zone.' });
    }
  };

  const clearFeedback = () => {
    setFeedback({ type: '', message: '' });
  };

  return {
    zones,
    totalCount,
    page,
    rowsPerPage,
    filterText,
    loading,
    error,
    feedback,
    formOpen,
    formMode,
    formZone,
    saving,
    formErrors,
    handleChangePage,
    handleChangeRowsPerPage,
    handleFilterChange,
    handleAddZone,
    handleViewZone,
    handleEditZone,
    handleCloseForm,
    handleSaveZone,
    handleDeleteZone,
    clearFeedback
  };
};
