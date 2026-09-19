import { unwrapPaginatedEnvelope } from '../datasources/authMonitoringService';

export class AuthMonitoringRepository {
  constructor(service) {
    this.service = service;
  }

  buildAuditLogQueryParams(filters, page, perPage) {
    return {
      action: filters.action !== 'all' ? filters.action : undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      email: filters.email?.trim() || undefined,
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      page: page + 1,
      per_page: perPage
    };
  }

  buildSessionQueryParams(filters, page, perPage) {
    return {
      user_id: filters.userId || undefined,
      page: page + 1,
      per_page: perPage
    };
  }

  async getAuditLogs(params) {
    const envelope = await this.service.getAuditLogs(params);
    const { rows, meta } = unwrapPaginatedEnvelope(envelope);
    return {
      logs: rows,
      pagination: {
        total: meta.total,
        page: meta.currentPage,
        perPage: meta.perPage,
        lastPage: meta.lastPage
      }
    };
  }

  async getSessions(params) {
    const envelope = await this.service.getSessions(params);
    const { rows, meta } = unwrapPaginatedEnvelope(envelope);
    return {
      sessions: rows,
      pagination: {
        total: meta.total,
        page: meta.currentPage,
        perPage: meta.perPage,
        lastPage: meta.lastPage
      }
    };
  }

  revokeSession(sessionId) {
    return this.service.revokeSession(sessionId);
  }

  logoutAllSessions() {
    return this.service.logoutAllSessions();
  }
}
