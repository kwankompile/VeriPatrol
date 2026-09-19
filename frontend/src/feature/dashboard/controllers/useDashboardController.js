import { useCallback, useEffect, useRef, useState } from 'react';

import { getAuthUserRole } from 'utils/auth';

export function useDashboardController(repository) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);
  const role = getAuthUserRole();

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isRefreshingRef = useRef(false);

  const loadSummary = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (isRefresh && isRefreshingRef.current) {
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      try {
        if (isRefresh) {
          isRefreshingRef.current = true;
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const nextSummary = await repository.getSummary();

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setSummary(nextSummary);
        setLastUpdatedAt(nextSummary.generatedAt ?? new Date().toISOString());
      } catch (err) {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        setError(err?.message || 'Unable to load dashboard data. Please try again.');
      } finally {
        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }
        setLoading(false);
        setRefreshing(false);
        isRefreshingRef.current = false;
      }
    },
    [repository]
  );

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handleRefresh = useCallback(() => {
    void loadSummary({ isRefresh: true });
  }, [loadSummary]);

  const handleRetry = useCallback(() => {
    void loadSummary({ isRefresh: false });
  }, [loadSummary]);

  const isInitialLoad = loading && !summary;

  return {
    role,
    loading,
    refreshing,
    error,
    summary,
    lastUpdatedAt,
    isInitialLoad,
    handleRefresh,
    handleRetry
  };
}
