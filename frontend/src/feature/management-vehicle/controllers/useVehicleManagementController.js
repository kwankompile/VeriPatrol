import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const useVehicleManagementController = (repository) => {
  const navigate = useNavigate();

  const [vehicles, setVehicles] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, perPage: 10, lastPage: 1 });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const [editVehicle, setEditVehicle] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});

  const loadVehicles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        page: page + 1,
        per_page: rowsPerPage
      };
      const trimmedSearch = searchText.trim();
      if (trimmedSearch) {
        params.search = trimmedSearch;
      }

      const { vehicles: rows, pagination: meta } = await repository.getVehicles(params);
      setVehicles(rows);
      setPagination(meta);
    } catch (err) {
      setError(err.message || 'Failed to load vehicles');
      setVehicles([]);
      setPagination({ total: 0, page: 1, perPage: rowsPerPage, lastPage: 1 });
    } finally {
      setLoading(false);
    }
  }, [repository, page, rowsPerPage, searchText]);

  useEffect(() => {
    void loadVehicles();
  }, [loadVehicles]);

  const handleChangePage = (_event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSearchChange = (value) => {
    setSearchText(value);
    setPage(0);
  };

  const handleViewVehicle = (vehicleId) => {
    navigate(`/admin/management-vehicle/view/${vehicleId}`);
  };

  const handleOpenEdit = (vehicle) => {
    setEditVehicle(vehicle);
    setEditErrors({});
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setEditVehicle(null);
    setEditErrors({});
  };

  const handleSaveEdit = async (form) => {
    if (!editVehicle?.id) return;

    try {
      setSaving(true);
      setEditErrors({});
      const payload = repository.buildUpdatePayload(form);
      await repository.updateVehicle(editVehicle.id, payload);
      setFeedback({ type: 'success', message: 'Vehicle updated successfully.' });
      handleCloseEdit();
      await loadVehicles();
    } catch (err) {
      if (err.validationErrors) {
        const mapped = {};
        Object.entries(err.validationErrors).forEach(([field, messages]) => {
          mapped[field] = Array.isArray(messages) ? messages[0] : messages;
        });
        setEditErrors(mapped);
      }
      setFeedback({ type: 'error', message: err.message || 'Failed to update vehicle.' });
    } finally {
      setSaving(false);
    }
  };

  const clearFeedback = () => {
    setFeedback({ type: '', message: '' });
  };

  return {
    vehicles,
    pagination,
    page,
    rowsPerPage,
    searchText,
    loading,
    error,
    feedback,
    editVehicle,
    editOpen,
    saving,
    editErrors,
    handleChangePage,
    handleChangeRowsPerPage,
    handleSearchChange,
    handleViewVehicle,
    handleOpenEdit,
    handleCloseEdit,
    handleSaveEdit,
    clearFeedback
  };
};

export const useVehicleDetailController = (repository) => {
  const { vehicleId } = useParams();
  const navigate = useNavigate();

  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editErrors, setEditErrors] = useState({});
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const loadVehicle = useCallback(async () => {
    if (!vehicleId) {
      setError('Vehicle id is missing');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const normalized = await repository.getVehicleById(vehicleId);
      if (!normalized) {
        throw new Error('Vehicle not found');
      }
      setVehicle(normalized);
    } catch (err) {
      setVehicle(null);
      setError(err.message || 'Failed to load vehicle');
    } finally {
      setLoading(false);
    }
  }, [repository, vehicleId]);

  useEffect(() => {
    void loadVehicle();
  }, [loadVehicle]);

  const handleBack = () => {
    navigate('/admin/management-vehicle');
  };

  const handleOpenEdit = () => {
    setEditErrors({});
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setEditErrors({});
  };

  const handleSaveEdit = async (form) => {
    if (!vehicleId) return;

    try {
      setSaving(true);
      setEditErrors({});
      const payload = repository.buildUpdatePayload(form);
      const updated = await repository.updateVehicle(vehicleId, payload);
      setVehicle(updated);
      setFeedback({ type: 'success', message: 'Vehicle updated successfully.' });
      handleCloseEdit();
    } catch (err) {
      if (err.validationErrors) {
        const mapped = {};
        Object.entries(err.validationErrors).forEach(([field, messages]) => {
          mapped[field] = Array.isArray(messages) ? messages[0] : messages;
        });
        setEditErrors(mapped);
      }
      setFeedback({ type: 'error', message: err.message || 'Failed to update vehicle.' });
    } finally {
      setSaving(false);
    }
  };

  const clearFeedback = () => {
    setFeedback({ type: '', message: '' });
  };

  return {
    vehicle,
    loading,
    error,
    editOpen,
    saving,
    editErrors,
    feedback,
    handleBack,
    handleOpenEdit,
    handleCloseEdit,
    handleSaveEdit,
    clearFeedback
  };
};
