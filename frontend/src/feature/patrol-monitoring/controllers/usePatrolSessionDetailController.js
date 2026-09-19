import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { emitPatrolRealtimeNotification } from 'services/realtime/patrolRealtimeNotifier';
import { usePatrolRealtime } from 'services/realtime/usePatrolRealtime';
import { extractAnomalyItems } from '../utils/patrolAnomalyUtils';
import { mergeRoutePoints, normalizeRoutePoint } from '../utils/patrolRoutePointUtils';
import { handleSessionRealtimeEvent } from './patrolRealtimeHandlers';

export const usePatrolSessionDetailController = (repository) => {
  const { patrolSessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [summary, setSummary] = useState(null);
  const [checkpointEvents, setCheckpointEvents] = useState([]);
  const [patrolRoutes, setPatrolRoutes] = useState([]);
  const [validationResult, setValidationResult] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [showAnomalies, setShowAnomalies] = useState(true);

  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [validating, setValidating] = useState(false);

  const [error, setError] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [routesError, setRoutesError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [validationMessage, setValidationMessage] = useState(null);

  const routeBatchRef = useRef([]);
  const routeBatchTimerRef = useRef(null);
  const largeGapNotifiedRef = useRef(false);
  /** Latest-request-wins for multi-page route loads */
  const routesRequestIdRef = useRef(0);
  const routesAbortRef = useRef(null);

  const flushRouteBatch = useCallback(() => {
    if (!routeBatchRef.current.length) {
      return;
    }
    const batch = [...routeBatchRef.current];
    routeBatchRef.current = [];

    setPatrolRoutes((prev) => mergeRoutePoints(prev, batch));
  }, []);

  const queueRoutePoint = useCallback(
    (point) => {
      const normalized = normalizeRoutePoint(point);
      if (!normalized) {
        return;
      }
      routeBatchRef.current.push(normalized);
      if (routeBatchTimerRef.current) {
        clearTimeout(routeBatchTimerRef.current);
      }
      routeBatchTimerRef.current = setTimeout(() => {
        flushRouteBatch();
      }, 300);
    },
    [flushRouteBatch]
  );

  const handleLargeGapDetected = useCallback((gapSeconds) => {
    if (largeGapNotifiedRef.current) {
      return;
    }
    largeGapNotifiedRef.current = true;
    emitPatrolRealtimeNotification({
      severity: 'warning',
      message: `Large GPS gap detected (${gapSeconds}s).`
    });
  }, []);

  const loadSummary = useCallback(async () => {
    if (!patrolSessionId) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const data = await repository.getPatrolSummary(patrolSessionId);
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setSummaryError(err.message || 'Failed to load patrol summary');
    } finally {
      setSummaryLoading(false);
    }
  }, [repository, patrolSessionId]);

  const loadPatrolRoutes = useCallback(async () => {
    if (!patrolSessionId) return;

    if (typeof routesAbortRef.current?.abort === 'function') {
      routesAbortRef.current.abort();
    }

    const requestId = ++routesRequestIdRef.current;
    const abortController =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    routesAbortRef.current = abortController;

    setRoutesLoading(true);
    setRoutesError(null);

    try {
      const loader =
        typeof repository.getAllPatrolRoutes === 'function'
          ? repository.getAllPatrolRoutes.bind(repository)
          : repository.getPatrolRoutes.bind(repository);

      const rows = await loader(patrolSessionId, {
        signal: abortController?.signal
      });

      if (requestId !== routesRequestIdRef.current) {
        return;
      }

      const pendingBatch = [...routeBatchRef.current];
      routeBatchRef.current = [];
      if (routeBatchTimerRef.current) {
        clearTimeout(routeBatchTimerRef.current);
        routeBatchTimerRef.current = null;
      }

      setPatrolRoutes((prev) => mergeRoutePoints(rows, mergeRoutePoints(prev, pendingBatch)));
    } catch (err) {
      if (requestId !== routesRequestIdRef.current || err?.name === 'AbortError') {
        return;
      }
      setRoutesError(err.message || 'Failed to load patrol route data');
      // Do not replace existing points with a partial/failed load.
    } finally {
      if (requestId === routesRequestIdRef.current) {
        setRoutesLoading(false);
      }
    }
  }, [repository, patrolSessionId]);

  const loadCheckpointEvents = useCallback(async () => {
    if (!patrolSessionId) return;
    setEventsLoading(true);
    try {
      const { rows } = await repository.getCheckpointEvents({
        patrol_session_id: patrolSessionId,
        per_page: 100,
        page: 1,
        sort: 'latest'
      });
      setCheckpointEvents(rows);
    } catch (err) {
      console.error('[patrol-monitoring] failed to load checkpoint events', err);
      setCheckpointEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [repository, patrolSessionId]);

  const loadSession = useCallback(async () => {
    if (!patrolSessionId) {
      setError('Patrol session id is missing');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await repository.getPatrolSessionById(patrolSessionId);
      setSession(data);
    } catch (err) {
      setSession(null);
      setError(err.message || 'Failed to load patrol session');
    } finally {
      setLoading(false);
    }
  }, [repository, patrolSessionId]);

  const loadAll = useCallback(async () => {
    await loadSession();
    await Promise.all([loadSummary(), loadCheckpointEvents(), loadPatrolRoutes()]);
  }, [loadSession, loadSummary, loadCheckpointEvents, loadPatrolRoutes]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(
    () => () => {
      if (routeBatchTimerRef.current) {
        clearTimeout(routeBatchTimerRef.current);
      }
      if (typeof routesAbortRef.current?.abort === 'function') {
        routesAbortRef.current.abort();
      }
      routesRequestIdRef.current += 1;
    },
    []
  );

  const loadSummaryRef = useRef(loadSummary);
  const loadCheckpointEventsRef = useRef(loadCheckpointEvents);
  const loadSessionRef = useRef(loadSession);
  useEffect(() => {
    loadSummaryRef.current = loadSummary;
    loadCheckpointEventsRef.current = loadCheckpointEvents;
    loadSessionRef.current = loadSession;
  }, [loadSummary, loadCheckpointEvents, loadSession]);

  const applyValidationResult = useCallback((result) => {
    setValidationResult(result);
    setAnomalies(extractAnomalyItems(result));
    setSelectedAnomaly(null);
  }, []);

  const handleRealtimeEvent = useCallback(
    ({ name, payload }) => {
      handleSessionRealtimeEvent({ name, payload }, patrolSessionId, {
        setSession,
        setPatrolRoutes,
        setCheckpointEvents,
        setValidationResult: applyValidationResult,
        setSummary,
        loadSummary: () => loadSummaryRef.current(),
        loadCheckpointEvents: () => loadCheckpointEventsRef.current(),
        loadSession: () => loadSessionRef.current(),
        queueRoutePoint
      });
    },
    [patrolSessionId, queueRoutePoint, applyValidationResult]
  );

  const { isConnected, connectionState, isRealtimeEnabled } = usePatrolRealtime({
    patrolSessionId,
    onEvent: handleRealtimeEvent
  });

  useEffect(() => {
    if (isConnected) {
      return undefined;
    }
    const intervalId = setInterval(() => {
      void loadSession();
      void loadSummaryRef.current();
      void loadCheckpointEventsRef.current();
      void loadPatrolRoutes();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [isConnected, loadSession, loadPatrolRoutes]);

  const handleReRunValidation = async () => {
    if (!patrolSessionId || validating) return;

    try {
      setValidating(true);
      setValidationError(null);
      setValidationMessage(null);

      const result = await repository.validatePatrolSession(patrolSessionId);
      applyValidationResult(result);
      setValidationMessage('Validation completed. Summary and checkpoint events refreshed.');

      await Promise.all([loadSummary(), loadCheckpointEvents(), loadPatrolRoutes()]);
    } catch (err) {
      setValidationError(err.message || 'Re-run validation failed');
      console.error('[patrol-monitoring] validation failed', err);
    } finally {
      setValidating(false);
    }
  };

  const handleBack = () => {
    navigate('/admin/patrol-monitoring');
  };

  return {
    patrolSessionId,
    session,
    summary,
    checkpointEvents,
    patrolRoutes,
    validationResult,
    anomalies,
    selectedAnomaly,
    showAnomalies,
    setSelectedAnomaly,
    setShowAnomalies,
    loading,
    summaryLoading,
    eventsLoading,
    routesLoading,
    validating,
    error,
    summaryError,
    routesError,
    validationError,
    validationMessage,
    handleReRunValidation,
    handleBack,
    handleRefresh: loadAll,
    handleLargeGapDetected,
    isConnected,
    connectionState,
    isRealtimeEnabled
  };
};
