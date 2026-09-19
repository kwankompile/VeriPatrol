import { describe, expect, it } from 'vitest';

import { DashboardRepository } from '../repositories/DashboardRepository';
import { ROLES } from 'utils/auth';

describe('DashboardRepository', () => {
  const repository = new DashboardRepository({});

  it('normalizes missing response safely', () => {
    const normalized = repository.normalizeSummary(null);
    expect(normalized).toEqual({
      role: null,
      generatedAt: null,
      timezone: 'Asia/Kuala_Lumpur',
      summary: expect.objectContaining({
        totalUsers: 0,
        activePatrols: 0,
        cameraHealth: { online: 0, recentlySeen: 0, offline: 0, inactive: 0, total: 0 }
      }),
      sections: expect.objectContaining({
        recentAnprEvents: [],
        activePatrolSessions: [],
        patrolSessionsNeedingReview: []
      }),
      actions: []
    });
  });

  it('normalizes admin payload and actions', () => {
    const normalized = repository.normalizeSummary({
      role: ROLES.ADMIN,
      generated_at: '2026-07-02T10:00:00+08:00',
      timezone: 'Asia/Kuala_Lumpur',
      summary: {
        total_users: 5,
        active_patrols: 2,
        patrols_needing_review: 1,
        today_anpr_detections: 10,
        flagged_anpr_detections: 2,
        camera_health: { online: 3, recently_seen: 1, offline: 0, inactive: 1, total: 5 },
        blockchain: { pending: 1, queued: 0, processing: 0, submitted: 1, failed: 0, confirmed: 4, in_flight: 2, network: 'ganache', enabled: true },
        auth_alerts: { failed_attempts_24h: 3, suspicious_events_24h: 1 }
      },
      sections: {
        recent_anpr_events: [
          {
            id: 'e1',
            plate_number: 'ABC1234',
            confidence: 0.91,
            detection_time: '2026-07-02T09:00:00+08:00',
            camera_name: 'Gate Cam',
            vehicle_type: 'motorcycle',
            status: 'flagged',
            plate_image_url: 'https://api.test/api/anpr-images/img-1/file',
            is_flagged: true,
            is_valid: true
          }
        ],
        active_patrol_sessions: [
          {
            id: 'p1',
            guard_name: 'Guard A',
            zone_name: 'Zone 1',
            started_at: '2026-07-02T08:00:00+08:00',
            status: 'active',
            checkpoint_progress: { completed: 2, total: 5 }
          }
        ],
        active_patrol_locations: [
          { session_id: 'p1', guard_name: 'Guard A', zone_name: 'Zone 1', latitude: 3.15, longitude: 101.65, recorded_at: null }
        ],
        patrol_sessions_needing_review: [],
        auth_alerts: [{ id: 'a1', event_type: 'login.rate_limited', status: 'blocked', email: 'x@y.z', occurred_at: null, severity: 'high' }]
      }
    });

    expect(normalized.summary.totalUsers).toBe(5);
    expect(normalized.summary.blockchain.inFlight).toBe(2);
    expect(normalized.summary.blockchain.network).toBe('ganache');
    expect(normalized.summary.blockchain.enabled).toBe(true);
    expect(normalized.sections.recentAnprEvents[0].plateNumber).toBe('ABC1234');
    expect(normalized.sections.recentAnprEvents[0].vehicleType).toBe('motorcycle');
    expect(normalized.sections.recentAnprEvents[0].status).toBe('flagged');
    expect(normalized.sections.recentAnprEvents[0].plateImageUrl).toContain('/anpr-images/');
    expect(normalized.sections.activePatrolSessions[0].checkpointProgress).toEqual({ completed: 2, total: 5 });
    expect(normalized.sections.activePatrolLocations[0]).toMatchObject({ sessionId: 'p1', latitude: 3.15, longitude: 101.65 });
    expect(normalized.sections.authAlerts.recent[0].severity).toBe('high');
    expect(normalized.actions.some((action) => action.id === 'user-management')).toBe(true);
    expect(normalized.actions.some((action) => action.id === 'blockchain-monitoring')).toBe(true);
  });

  it('normalizes operator payload without admin actions', () => {
    const normalized = repository.normalizeSummary({
      role: ROLES.SECURITY_OPERATOR,
      summary: { active_patrols: 1 },
      sections: {}
    });

    expect(normalized.actions).toHaveLength(2);
    expect(normalized.actions.some((action) => action.id === 'user-management')).toBe(false);
    expect(normalized.actions.some((action) => action.id === 'patrol-monitoring')).toBe(true);
  });

  it('normalizes guard payload with patrol actions only', () => {
    const normalized = repository.normalizeSummary({
      role: ROLES.GUARD,
      summary: {
        has_active_patrol: true,
        active_patrol_session_id: 'p1',
        today_patrol_status: 'active',
        readiness: { message: 'Resume patrol' }
      },
      sections: {
        active_patrol: {
          id: 'p1',
          guard_name: 'Guard A',
          zone_name: 'Zone 1',
          started_at: '2026-07-02T08:00:00+08:00',
          status: 'active'
        }
      }
    });

    expect(normalized.summary.hasActivePatrol).toBe(true);
    expect(normalized.sections.activePatrol.id).toBe('p1');
    expect(normalized.actions).toEqual([{ id: 'patrol', label: 'Start / Resume Patrol', path: '/patrol' }]);
  });
});
