import { describe, expect, it, vi } from 'vitest';

import {
  resolveCheckpointRealtimeUpdate,
  handleMonitoringRealtimeEvent,
  handleSessionRealtimeEvent
} from '../controllers/patrolRealtimeHandlers';

vi.mock('services/realtime/patrolRealtimeNotifier', () => ({
  emitPatrolRealtimeNotification: vi.fn()
}));

import { emitPatrolRealtimeNotification } from 'services/realtime/patrolRealtimeNotifier';

describe('resolveCheckpointRealtimeUpdate', () => {
  it('increments suspicious stats only for suspicious status', () => {
    const update = resolveCheckpointRealtimeUpdate('suspicious');
    expect(update.increment).toEqual({ suspiciousEvents: 1 });
    expect(update.message).toBe('Suspicious checkpoint detected.');
    expect(update.severity).toBe('warning');
  });

  it('increments needs review stats for needs_review and legacy uncertain', () => {
    expect(resolveCheckpointRealtimeUpdate('needs_review').increment).toEqual({ needsReviewEvents: 1 });
    expect(resolveCheckpointRealtimeUpdate('needs_review').message).toBe('Checkpoint needs review.');
    expect(resolveCheckpointRealtimeUpdate('uncertain').increment).toEqual({ needsReviewEvents: 1 });
  });

  it('uses softer copy for partial evidence without suspicious counter', () => {
    const update = resolveCheckpointRealtimeUpdate('partial');
    expect(update.increment).toEqual({});
    expect(update.message).toBe('Partial checkpoint evidence recorded.');
    expect(update.severity).toBe('info');
  });
});

describe('handleMonitoringRealtimeEvent', () => {
  it('does not inject PatrolSessionStarted into the visible sessions list', () => {
    const setSessions = vi.fn();
    const loadSessions = vi.fn();
    const loadStats = vi.fn();
    const setStats = vi.fn((updater) => updater({ total: 1, active: 0, completed: 1, aborted: 0 }));

    handleMonitoringRealtimeEvent(
      {
        name: 'PatrolSessionStarted',
        payload: { session: { id: 'active-1', status: 'active', user: { name: 'Other Guard' } } }
      },
      {
        setSessions,
        setStats,
        setSummariesBySessionId: vi.fn(),
        loadStats,
        loadSessions
      }
    );

    expect(setSessions).not.toHaveBeenCalled();
    expect(loadStats).toHaveBeenCalled();
    expect(loadSessions).toHaveBeenCalled();
  });

  it('reloads sessions on PatrolSessionCompleted instead of upserting into the current view', () => {
    const setSessions = vi.fn();
    const loadSessions = vi.fn();
    const loadStats = vi.fn();
    const setStats = vi.fn((updater) => updater({ total: 2, active: 1, completed: 0, aborted: 0 }));

    handleMonitoringRealtimeEvent(
      {
        name: 'PatrolSessionCompleted',
        payload: { session: { id: 'active-1', status: 'completed' }, status: 'completed' }
      },
      {
        setSessions,
        setStats,
        setSummariesBySessionId: vi.fn(),
        loadStats,
        loadSessions
      }
    );

    expect(setSessions).not.toHaveBeenCalled();
    expect(loadStats).toHaveBeenCalled();
    expect(loadSessions).toHaveBeenCalled();
  });

  it('reloads stats and sessions on PatrolValidationCompleted', () => {
    const loadSessions = vi.fn();
    const loadStats = vi.fn();

    handleMonitoringRealtimeEvent(
      {
        name: 'PatrolValidationCompleted',
        payload: {
          patrol_session_id: 'session-1',
          refresh: { summary: true, checkpoint_events: true, session: true }
        }
      },
      {
        setSessions: vi.fn(),
        setStats: vi.fn(),
        setSummariesBySessionId: vi.fn(),
        loadStats,
        loadSessions
      }
    );

    expect(emitPatrolRealtimeNotification).toHaveBeenCalledWith({
      severity: 'info',
      message: 'Patrol validation completed.'
    });
    expect(loadStats).toHaveBeenCalled();
    expect(loadSessions).toHaveBeenCalled();
  });
});

describe('handleSessionRealtimeEvent PatrolValidationCompleted', () => {
  const patrolSessionId = 'session-1';

  function createHandlers() {
    return {
      setSession: vi.fn(),
      setPatrolRoutes: vi.fn(),
      setCheckpointEvents: vi.fn(),
      setValidationResult: vi.fn(),
      setSummary: vi.fn(),
      loadSummary: vi.fn(),
      loadCheckpointEvents: vi.fn(),
      loadSession: vi.fn(),
      queueRoutePoint: vi.fn()
    };
  }

  it('refreshes summary, checkpoint events, and session with only refresh metadata', () => {
    const handlers = createHandlers();

    handleSessionRealtimeEvent(
      {
        name: 'PatrolValidationCompleted',
        payload: {
          patrol_session_id: patrolSessionId,
          refresh: { summary: true, checkpoint_events: true, session: true }
        }
      },
      patrolSessionId,
      handlers
    );

    expect(emitPatrolRealtimeNotification).toHaveBeenCalled();
    expect(handlers.loadSummary).toHaveBeenCalled();
    expect(handlers.loadCheckpointEvents).toHaveBeenCalled();
    expect(handlers.loadSession).toHaveBeenCalled();
    expect(handlers.setValidationResult).not.toHaveBeenCalled();
  });

  it('refreshes data and skips setValidationResult for compact validation summary', () => {
    const handlers = createHandlers();

    handleSessionRealtimeEvent(
      {
        name: 'PatrolValidationCompleted',
        payload: {
          patrol_session_id: patrolSessionId,
          validation: {
            status: 'completed',
            overall_status: null,
            confidence_score: null,
            validated_at: '2026-07-11T00:00:00Z'
          },
          refresh: { summary: true, checkpoint_events: true, session: true }
        }
      },
      patrolSessionId,
      handlers
    );

    expect(emitPatrolRealtimeNotification).toHaveBeenCalled();
    expect(handlers.loadSummary).toHaveBeenCalled();
    expect(handlers.loadCheckpointEvents).toHaveBeenCalled();
    expect(handlers.loadSession).toHaveBeenCalled();
    expect(handlers.setValidationResult).not.toHaveBeenCalled();
  });

  it('refreshes data when validation property is absent', () => {
    const handlers = createHandlers();

    handleSessionRealtimeEvent(
      {
        name: 'PatrolValidationCompleted',
        payload: { patrol_session_id: patrolSessionId }
      },
      patrolSessionId,
      handlers
    );

    expect(emitPatrolRealtimeNotification).toHaveBeenCalled();
    expect(handlers.loadSummary).toHaveBeenCalled();
    expect(handlers.loadCheckpointEvents).toHaveBeenCalled();
    expect(handlers.loadSession).toHaveBeenCalled();
    expect(handlers.setValidationResult).not.toHaveBeenCalled();
  });
});
