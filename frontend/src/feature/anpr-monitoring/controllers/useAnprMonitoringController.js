import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const DEFAULT_FILTERS = {
  plateSearch: '',
  validity: 'all',
  flagged: 'all'
};

const POLL_INTERVAL_MS = 5000;
const POLL_BACKOFF_MAX_MS = 30000;
const HIGHLIGHT_DURATION_MS = 4000;

export const useAnprMonitoringController = (repository) => {
  const navigate = useNavigate();

  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, perPage: 10, lastPage: 1 });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const [liveEnabled, setLiveEnabled] = useState(true);
  const [liveStatus, setLiveStatus] = useState('live');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const [highlightedEventIds, setHighlightedEventIds] = useState([]);

  const isMountedRef = useRef(true);
  const pollTimerRef = useRef(null);
  const inFlightRef = useRef(false);
  const consecutivePollFailuresRef = useRef(0);
  const lastSeenEventIdsRef = useRef(new Set());
  const highlightTimersRef = useRef(new Map());

  const clearHighlightTimer = useCallback((eventId) => {
    const timer = highlightTimersRef.current.get(eventId);
    if (timer) {
      clearTimeout(timer);
      highlightTimersRef.current.delete(eventId);
    }
  }, []);

  const addHighlights = useCallback(
    (newIds) => {
      if (!newIds.length) return;

      setHighlightedEventIds((prev) => {
        const merged = new Set(prev);
        newIds.forEach((id) => merged.add(id));
        return Array.from(merged);
      });

      newIds.forEach((eventId) => {
        clearHighlightTimer(eventId);
        const timer = setTimeout(() => {
          if (!isMountedRef.current) return;
          setHighlightedEventIds((prev) => prev.filter((id) => id !== eventId));
          highlightTimersRef.current.delete(eventId);
        }, HIGHLIGHT_DURATION_MS);
        highlightTimersRef.current.set(eventId, timer);
      });
    },
    [clearHighlightTimer]
  );

  const loadEvents = useCallback(
    async ({ isRefresh = false, isPoll = false } = {}) => {
      if (inFlightRef.current) return;

      inFlightRef.current = true;

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else if (!isPoll) {
          setLoading(true);
        }

        if (!isPoll) {
          setError(null);
          setLiveError(null);
        }

        const params = repository.buildListQueryParams(filters, page, rowsPerPage);
        const { events: rows, pagination: meta } = await repository.getAnprEvents(params);

        if (!isMountedRef.current) return;

        const newIds = rows.map((row) => row.id).filter(Boolean);
        const previousIds = lastSeenEventIdsRef.current;

        if (isPoll && previousIds.size > 0) {
          const appeared = newIds.filter((id) => !previousIds.has(id));
          if (appeared.length) {
            addHighlights(appeared);
          }
        }

        lastSeenEventIdsRef.current = new Set(newIds);

        setEvents(rows);
        setPagination({
          total: meta.total,
          page: meta.page,
          perPage: meta.perPage,
          lastPage: meta.lastPage
        });
        setLastUpdatedAt(new Date());
        setLiveStatus('live');
        setLiveError(null);
        consecutivePollFailuresRef.current = 0;

        if (!isPoll) {
          setError(null);
        }
      } catch (err) {
        if (!isMountedRef.current) return;

        const message = err.message || 'Failed to load ANPR events';

        if (isPoll) {
          consecutivePollFailuresRef.current += 1;
          setLiveStatus('reconnecting');
          setLiveError(message);
        } else {
          setError(message);
          setEvents([]);
          setPagination({ total: 0, page: 1, perPage: rowsPerPage, lastPage: 1 });
        }
      } finally {
        inFlightRef.current = false;
        if (isMountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [repository, filters, page, rowsPerPage, addHighlights]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      highlightTimersRef.current.forEach((timer) => clearTimeout(timer));
      highlightTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (!liveEnabled) {
      setLiveStatus('paused');
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return undefined;
    }

    const schedulePoll = () => {
      const failures = consecutivePollFailuresRef.current;
      const delay = Math.min(
        POLL_INTERVAL_MS * 2 ** failures,
        POLL_BACKOFF_MAX_MS
      );
      pollTimerRef.current = setTimeout(async () => {
        if (!isMountedRef.current || !liveEnabled) return;
        await loadEvents({ isPoll: true });
        if (isMountedRef.current && liveEnabled) {
          schedulePoll();
        }
      }, delay);
    };

    schedulePoll();

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [liveEnabled, loadEvents]);

  const handlePlateSearchChange = (value) => {
    setFilters((prev) => ({ ...prev, plateSearch: value }));
    setPage(0);
    lastSeenEventIdsRef.current = new Set();
  };

  const handleValidityFilterChange = (value) => {
    setFilters((prev) => ({ ...prev, validity: value }));
    setPage(0);
    lastSeenEventIdsRef.current = new Set();
  };

  const handleFlaggedFilterChange = (value) => {
    setFilters((prev) => ({ ...prev, flagged: value }));
    setPage(0);
    lastSeenEventIdsRef.current = new Set();
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
    lastSeenEventIdsRef.current = new Set();
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
    lastSeenEventIdsRef.current = new Set();
  };

  const handleViewDetails = (anprEventId) => {
    navigate(`/admin/anpr-monitoring/${anprEventId}`);
  };

  const handleRefresh = () => {
    void loadEvents({ isRefresh: true });
  };

  return {
    events,
    pagination,
    filters,
    page,
    rowsPerPage,
    loading,
    refreshing,
    error,
    liveEnabled,
    liveStatus,
    lastUpdatedAt,
    liveError,
    highlightedEventIds,
    setLiveEnabled,
    handlePlateSearchChange,
    handleValidityFilterChange,
    handleFlaggedFilterChange,
    handleChangePage,
    handleChangeRowsPerPage,
    handleViewDetails,
    handleRefresh
  };
};

export const useAnprEventDetailController = (repository) => {
  const { anprEventId } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadEvent = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!anprEventId) {
        setError('ANPR event id is missing');
        setLoading(false);
        return;
      }

      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        let normalized = await repository.getAnprEventById(anprEventId);

        if (!normalized) {
          throw new Error('ANPR event not found');
        }

        if (!normalized.images?.length) {
          const images = await repository.getAnprImagesForEvent(anprEventId);
          if (images.length) {
            normalized = {
              ...normalized,
              images,
              imageMap: images.reduce((acc, image) => {
                if (image.imageType) acc[image.imageType] = image;
                return acc;
              }, {}),
              evidenceCount: images.length,
              hasEvidence: images.length > 0
            };
          }
        }

        setEvent(normalized);
      } catch (err) {
        setEvent(null);
        setError(err.message || 'Failed to load ANPR event');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [repository, anprEventId]
  );

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  const handleBack = () => {
    navigate('/admin/anpr-monitoring');
  };

  const handleRefresh = () => {
    void loadEvent({ isRefresh: true });
  };

  return {
    anprEventId,
    event,
    loading,
    refreshing,
    error,
    handleBack,
    handleRefresh
  };
};
