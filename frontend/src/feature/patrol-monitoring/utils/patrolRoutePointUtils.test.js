import { describe, expect, it } from 'vitest';

import {
  mergeRoutePoints,
  normalizeRoutePoint,
  normalizeRoutePoints,
  sortRoutePoints
} from './patrolRoutePointUtils';
import { sortPatrolRoutes } from './patrolReplayUtils';

describe('patrolRoutePointUtils', () => {
  it('normalizes REST location-log route points', () => {
    const point = normalizeRoutePoint({
      id: 'log-1',
      patrol_session_id: 'session-1',
      latitude: '3.1390000',
      longitude: '101.6869000',
      accuracy: 12.5,
      recorded_at: '2026-05-20T10:00:00+08:00'
    });

    expect(point).toEqual({
      id: 'log-1',
      patrol_session_id: 'session-1',
      latitude: 3.139,
      longitude: 101.6869,
      accuracy: 12.5,
      recorded_at: '2026-05-20T10:00:00+08:00'
    });
  });

  it('appends compact realtime location points without losing fields', () => {
    const existing = normalizeRoutePoints([
      {
        id: 'log-1',
        patrol_session_id: 'session-1',
        latitude: 3.139,
        longitude: 101.686,
        accuracy: 8,
        recorded_at: '2026-05-20T10:00:00Z'
      }
    ]);

    const merged = mergeRoutePoints(existing, [
      {
        id: 'log-2',
        location_log_id: 'log-2',
        patrol_session_id: 'session-1',
        latitude: 3.14,
        longitude: 101.687,
        accuracy: 10.5,
        recorded_at: '2026-05-20T10:01:00Z'
      }
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[1].id).toBe('log-2');
  });

  it('does not duplicate a point received first by realtime then REST', () => {
    const realtime = normalizeRoutePoint({
      id: 'log-1',
      location_log_id: 'log-1',
      patrol_session_id: 'session-1',
      latitude: 3.139,
      longitude: 101.686,
      accuracy: 9,
      recorded_at: '2026-05-20T10:00:00Z'
    });

    const rest = normalizeRoutePoints([
      {
        id: 'log-1',
        patrol_session_id: 'session-1',
        latitude: 3.139,
        longitude: 101.686,
        accuracy: 9,
        recorded_at: '2026-05-20T10:00:00Z'
      }
    ]);

    expect(mergeRoutePoints([realtime], rest)).toHaveLength(1);
  });

  it('sorts out-of-order offline points by recorded_at', () => {
    const sorted = sortRoutePoints([
      {
        id: 'b',
        patrol_session_id: 's',
        latitude: 3.14,
        longitude: 101.69,
        accuracy: null,
        recorded_at: '2026-05-20T10:05:00Z'
      },
      {
        id: 'a',
        patrol_session_id: 's',
        latitude: 3.139,
        longitude: 101.686,
        accuracy: null,
        recorded_at: '2026-05-20T10:00:00Z'
      }
    ]);

    expect(sorted.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('handles empty and single-point routes', () => {
    expect(normalizeRoutePoints([])).toEqual([]);
    expect(
      normalizeRoutePoints([
        {
          id: 'only',
          patrol_session_id: 's',
          latitude: 1,
          longitude: 2,
          accuracy: null,
          recorded_at: '2026-05-20T10:00:00Z'
        }
      ])
    ).toHaveLength(1);
  });

  it('ignores invalid coordinates safely', () => {
    expect(
      normalizeRoutePoints([
        { id: 'bad', latitude: 999, longitude: 1, recorded_at: '2026-05-20T10:00:00Z' },
        { id: 'good', latitude: 3.1, longitude: 101.6, recorded_at: '2026-05-20T10:00:00Z' }
      ])
    ).toHaveLength(1);
  });

  it('supports legacy API responses during transition', () => {
    const point = normalizeRoutePoint({
      id: 'route-legacy',
      patrol_session_id: 'session-1',
      latitude: 3.2,
      longitude: 101.7,
      accuracy: null,
      altitude: 12,
      recorded_at: '2026-05-20T10:00:00+08:00',
      created_at: '2026-05-20T10:00:01+08:00'
    });

    expect(point?.id).toBe('route-legacy');
    expect(point?.latitude).toBe(3.2);
  });

  it('restores missing points on reconnect/refetch merge', () => {
    const liveOnly = normalizeRoutePoints([
      {
        id: 'log-2',
        patrol_session_id: 's',
        latitude: 3.14,
        longitude: 101.687,
        accuracy: 5,
        recorded_at: '2026-05-20T10:01:00Z'
      }
    ]);

    const refetch = normalizeRoutePoints([
      {
        id: 'log-1',
        patrol_session_id: 's',
        latitude: 3.139,
        longitude: 101.686,
        accuracy: 5,
        recorded_at: '2026-05-20T10:00:00Z'
      },
      {
        id: 'log-2',
        patrol_session_id: 's',
        latitude: 3.14,
        longitude: 101.687,
        accuracy: 5,
        recorded_at: '2026-05-20T10:01:00Z'
      }
    ]);

    const merged = mergeRoutePoints(liveOnly, refetch);
    expect(merged.map((p) => p.id)).toEqual(['log-1', 'log-2']);
  });

  it('patrol replay uses the same normalized sort source', () => {
    const points = [
      {
        id: '2',
        patrol_session_id: 's',
        latitude: 1,
        longitude: 2,
        accuracy: null,
        recorded_at: '2026-05-20T10:02:00Z'
      },
      {
        id: '1',
        patrol_session_id: 's',
        latitude: 1,
        longitude: 2,
        accuracy: null,
        recorded_at: '2026-05-20T10:01:00Z'
      }
    ];

    expect(sortPatrolRoutes(points).map((p) => p.id)).toEqual(['1', '2']);
    expect(sortRoutePoints(points).map((p) => p.id)).toEqual(['1', '2']);
  });
});
