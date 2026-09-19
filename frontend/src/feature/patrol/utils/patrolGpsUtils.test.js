import { describe, expect, it, vi } from 'vitest';

vi.mock('pwa/geolocationService', () => ({
  isGeolocationSupported: () => true
}));

import { deriveGpsHealthStatus, gpsHealthLabel, isPoorGpsAccuracy, POOR_GPS_ACCURACY_THRESHOLD_METERS } from './patrolGpsUtils';

describe('patrolGpsUtils', () => {
  it('reports permission denied from gps error code', () => {
    expect(
      deriveGpsHealthStatus({
        trackingActive: true,
        currentPosition: null,
        gpsError: { code: 1, message: 'denied' }
      })
    ).toBe('permission_denied');
    expect(gpsHealthLabel('permission_denied')).toContain('denied');
  });

  it('reports poor accuracy when fix exceeds threshold', () => {
    expect(
      deriveGpsHealthStatus({
        trackingActive: true,
        currentPosition: { coords: { accuracy: 120 } },
        gpsError: null
      })
    ).toBe('poor_accuracy');
  });

  it('reports active when tracking with good fix', () => {
    expect(
      deriveGpsHealthStatus({
        trackingActive: true,
        currentPosition: { coords: { accuracy: 12 } },
        gpsError: null
      })
    ).toBe('active');
  });

  it('reports detecting during pre-patrol warm-up', () => {
    expect(
      deriveGpsHealthStatus({
        trackingActive: false,
        locationDetecting: true,
        currentPosition: null,
        gpsError: null
      })
    ).toBe('detecting');
    expect(gpsHealthLabel('detecting')).toContain('Detecting');
  });

  it('exposes poor GPS threshold helper', () => {
    expect(POOR_GPS_ACCURACY_THRESHOLD_METERS).toBe(75);
    expect(isPoorGpsAccuracy(120)).toBe(true);
    expect(isPoorGpsAccuracy(14)).toBe(false);
    expect(isPoorGpsAccuracy(null)).toBe(false);
  });
});
