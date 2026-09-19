import { describe, expect, it, vi } from 'vitest';

import { PatrolMonitoringRepository } from '../repositories/patrolMonitoringRepository';
import { fetchAllPatrolRoutePages, unwrapRoutePageEnvelope } from './fetchAllPatrolRoutePages';
import { mergeRoutePoints } from './patrolRoutePointUtils';

function pageEnvelope(page, lastPage, rows, perPage = 2) {
  return {
    success: true,
    message: 'ok',
    data: {
      data: rows,
      meta: {
        current_page: page,
        last_page: lastPage,
        per_page: perPage,
        total: lastPage * perPage
      }
    }
  };
}

describe('fetchAllPatrolRoutePages', () => {
  it('fetches all three pages exactly once in chronological order', async () => {
    const pages = {
      1: pageEnvelope(1, 3, [
        {
          id: 'p1',
          patrol_session_id: 's',
          latitude: 1,
          longitude: 1,
          recorded_at: '2026-05-20T10:00:00Z'
        },
        {
          id: 'p2',
          patrol_session_id: 's',
          latitude: 1.1,
          longitude: 1.1,
          recorded_at: '2026-05-20T10:01:00Z'
        }
      ]),
      2: pageEnvelope(2, 3, [
        {
          id: 'p3',
          patrol_session_id: 's',
          latitude: 1.2,
          longitude: 1.2,
          recorded_at: '2026-05-20T10:02:00Z'
        },
        {
          id: 'p4',
          patrol_session_id: 's',
          latitude: 1.3,
          longitude: 1.3,
          recorded_at: '2026-05-20T10:03:00Z'
        }
      ]),
      3: pageEnvelope(3, 3, [
        {
          id: 'p5',
          patrol_session_id: 's',
          latitude: 1.4,
          longitude: 1.4,
          recorded_at: '2026-05-20T10:04:00Z'
        }
      ], 2)
    };

    const fetchPage = vi.fn(async (page) => pages[page]);
    const points = await fetchAllPatrolRoutePages(fetchPage, { perPage: 2 });

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(points.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('deduplicates ids that appear across page boundaries', async () => {
    const fetchPage = vi.fn(async (page) => {
      if (page === 1) {
        return pageEnvelope(1, 2, [
          {
            id: 'dup',
            patrol_session_id: 's',
            latitude: 1,
            longitude: 1,
            recorded_at: '2026-05-20T10:00:00Z'
          },
          {
            id: 'a',
            patrol_session_id: 's',
            latitude: 1.1,
            longitude: 1.1,
            recorded_at: '2026-05-20T10:01:00Z'
          }
        ]);
      }
      return pageEnvelope(2, 2, [
        {
          id: 'dup',
          patrol_session_id: 's',
          latitude: 1,
          longitude: 1,
          recorded_at: '2026-05-20T10:00:00Z'
        },
        {
          id: 'b',
          patrol_session_id: 's',
          latitude: 1.2,
          longitude: 1.2,
          recorded_at: '2026-05-20T10:02:00Z'
        }
      ]);
    });

    const points = await fetchAllPatrolRoutePages(fetchPage, { perPage: 2 });
    expect(points.map((p) => p.id)).toEqual(['dup', 'a', 'b']);
  });

  it('does not return page 1 as complete when a later page fails', async () => {
    const fetchPage = vi.fn(async (page) => {
      if (page === 1) {
        return pageEnvelope(1, 3, [
          {
            id: 'p1',
            patrol_session_id: 's',
            latitude: 1,
            longitude: 1,
            recorded_at: '2026-05-20T10:00:00Z'
          },
          {
            id: 'p2',
            patrol_session_id: 's',
            latitude: 1.1,
            longitude: 1.1,
            recorded_at: '2026-05-20T10:01:00Z'
          }
        ]);
      }
      throw new Error('network down on page 2');
    });

    await expect(fetchAllPatrolRoutePages(fetchPage, { perPage: 2 })).rejects.toThrow(
      /network down on page 2/
    );
  });

  it('stops safely on malformed pagination metadata without looping forever', async () => {
    const fetchPage = vi.fn(async () => ({
      success: true,
      data: {
        data: [
          {
            id: 'p1',
            patrol_session_id: 's',
            latitude: 1,
            longitude: 1,
            recorded_at: '2026-05-20T10:00:00Z'
          },
          {
            id: 'p2',
            patrol_session_id: 's',
            latitude: 1.1,
            longitude: 1.1,
            recorded_at: '2026-05-20T10:01:00Z'
          }
        ],
        meta: {
          current_page: 1,
          last_page: 0,
          per_page: 2,
          total: 100
        }
      }
    }));

    await expect(fetchAllPatrolRoutePages(fetchPage, { perPage: 2 })).rejects.toThrow(/malformed/i);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('keeps a realtime point that arrived during pagination in the merged final state', async () => {
    const fetchPage = vi.fn(async (page) => {
      if (page === 1) {
        return pageEnvelope(1, 2, [
          {
            id: 'p1',
            patrol_session_id: 's',
            latitude: 1,
            longitude: 1,
            recorded_at: '2026-05-20T10:00:00Z'
          },
          {
            id: 'p2',
            patrol_session_id: 's',
            latitude: 1.1,
            longitude: 1.1,
            recorded_at: '2026-05-20T10:01:00Z'
          }
        ]);
      }
      return pageEnvelope(2, 2, [
        {
          id: 'p3',
          patrol_session_id: 's',
          latitude: 1.2,
          longitude: 1.2,
          recorded_at: '2026-05-20T10:02:00Z'
        }
      ]);
    });

    const rest = await fetchAllPatrolRoutePages(fetchPage, { perPage: 2 });
    const realtime = {
      id: 'live-1',
      patrol_session_id: 's',
      latitude: 1.3,
      longitude: 1.3,
      accuracy: 5,
      recorded_at: '2026-05-20T10:03:00Z'
    };

    const merged = mergeRoutePoints(rest, [realtime]);
    expect(merged.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'live-1']);
  });
});

describe('PatrolMonitoringRepository.getAllPatrolRoutes', () => {
  it('walks every page through the datasource', async () => {
    const dataSource = {
      getPatrolRoutes: vi.fn(async ({ page }) =>
        pageEnvelope(
          page,
          2,
          [
            {
              id: `id-${page}`,
              patrol_session_id: 'session-1',
              latitude: page,
              longitude: page,
              recorded_at: `2026-05-20T10:0${page}:00Z`
            }
          ],
          1
        )
      )
    };

    const repository = new PatrolMonitoringRepository(dataSource);
    const points = await repository.getAllPatrolRoutes('session-1', { perPage: 1 });

    expect(dataSource.getPatrolRoutes).toHaveBeenCalledTimes(2);
    expect(dataSource.getPatrolRoutes.mock.calls.map((c) => c[0].page)).toEqual([1, 2]);
    expect(points.map((p) => p.id)).toEqual(['id-1', 'id-2']);
  });

  it('supports legacy fallback pagination envelopes for complete frontend routes', async () => {
    const dataSource = {
      getPatrolRoutes: vi.fn(async ({ page }) => ({
        success: true,
        data: {
          data: [
            {
              id: `legacy-${page}`,
              patrol_session_id: 'legacy-session',
              latitude: 3 + page * 0.01,
              longitude: 101,
              altitude: 10,
              recorded_at: `2026-05-20T11:0${page}:00+08:00`
            }
          ],
          meta: { current_page: page, last_page: 2, per_page: 1, total: 2 }
        }
      }))
    };

    const repository = new PatrolMonitoringRepository(dataSource);
    const points = await repository.getAllPatrolRoutes('legacy-session', { perPage: 1 });
    expect(points).toHaveLength(2);
    expect(points[0].id).toBe('legacy-1');
  });
});

describe('unwrapRoutePageEnvelope', () => {
  it('reads nested Laravel resource pagination meta', () => {
    const { rows, meta } = unwrapRoutePageEnvelope({
      success: true,
      data: {
        data: [{ id: '1' }],
        meta: { current_page: 2, last_page: 4, per_page: 500, total: 1205 }
      }
    });
    expect(rows).toHaveLength(1);
    expect(meta).toEqual({
      total: 1205,
      currentPage: 2,
      lastPage: 4,
      perPage: 500
    });
  });
});
