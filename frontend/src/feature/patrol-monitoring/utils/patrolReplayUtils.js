import { getAnomalyTypeLabel } from './patrolAnomalyUtils';
import { sortRoutePoints } from './patrolRoutePointUtils';

export const REPLAY_SPEED_OPTIONS = [0.5, 1, 2, 5, 10];
export const MAX_REPLAY_STEP_DELAY_MS = 1500;
export const MIN_REPLAY_STEP_DELAY_MS = 80;
export const DEFAULT_STEP_DELAY_MS = 400;

export function routeRecordedAtMs(route) {
  if (!route?.recorded_at) return null;
  const t = new Date(route.recorded_at).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Sort patrol routes by recorded_at; stable order for missing timestamps. */
export function sortPatrolRoutes(routes) {
  return sortRoutePoints(routes);
}

/**
 * Delay until the next replay step (ms), capped for long GPS gaps.
 */
export function computeStepDelayMs(fromRoute, toRoute, speedMultiplier = 1) {
  const speed = Math.max(0.1, Number(speedMultiplier) || 1);
  const fromMs = routeRecordedAtMs(fromRoute);
  const toMs = routeRecordedAtMs(toRoute);

  let baseDelay = DEFAULT_STEP_DELAY_MS;
  if (fromMs != null && toMs != null && toMs > fromMs) {
    baseDelay = toMs - fromMs;
  }

  const scaled = baseDelay / speed;
  return Math.max(MIN_REPLAY_STEP_DELAY_MS, Math.min(MAX_REPLAY_STEP_DELAY_MS, scaled));
}

export function isReplaySessionAllowed(sessionStatus) {
  const status = String(sessionStatus ?? '').toLowerCase();
  return status === 'completed' || status === 'aborted';
}

export function formatReplayCoordinate(route) {
  const lat = Number(route?.latitude);
  const lng = Number(route?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '—';
  }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function parseDetectedAtMs(detectedAt) {
  if (!detectedAt) return null;
  const t = new Date(detectedAt).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Checkpoint event IDs whose detected_at is at or before current replay time. */
export function getPassedCheckpointIds(checkpointEvents, replayTimeMs) {
  if (replayTimeMs == null || !Array.isArray(checkpointEvents)) {
    return [];
  }
  return checkpointEvents
    .filter((event) => {
      const detectedMs = parseDetectedAtMs(event?.detected_at);
      return detectedMs != null && detectedMs <= replayTimeMs;
    })
    .map((event) => event.id)
    .filter(Boolean);
}

function anomalyOverlapsReplayTime(anomaly, replayTimeMs) {
  if (replayTimeMs == null) return false;
  const start = anomaly.startTimestamp;
  const end = anomaly.endTimestamp ?? start;
  if (start == null && end == null) return false;
  const rangeStart = start ?? end;
  const rangeEnd = end ?? start;
  return replayTimeMs >= rangeStart && replayTimeMs <= rangeEnd;
}

/** First anomaly overlapping current replay timestamp. */
export function getAnomalyAtReplayTime(anomalies, replayTimeMs) {
  if (replayTimeMs == null || !Array.isArray(anomalies)) {
    return null;
  }
  return anomalies.find((item) => anomalyOverlapsReplayTime(item, replayTimeMs)) ?? null;
}

export function formatReplayAnomalyChip(anomaly) {
  if (!anomaly) return null;
  return `Route concern at segment: ${getAnomalyTypeLabel(anomaly.type)}`;
}

export function formatReplayAccuracy(route) {
  const accuracy = Number(route?.accuracy);
  if (!Number.isFinite(accuracy)) return '—';
  return `±${Math.round(accuracy)}m`;
}

export function formatReplayPointLabel(currentIndex, routeCount) {
  if (routeCount < 1) return '—';
  return `Point ${currentIndex + 1} of ${routeCount}`;
}
