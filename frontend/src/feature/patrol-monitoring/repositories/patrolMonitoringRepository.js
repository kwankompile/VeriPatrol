import { unwrapPaginatedEnvelope } from '../datasources/patrolMonitoringService';
import { DEFAULT_ROUTE_PAGE_SIZE, fetchAllPatrolRoutePages } from '../utils/fetchAllPatrolRoutePages';

export class PatrolMonitoringRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async getPatrolSessions(params = {}) {
    const envelope = await this.dataSource.getPatrolSessions(params);
    if (envelope?.success === false) {
      throw new Error(envelope?.message || 'Failed to load patrol sessions');
    }
    return unwrapPaginatedEnvelope(envelope);
  }

  async getPatrolSessionById(id) {
    const envelope = await this.dataSource.getPatrolSessionById(id);
    if (envelope?.success === false) {
      throw new Error(envelope?.message || 'Failed to load patrol session');
    }
    return envelope?.data ?? null;
  }

  async getPatrolSummary(id) {
    const envelope = await this.dataSource.getPatrolSummary(id);
    if (envelope?.success === false) {
      throw new Error(envelope?.message || 'Failed to load patrol summary');
    }
    return envelope?.data ?? null;
  }

  async validatePatrolSession(id) {
    const envelope = await this.dataSource.validatePatrolSession(id);
    if (envelope?.success === false) {
      throw new Error(envelope?.message || 'Patrol validation failed');
    }
    return envelope?.data ?? null;
  }

  async getCheckpointEvents(params = {}) {
    const envelope = await this.dataSource.getCheckpointEvents(params);
    if (envelope?.success === false) {
      throw new Error(envelope?.message || 'Failed to load checkpoint events');
    }
    return unwrapPaginatedEnvelope(envelope);
  }

  /**
   * Load the complete drawable route for a session by walking every paginated page.
   * Partial later-page failures throw (never return page 1 as a complete route).
   *
   * @param {string} patrolSessionId
   * @param {{ perPage?: number, signal?: AbortSignal }} [options]
   */
  async getAllPatrolRoutes(patrolSessionId, options = {}) {
    if (!patrolSessionId) {
      throw new Error('Patrol session id is required to load routes');
    }

    const perPage = options.perPage ?? DEFAULT_ROUTE_PAGE_SIZE;

    return fetchAllPatrolRoutePages(
      async (page, pageSize) =>
        this.dataSource.getPatrolRoutes({
          patrol_session_id: patrolSessionId,
          per_page: pageSize,
          page,
          signal: options.signal
        }),
      {
        perPage,
        signal: options.signal
      }
    );
  }

  /**
   * @deprecated Prefer getAllPatrolRoutes — alias retained for existing callers.
   */
  async getPatrolRoutes(patrolSessionId, options = {}) {
    return this.getAllPatrolRoutes(patrolSessionId, options);
  }

  async getZones() {
    const zones = await this.dataSource.getZones();
    return Array.isArray(zones) ? zones : [];
  }

  /** Client-side filter for guard/zone text search on loaded rows. */
  filterSessionsBySearch(sessions, searchText) {
    const needle = String(searchText ?? '')
      .trim()
      .toLowerCase();
    if (!needle) {
      return sessions;
    }
    return sessions.filter((session) => {
      const guard = session?.user?.name ?? '';
      const zone = session?.zone?.name ?? '';
      return guard.toLowerCase().includes(needle) || zone.toLowerCase().includes(needle);
    });
  }
}
