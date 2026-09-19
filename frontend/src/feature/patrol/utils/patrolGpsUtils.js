import { isGeolocationSupported } from 'pwa/geolocationService';

export const POOR_GPS_ACCURACY_THRESHOLD_METERS = 75;

/**
 * Derive guard-facing GPS health label from controller state (no geolocation API calls).
 */
export function deriveGpsHealthStatus({ trackingActive, currentPosition, gpsError, locationDetecting = false }) {
  if (!isGeolocationSupported()) {
    return 'unsupported';
  }

  const code = gpsError?.code;
  if (code === 1 || code === 'PERMISSION_DENIED' || code === 'GEO_PERMISSION_DENIED') {
    return 'permission_denied';
  }
  if (gpsError) {
    return 'error';
  }
  if (locationDetecting && !currentPosition) {
    return 'detecting';
  }
  if (trackingActive && !currentPosition) {
    return 'acquiring';
  }
  if (currentPosition?.coords?.accuracy > POOR_GPS_ACCURACY_THRESHOLD_METERS) {
    return 'poor_accuracy';
  }
  if ((trackingActive || locationDetecting) && currentPosition) {
    return 'active';
  }
  if (trackingActive) {
    return 'acquiring';
  }
  return 'inactive';
}

export function gpsHealthLabel(status) {
  const labels = {
    unsupported: 'GPS not supported',
    permission_denied: 'Location permission denied',
    error: 'GPS error',
    detecting: 'Detecting GPS…',
    acquiring: 'Acquiring GPS…',
    active: 'GPS active',
    poor_accuracy: 'Poor GPS accuracy',
    inactive: 'GPS inactive'
  };
  return labels[status] ?? 'GPS unknown';
}

export function gpsHealthSeverity(status) {
  if (status === 'active') return 'success';
  if (status === 'detecting' || status === 'acquiring' || status === 'inactive') return 'default';
  if (status === 'poor_accuracy') return 'warning';
  return 'error';
}

export function isPoorGpsAccuracy(accuracyMeters) {
  return accuracyMeters != null && accuracyMeters > POOR_GPS_ACCURACY_THRESHOLD_METERS;
}
