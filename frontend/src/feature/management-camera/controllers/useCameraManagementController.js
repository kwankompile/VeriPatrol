import { useCallback, useEffect, useMemo, useState } from 'react';

import { filterCamerasBySearch } from '../utils/cameraValidation';

const mapValidationErrors = (validationErrors) => {
  const mapped = {};
  if (!validationErrors || typeof validationErrors !== 'object') return mapped;
  Object.entries(validationErrors).forEach(([field, messages]) => {
    mapped[field] = Array.isArray(messages) ? messages[0] : messages;
  });
  return mapped;
};

export const useCameraManagementController = (repository) => {
  const [allCameras, setAllCameras] = useState([]);
  const [isServerPaginated, setIsServerPaginated] = useState(false);
  const [serverPagination, setServerPagination] = useState({ total: 0, page: 1, perPage: 10, lastPage: 1 });

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const [formMode, setFormMode] = useState(null);
  const [formCamera, setFormCamera] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [detailCamera, setDetailCamera] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [deletingId, setDeletingId] = useState(null);

  const loadCameras = useCallback(
    async (options = {}) => {
      try {
        setLoading(true);
        setError(null);

        const serverPaginated = Boolean(options.serverPaginated);
        const params = {};
        if (serverPaginated) {
          params.page = (options.page ?? 0) + 1;
          params.per_page = options.rowsPerPage ?? rowsPerPage;
          const trimmedSearch = (options.searchText ?? '').trim();
          if (trimmedSearch) {
            params.search = trimmedSearch;
          }
        }

        const result = await repository.getCameras(params);
        setIsServerPaginated(result.isServerPaginated);
        setAllCameras(result.cameras);
        setServerPagination(result.pagination);
      } catch (err) {
        setError(err.message || 'Failed to load cameras');
        setAllCameras([]);
        setServerPagination({ total: 0, page: 1, perPage: rowsPerPage, lastPage: 1 });
      } finally {
        setLoading(false);
      }
    },
    [repository, rowsPerPage]
  );

  useEffect(() => {
    void loadCameras({ serverPaginated: false });
  }, [loadCameras]);

  useEffect(() => {
    if (!isServerPaginated) return;
    void loadCameras({ serverPaginated: true, page, rowsPerPage, searchText });
  }, [isServerPaginated, page, rowsPerPage, searchText, loadCameras]);

  const filteredCameras = useMemo(() => {
    if (isServerPaginated) return allCameras;
    return filterCamerasBySearch(allCameras, searchText);
  }, [allCameras, searchText, isServerPaginated]);

  const displayedCameras = useMemo(() => {
    if (isServerPaginated) return filteredCameras;
    const start = page * rowsPerPage;
    return filteredCameras.slice(start, start + rowsPerPage);
  }, [filteredCameras, isServerPaginated, page, rowsPerPage]);

  const paginationTotal = isServerPaginated ? serverPagination.total : filteredCameras.length;

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

  const handleOpenCreate = () => {
    setFormMode('create');
    setFormCamera(null);
    setFormErrors({});
    setFormOpen(true);
  };

  const handleOpenEdit = (camera) => {
    setFormMode('edit');
    setFormCamera(camera);
    setFormErrors({});
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    setFormMode(null);
    setFormCamera(null);
    setFormErrors({});
  };

  const handleOpenDetail = (camera) => {
    setDetailCamera(camera);
    setDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setDetailCamera(null);
  };

  const handleSaveForm = async (form) => {
    try {
      setSaving(true);
      setFormErrors({});

      if (formMode === 'create') {
        const payload = repository.buildCreatePayload(form);
        await repository.createCamera(payload);
        setFeedback({ type: 'success', message: 'Camera created successfully.' });
      } else if (formMode === 'edit' && formCamera?.id) {
        const payload = repository.buildUpdatePayload(form);
        await repository.updateCamera(formCamera.id, payload);
        setFeedback({ type: 'success', message: 'Camera updated successfully.' });
      }

      handleCloseForm();
      await loadCameras({ serverPaginated: isServerPaginated, page, rowsPerPage, searchText });
    } catch (err) {
      if (err.validationErrors) {
        setFormErrors(mapValidationErrors(err.validationErrors));
      }
      setFeedback({
        type: 'error',
        message: err.message || `Failed to ${formMode === 'create' ? 'create' : 'update'} camera.`
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCamera = async (camera) => {
    if (!camera?.id) return;
    if (!window.confirm(`Delete camera "${camera.name}"? This cannot be undone.`)) return;

    try {
      setDeletingId(camera.id);
      await repository.deleteCamera(camera.id);
      setFeedback({ type: 'success', message: 'Camera deleted successfully.' });
      if (detailCamera?.id === camera.id) {
        handleCloseDetail();
      }
      await loadCameras({ serverPaginated: isServerPaginated, page, rowsPerPage, searchText });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete camera.' });
    } finally {
      setDeletingId(null);
    }
  };

  const clearFeedback = () => {
    setFeedback({ type: '', message: '' });
  };

  const handleRetry = () => {
    void loadCameras({ serverPaginated: isServerPaginated, page, rowsPerPage, searchText });
  };

  return {
    cameras: displayedCameras,
    paginationTotal,
    page,
    rowsPerPage,
    searchText,
    loading,
    error,
    feedback,
    formMode,
    formCamera,
    formOpen,
    detailCamera,
    detailOpen,
    saving,
    formErrors,
    deletingId,
    handleChangePage,
    handleChangeRowsPerPage,
    handleSearchChange,
    handleOpenCreate,
    handleOpenEdit,
    handleCloseForm,
    handleOpenDetail,
    handleCloseDetail,
    handleSaveForm,
    handleDeleteCamera,
    clearFeedback,
    handleRetry
  };
};
