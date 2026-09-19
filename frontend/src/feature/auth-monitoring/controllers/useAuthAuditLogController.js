import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_FILTERS = {
  action: 'all',
  status: 'all',
  email: '',
  dateFrom: '',
  dateTo: ''
};

export const useAuthAuditLogController = (repository) => {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, perPage: 25, lastPage: 1 });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const updateFilters = useCallback((nextFilters) => {
    setPage(0);
    setFilters(nextFilters);
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = repository.buildAuditLogQueryParams(filters, page, rowsPerPage);
      const result = await repository.getAuditLogs(params);
      if (!isMountedRef.current) return;
      setLogs(result.logs);
      setPagination(result.pagination);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Failed to load audit logs');
      setLogs([]);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [repository, filters, page, rowsPerPage]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return {
    logs,
    pagination,
    filters,
    page,
    rowsPerPage,
    loading,
    error,
    setFilters,
    updateFilters,
    setPage,
    setRowsPerPage,
    reload: loadLogs
  };
};
