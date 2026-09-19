const ANOMALY_TYPE_LABELS = {
  speed_anomaly: 'Speed review',
  gps_jump: 'GPS jump',
  poor_accuracy: 'Poor GPS accuracy',
  timestamp_issue: 'Timestamp issue',
  route_deviation: 'Route concern'
};

const ANOMALY_MAP_STYLES = {
  speed_anomaly: { color: '#dc2626', dashArray: '10, 8', weight: 5 },
  gps_jump: { color: '#9333ea', dashArray: '10, 8', weight: 5 },
  poor_accuracy: { color: '#ea580c', dashArray: '6, 6', weight: 4 },
  timestamp_issue: { color: '#1e293b', dashArray: null, weight: 0, isMarker: true },
  route_deviation: { color: '#ca8a04', dashArray: '8, 6', weight: 4 }
};

export function getAnomalyTypeLabel(type) {
  return ANOMALY_TYPE_LABELS[type] ?? type ?? 'Unknown';
}

export function getAnomalyMapStyle(type) {
  return ANOMALY_MAP_STYLES[type] ?? { color: '#64748b', dashArray: '6, 6', weight: 4 };
}

/**
 * Normalize validation anomalies from POST …/validate (or realtime payload).
 * Prefers flat `anomalies.items`; returns [] when absent.
 */
export function extractAnomalyItems(validationResult) {
  const raw = validationResult?.anomalies?.items;
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: item.id ?? `anomaly-${index}`,
      type: item.type ?? 'unknown',
      severity: item.severity === 'minor' ? 'minor' : 'major',
      message: item.message ?? '',
      startLogId: item.start_log_id ?? null,
      endLogId: item.end_log_id ?? null,
      startTimestamp: item.start_timestamp ?? null,
      endTimestamp: item.end_timestamp ?? null,
      startLatitude: item.start_latitude,
      startLongitude: item.start_longitude,
      endLatitude: item.end_latitude,
      endLongitude: item.end_longitude,
      distanceMeters: item.distance_meters ?? null,
      speedMps: item.speed_mps ?? null,
      calculatedSpeedMps: item.calculated_speed_mps ?? null,
      reportedSpeedMps: item.reported_speed_mps ?? null
    }));
}

export function countAnomaliesBySeverity(items) {
  return items.reduce(
    (acc, item) => {
      if (item.severity === 'minor') {
        acc.minor += 1;
      } else {
        acc.major += 1;
      }
      return acc;
    },
    { major: 0, minor: 0, total: items.length }
  );
}

export function formatAnomalyTimeRange(item) {
  const start = item.startTimestamp;
  const end = item.endTimestamp;
  if (start == null && end == null) {
    return '—';
  }
  const fmt = (ms) => {
    if (ms == null) return '—';
    try {
      return new Date(ms).toLocaleString('en-MY', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: 'short'
      });
    } catch {
      return String(ms);
    }
  };
  if (start != null && end != null && start !== end) {
    return `${fmt(start)} → ${fmt(end)}`;
  }
  return fmt(start ?? end);
}

export function buildAnomalyPopupHtml(item) {
  const typeLabel = getAnomalyTypeLabel(item.type);
  const lines = [
    `<strong>${typeLabel}</strong>`,
    `Severity: ${item.severity}`,
    item.message ? `<span>${item.message}</span>` : '',
    `Time: ${formatAnomalyTimeRange(item)}`
  ];
  if (item.distanceMeters != null) {
    lines.push(`Distance: ${item.distanceMeters} m`);
  }
  if (item.speedMps != null) {
    lines.push(`Speed: ${item.speedMps} m/s (${(item.speedMps * 3.6).toFixed(1)} km/h)`);
  }
  return lines.filter(Boolean).join('<br/>');
}

export function anomalyToLatLngs(item) {
  const startLat = Number(item.startLatitude);
  const startLng = Number(item.startLongitude);
  const endLat = Number(item.endLatitude);
  const endLng = Number(item.endLongitude);

  if (!Number.isFinite(startLat) || !Number.isFinite(startLng)) {
    return null;
  }

  const start = [startLat, startLng];
  if (!Number.isFinite(endLat) || !Number.isFinite(endLng)) {
    return [start];
  }

  const end = [endLat, endLng];
  if (startLat === endLat && startLng === endLng) {
    return [start];
  }

  return [start, end];
}
