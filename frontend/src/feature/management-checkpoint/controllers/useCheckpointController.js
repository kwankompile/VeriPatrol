import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const useCheckpointController = (repository, { zoneId: scopedZoneId = null } = {}) => {
  const navigate = useNavigate();
  const [checkpoints, setCheckpoints] = useState([]);
  const [zone, setZone] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [totalCount, setTotalCount] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [zoneFilter, setZoneFilter] = useState(scopedZoneId ?? '');
  const [activeFilter, setActiveFilter] = useState('');
  const [locationTypeFilter, setLocationTypeFilter] = useState('');
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  const loadZones = useCallback(async () => {
    try {
      const payload = await repository.getZones();
      setZones(repository.normalizeZonesList(payload));
    } catch (err) {
      console.error('Failed to load zones:', err);
    }
  }, [repository]);

  const loadCheckpoints = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const params = {
        page: page + 1,
        per_page: rowsPerPage,
        search: filterText.trim() || undefined,
        zone_id: zoneFilter || undefined,
        location_type: locationTypeFilter || undefined
      };

      if (activeFilter !== '') {
        params.is_active = activeFilter === 'true';
      }

      const payload = await repository.getCheckpoints(params);
      const normalized = repository.normalizeCheckpointListResponse(payload);
      setCheckpoints(normalized.items);
      setTotalCount(normalized.total);
    } catch (err) {
      console.error('Failed to load checkpoints:', err);
      setError(err?.message || 'Failed to load checkpoints.');
      setCheckpoints([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [repository, page, rowsPerPage, filterText, zoneFilter, activeFilter, locationTypeFilter, scopedZoneId]);

  useEffect(() => {
    if (!scopedZoneId) return;
    let cancelled = false;
    (async () => {
      try {
        const zonePayload = await repository.getZoneById(scopedZoneId);
        if (!cancelled) {
          setZone(zonePayload?.data ?? zonePayload);
        }
      } catch (err) {
        console.error('Failed to load zone:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository, scopedZoneId]);

  useEffect(() => {
    if (scopedZoneId) return;
    loadZones();
  }, [loadZones, scopedZoneId]);

  useEffect(() => {
    loadCheckpoints();
  }, [loadCheckpoints]);

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

  const handleZoneFilterChange = (value) => {
    if (scopedZoneId) return;
    setZoneFilter(value);
    setPage(0);
  };

  const handleActiveFilterChange = (value) => {
    setActiveFilter(value);
    setPage(0);
  };

  const handleLocationTypeFilterChange = (value) => {
    setLocationTypeFilter(value);
    setPage(0);
  };

  const handleAddCheckpoint = () => {
    if (scopedZoneId) {
      navigate(`/admin/management-checkpoint/create`, { state: { zoneId: scopedZoneId } });
      return;
    }
    navigate('/admin/management-checkpoint/create');
  };

  const handleViewCheckpoint = (checkpointId) => {
    navigate(`/admin/management-checkpoint/${checkpointId}`);
  };

  const handleEditCheckpoint = (checkpointId) => {
    navigate(`/admin/management-checkpoint/${checkpointId}/edit`);
  };

  const handleDeleteCheckpoint = async (checkpointId) => {
    if (!window.confirm('Are you sure you want to delete this checkpoint?')) {
      return;
    }

    try {
      await repository.deleteCheckpoint(checkpointId);
      setFeedback({ type: 'success', message: 'Checkpoint deleted successfully.' });
      await loadCheckpoints();
    } catch (err) {
      console.error('Failed to delete checkpoint:', err);
      setFeedback({ type: 'error', message: err?.message || 'Failed to delete checkpoint.' });
    }
  };

  const handleBack = () => {
    if (scopedZoneId) {
      navigate('/admin/management-zone');
      return;
    }
    navigate('/dashboard');
  };

  const clearFeedback = () => setFeedback({ type: '', message: '' });

  return {
    checkpoints,
    zone,
    zones,
    scopedZoneId,
    page,
    rowsPerPage,
    totalCount,
    filterText,
    zoneFilter: scopedZoneId || zoneFilter,
    activeFilter,
    locationTypeFilter,
    loading,
    error,
    feedback,
    clearFeedback,
    handleBack,
    handleChangePage,
    handleChangeRowsPerPage,
    handleFilterChange,
    handleZoneFilterChange,
    handleActiveFilterChange,
    handleLocationTypeFilterChange,
    handleAddCheckpoint,
    handleViewCheckpoint,
    handleEditCheckpoint,
    handleDeleteCheckpoint,
    reload: loadCheckpoints
  };
};
