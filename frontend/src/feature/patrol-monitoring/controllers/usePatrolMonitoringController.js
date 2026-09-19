import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { usePatrolRealtime } from 'services/realtime/usePatrolRealtime';
import { handleMonitoringRealtimeEvent } from './patrolRealtimeHandlers';
import { filterSessionsByAttention } from '../utils/patrolMonitoringFilterUtils';

export const usePatrolMonitoringController = (repository) => {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [summariesBySessionId, setSummariesBySessionId] = useState({});
  const [zones, setZones] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
    aborted: 0,
    suspiciousEvents: 0,
    needsReviewEvents: 0,
    partialEvents: 0,
    missedEvents: 0
  });

  const [loading, setLoading] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState(null);
  const [filterText, setFilterText] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [attentionFilter, setAttentionFilter] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const sessionsRef = useRef([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const loadStats = useCallback(async () => {
    try {
      const [all, active, completed, aborted, suspicious, needsReview, partial, missed] = await Promise.all([
        repository.getPatrolSessions({ per_page: 1, page: 1 }),
        repository.getPatrolSessions({ status: 'active', per_page: 1, page: 1 }),
        repository.getPatrolSessions({ status: 'completed', per_page: 1, page: 1 }),
        repository.getPatrolSessions({ status: 'aborted', per_page: 1, page: 1 }),
        repository.getCheckpointEvents({ status: 'suspicious', per_page: 1, page: 1 }),
        repository.getCheckpointEvents({ status: 'needs_review', per_page: 1, page: 1 }),
        repository.getCheckpointEvents({ status: 'partial', per_page: 1, page: 1 }),
        repository.getCheckpointEvents({ status: 'missed', per_page: 1, page: 1 })
      ]);

      setStats({
        total: all.meta.total ?? 0,
        active: active.meta.total ?? 0,
        completed: completed.meta.total ?? 0,
        aborted: aborted.meta.total ?? 0,
        suspiciousEvents: suspicious.meta.total ?? 0,
        needsReviewEvents: needsReview.meta.total ?? 0,
        partialEvents: partial.meta.total ?? 0,
        missedEvents: missed.meta.total ?? 0
      });
    } catch (err) {
      console.warn('[patrol-monitoring] failed to load stats', err);
    }
  }, [repository]);

  const loadSummariesForSessions = useCallback(
    async (sessionRows) => {
      const completedSessions = sessionRows.filter((s) => s.status === 'completed');
      if (!completedSessions.length) {
        return {};
      }

      const entries = await Promise.all(
        completedSessions.map(async (session) => {
          try {
            const summary = await repository.getPatrolSummary(session.id);
            return [session.id, summary];
          } catch {
            return [session.id, null];
          }
        })
      );

      const batch = {};
      entries.forEach(([id, summary]) => {
        if (summary) batch[id] = summary;
      });

      setSummariesBySessionId((prev) => ({ ...prev, ...batch }));
      return batch;
    },
    [repository]
  );

  const loadSessions = useCallback(async () => {
    const isRefreshing = initialLoadComplete && sessionsRef.current.length > 0;

    try {
      setLoading(true);
      if (!isRefreshing) {
        setError(null);
      }

      const baseParams = { sort: 'latest' };
      if (statusFilter) baseParams.status = statusFilter;
      if (zoneFilter) baseParams.zone_id = zoneFilter;

      const searchActive = Boolean(String(filterText ?? '').trim());
      const clientFilterActive = searchActive || Boolean(attentionFilter);

      if (clientFilterActive) {
        const { rows } = await repository.getPatrolSessions({
          ...baseParams,
          per_page: 100,
          page: 1
        });

        let filtered = searchActive ? repository.filterSessionsBySearch(rows, filterText) : rows;
        const summaryBatch = await loadSummariesForSessions(filtered);

        if (attentionFilter) {
          filtered = filterSessionsByAttention(filtered, summaryBatch, attentionFilter);
        }

        const start = page * rowsPerPage;
        setSessions(filtered.slice(start, start + rowsPerPage));
        setTotalCount(filtered.length);
      } else {
        const { rows, meta } = await repository.getPatrolSessions({
          ...baseParams,
          page: page + 1,
          per_page: rowsPerPage
        });
        setSessions(rows);
        setTotalCount(meta.total ?? rows.length);
        await loadSummariesForSessions(rows);
      }
    } catch (err) {
      setError(err.message || 'Failed to load patrol sessions');
      if (sessionsRef.current.length === 0) {
        setSessions([]);
        setTotalCount(0);
      }
    } finally {
      setLoading(false);
      setInitialLoadComplete(true);
    }
  }, [
    repository,
    page,
    rowsPerPage,
    statusFilter,
    zoneFilter,
    filterText,
    attentionFilter,
    loadSummariesForSessions,
    initialLoadComplete
  ]);

  useEffect(() => {
    const init = async () => {
      try {
        const zoneList = await repository.getZones();
        setZones(zoneList);
      } catch (err) {
        console.warn('[patrol-monitoring] failed to load zones', err);
      }
      await loadStats();
    };
    void init();
  }, [repository, loadStats]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const loadStatsRef = useRef(loadStats);
  const loadSessionsRef = useRef(loadSessions);
  useEffect(() => {
    loadStatsRef.current = loadStats;
    loadSessionsRef.current = loadSessions;
  }, [loadStats, loadSessions]);

  const handleRealtimeEvent = useCallback(
    ({ name, payload }) => {
      handleMonitoringRealtimeEvent(
        { name, payload },
        {
          setSessions,
          setStats,
          setSummariesBySessionId,
          loadStats: () => loadStatsRef.current(),
          loadSessions: () => loadSessionsRef.current()
        }
      );
    },
    [setSummariesBySessionId]
  );

  const { isConnected, connectionState, isRealtimeEnabled } = usePatrolRealtime({
    onEvent: handleRealtimeEvent
  });

  useEffect(() => {
    if (isConnected) {
      return undefined;
    }
    const intervalId = setInterval(() => {
      void loadStatsRef.current();
      void loadSessionsRef.current();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [isConnected]);

  const handleFilterTextChange = (text) => {
    setFilterText(text);
    setPage(0);
  };

  const handleStatusFilterChange = (status) => {
    setStatusFilter(status);
    setPage(0);
  };

  const handleZoneFilterChange = (zoneId) => {
    setZoneFilter(zoneId);
    setPage(0);
  };

  const handleAttentionFilterChange = (value) => {
    setAttentionFilter(value);
    setPage(0);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleViewDetails = (patrolSessionId) => {
    navigate(`/admin/patrol-monitoring/${patrolSessionId}`);
  };

  const handleRefresh = () => {
    void loadStats();
    void loadSessions();
  };

  const handleRetry = () => {
    setError(null);
    void loadSessions();
  };

  const isInitialLoad = loading && !initialLoadComplete;
  const isRefreshing = loading && initialLoadComplete;
  const liveStatus = error ? 'reconnecting' : isConnected || isRealtimeEnabled ? 'live' : 'paused';

  return {
    sessions,
    summariesBySessionId,
    zones,
    stats,
    loading,
    isInitialLoad,
    isRefreshing,
    error,
    filterText,
    statusFilter,
    zoneFilter,
    attentionFilter,
    page,
    rowsPerPage,
    totalCount,
    handleFilterTextChange,
    handleStatusFilterChange,
    handleZoneFilterChange,
    handleAttentionFilterChange,
    handleChangePage,
    handleChangeRowsPerPage,
    handleViewDetails,
    handleRefresh,
    handleRetry,
    isConnected,
    connectionState,
    isRealtimeEnabled,
    liveStatus
  };
};
