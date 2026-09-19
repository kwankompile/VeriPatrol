import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { computeStepDelayMs, getAnomalyAtReplayTime, getPassedCheckpointIds, sortPatrolRoutes } from '../utils/patrolReplayUtils';

/**
 * Patrol route replay playback (ordered by recorded_at).
 *
 * @param {object} options
 * @param {Array} options.patrolRoutes
 * @param {Array} [options.anomalies]
 * @param {Array} [options.checkpointEvents]
 * @param {boolean} [options.replayEnabled] — false for active sessions
 */
export function usePatrolReplayController({ patrolRoutes = [], anomalies = [], checkpointEvents = [], replayEnabled = true }) {
  const sortedRoutes = useMemo(() => sortPatrolRoutes(patrolRoutes), [patrolRoutes]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [replayFinished, setReplayFinished] = useState(false);

  const timerRef = useRef(null);
  const routesKeyRef = useRef('');

  const routeCount = sortedRoutes.length;
  const hasEnoughPoints = routeCount >= 2;
  const canReplay = replayEnabled && hasEnoughPoints;

  const currentRoutePoint = sortedRoutes[currentIndex] ?? null;

  const replayProgress = useMemo(() => {
    if (routeCount < 2) return 0;
    return (currentIndex / (routeCount - 1)) * 100;
  }, [currentIndex, routeCount]);

  const replayTime = currentRoutePoint?.recorded_at ?? null;

  const replayTimeMs = useMemo(() => {
    if (!replayTime) return null;
    const t = new Date(replayTime).getTime();
    return Number.isFinite(t) ? t : null;
  }, [replayTime]);

  const passedCheckpointIds = useMemo(() => getPassedCheckpointIds(checkpointEvents, replayTimeMs), [checkpointEvents, replayTimeMs]);

  const currentSegmentAnomaly = useMemo(() => getAnomalyAtReplayTime(anomalies, replayTimeMs), [anomalies, replayTimeMs]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const pause = useCallback(() => {
    clearTimer();
    setIsPlaying(false);
  }, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setIsPlaying(false);
    setCurrentIndex(0);
    setReplayFinished(false);
  }, [clearTimer]);

  const stop = reset;

  const seek = useCallback(
    (value) => {
      clearTimer();
      setIsPlaying(false);
      setReplayFinished(false);
      if (routeCount < 1) {
        setCurrentIndex(0);
        return;
      }
      let index;
      if (typeof value === 'number' && value >= 0 && value <= 1) {
        index = Math.round(value * (routeCount - 1));
      } else {
        index = Math.round(Number(value));
      }
      setCurrentIndex(Math.max(0, Math.min(routeCount - 1, index)));
    },
    [clearTimer, routeCount]
  );

  const play = useCallback(() => {
    if (!canReplay) return;
    if (replayFinished && routeCount > 0) {
      setCurrentIndex(0);
      setReplayFinished(false);
    }
    if (currentIndex >= routeCount - 1 && !replayFinished) {
      setCurrentIndex(0);
      setReplayFinished(false);
    }
    setIsPlaying(true);
  }, [canReplay, replayFinished, routeCount, currentIndex]);

  const setSpeedMultiplierSafe = useCallback((value) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) {
      setSpeedMultiplier(n);
    }
  }, []);

  // Reset when routes set changes (session switch or reload)
  useEffect(() => {
    const key = sortedRoutes.map((r) => r.id ?? r.recorded_at).join('|');
    if (routesKeyRef.current && routesKeyRef.current !== key) {
      reset();
    }
    routesKeyRef.current = key;
  }, [sortedRoutes, reset]);

  useEffect(() => {
    if (!isPlaying || !canReplay) {
      return undefined;
    }

    if (currentIndex >= routeCount - 1) {
      setIsPlaying(false);
      setReplayFinished(true);
      return undefined;
    }

    const fromRoute = sortedRoutes[currentIndex];
    const toRoute = sortedRoutes[currentIndex + 1];
    const delay = computeStepDelayMs(fromRoute, toRoute, speedMultiplier);

    timerRef.current = setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
    }, delay);

    return () => clearTimer();
  }, [isPlaying, currentIndex, speedMultiplier, sortedRoutes, canReplay, routeCount, clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const replayActive = canReplay && (isPlaying || currentIndex > 0 || replayFinished);

  return {
    sortedRoutes,
    canReplay,
    hasEnoughPoints,
    routeCount,
    isPlaying,
    currentIndex,
    speedMultiplier,
    currentRoutePoint,
    replayProgress,
    replayTime,
    replayTimeMs,
    replayFinished,
    replayActive,
    passedCheckpointIds,
    currentSegmentAnomaly,
    play,
    pause,
    stop,
    reset,
    seek,
    setSpeedMultiplier: setSpeedMultiplierSafe
  };
}
