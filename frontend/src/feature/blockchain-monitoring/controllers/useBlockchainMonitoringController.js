import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DEFAULT_FILTERS = {
  search: '',
  status: 'all',
  network: 'all',
  environment: 'all',
  entityType: 'all'
};

export const useBlockchainMonitoringController = (repository) => {
  const navigate = useNavigate();

  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, page: 1, perPage: 10, lastPage: 1 });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [verifyAllSummary, setVerifyAllSummary] = useState(null);
  const [error, setError] = useState(null);

  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadData = useCallback(
    async ({ isRefresh = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const params = repository.buildListQueryParams(filters, page, rowsPerPage);
        const [nextSummary, recordsResult] = await Promise.all([
          repository.getBlockchainSummary(),
          repository.getBlockchainRecords(params)
        ]);

        if (!isMountedRef.current || requestId !== requestIdRef.current) return;

        setSummary(nextSummary);
        setRecords(recordsResult.records);
        setPagination({
          total: recordsResult.pagination.total,
          page: recordsResult.pagination.page,
          perPage: recordsResult.pagination.perPage,
          lastPage: recordsResult.pagination.lastPage
        });
      } catch (err) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) return;
        setError(err.message || 'Failed to load blockchain monitoring data');
        setRecords([]);
        setPagination({ total: 0, page: 1, perPage: rowsPerPage, lastPage: 1 });
      } finally {
        if (!isMountedRef.current || requestId !== requestIdRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [repository, filters, page, rowsPerPage]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  };

  const handleSearchChange = (value) => updateFilter('search', value);
  const handleStatusFilterChange = (value) => updateFilter('status', value);
  const handleNetworkFilterChange = (value) => updateFilter('network', value);
  const handleEnvironmentFilterChange = (value) => updateFilter('environment', value);
  const handleEntityTypeFilterChange = (value) => updateFilter('entityType', value);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleViewDetails = (blockchainRecordId) => {
    navigate(`/admin/blockchain-monitoring/${blockchainRecordId}`);
  };

  const handleRefresh = () => {
    void loadData({ isRefresh: true });
  };

  const handleVerifyAll = async () => {
    try {
      setVerifyingAll(true);
      setError(null);
      const summary = await repository.verifyAllBlockchainRecords(filters);
      setVerifyAllSummary(summary);
      await loadData({ isRefresh: true });
    } catch (err) {
      if (err?.data) {
        setVerifyAllSummary(err.data);
      }
      setError(err.message || 'Failed to verify blockchain records');
    } finally {
      setVerifyingAll(false);
    }
  };

  return {
    records,
    summary,
    pagination,
    filters,
    page,
    rowsPerPage,
    loading,
    refreshing,
    verifyingAll,
    verifyAllSummary,
    error,
    handleSearchChange,
    handleStatusFilterChange,
    handleNetworkFilterChange,
    handleEnvironmentFilterChange,
    handleEntityTypeFilterChange,
    handleChangePage,
    handleChangeRowsPerPage,
    handleViewDetails,
    handleRefresh,
    handleVerifyAll
  };
};
