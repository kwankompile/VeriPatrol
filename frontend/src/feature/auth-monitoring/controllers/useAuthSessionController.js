import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_FILTERS = {
  userId: ''
};

export const useAuthSessionController = (repository, options = {}) => {
  const sessionScope = options.scope;
  const [sessions, setSessions] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, perPage: 25, lastPage: 1 });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {
        ...repository.buildSessionQueryParams(filters, page, rowsPerPage),
        ...(sessionScope ? { scope: sessionScope } : {})
      };
      const result = await repository.getSessions(params);
      if (!isMountedRef.current) return;
      setSessions(result.sessions);
      setPagination(result.pagination);
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err.message || 'Failed to load sessions');
      setSessions([]);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [repository, filters, page, rowsPerPage, sessionScope]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const revokeSession = useCallback(
    async (sessionId) => {
      setRevokingId(sessionId);
      try {
        await repository.revokeSession(sessionId);
        await loadSessions();
      } catch (err) {
        setError(err.message || 'Failed to revoke session');
      } finally {
        setRevokingId(null);
      }
    },
    [repository, loadSessions]
  );

  return {
    sessions,
    pagination,
    filters,
    page,
    rowsPerPage,
    loading,
    error,
    revokingId,
    setFilters,
    setPage,
    setRowsPerPage,
    reload: loadSessions,
    revokeSession
  };
};
