import { ROLES } from 'utils/auth';

const DEFAULT_TIMEZONE = 'Asia/Kuala_Lumpur';

const ADMIN_ACTIONS = [
  { id: 'patrol-monitoring', label: 'Patrol Monitoring', path: '/admin/patrol-monitoring' },
  { id: 'anpr-monitoring', label: 'ANPR Monitoring', path: '/admin/anpr-monitoring' },
  { id: 'camera-management', label: 'Camera Management', path: '/admin/management-camera' },
  { id: 'vehicle-management', label: 'Vehicle Management', path: '/admin/management-vehicle' },
  { id: 'blockchain-monitoring', label: 'Blockchain Monitoring', path: '/admin/blockchain-monitoring' },
  { id: 'auth-monitoring', label: 'Auth Monitoring', path: '/admin/auth-monitoring' },
  { id: 'user-management', label: 'User Management', path: '/admin/management-user' }
];

const OPERATOR_ACTIONS = [
  { id: 'patrol-monitoring', label: 'Patrol Monitoring', path: '/admin/patrol-monitoring' },
  { id: 'anpr-monitoring', label: 'ANPR Monitoring', path: '/admin/anpr-monitoring' }
];

const GUARD_ACTIONS = [{ id: 'patrol', label: 'Start / Resume Patrol', path: '/patrol' }];

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAnprEvent(event) {
  if (!event || typeof event !== 'object') return null;
  return {
    id: event.id ?? null,
    plateNumber: event.plate_number ?? '—',
    confidence: event.confidence ?? null,
    detectionTime: event.detection_time ?? null,
    cameraName: event.camera_name ?? '—',
    vehicleType: event.vehicle_type ?? null,
    status: event.status ?? (event.is_flagged ? 'flagged' : event.is_valid ? 'valid' : 'unknown'),
    plateImageUrl: event.plate_image_url ?? null,
    isFlagged: Boolean(event.is_flagged),
    isValid: event.is_valid
  };
}

function normalizeCheckpointProgress(progress) {
  if (!progress || typeof progress !== 'object') return null;
  const completed = toNumber(progress.completed);
  const total = toNumber(progress.total);
  if (total <= 0) return null;
  return { completed, total };
}

function normalizePatrolSession(session) {
  if (!session || typeof session !== 'object') return null;
  return {
    id: session.id ?? null,
    guardName: session.guard_name ?? '—',
    zoneName: session.zone_name ?? '—',
    startedAt: session.started_at ?? null,
    endedAt: session.ended_at ?? null,
    status: session.status ?? 'unknown',
    checkpointProgress: normalizeCheckpointProgress(session.checkpoint_progress),
    attentionLabel: session.attention_label ?? null
  };
}

function normalizePatrolLocation(location) {
  if (!location || typeof location !== 'object') return null;
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    sessionId: location.session_id ?? null,
    guardName: location.guard_name ?? '—',
    zoneName: location.zone_name ?? '—',
    latitude: lat,
    longitude: lng,
    recordedAt: location.recorded_at ?? null
  };
}

function normalizeCameraHealth(health) {
  if (!health || typeof health !== 'object') {
    return { online: 0, recentlySeen: 0, offline: 0, inactive: 0, total: 0 };
  }
  return {
    online: toNumber(health.online),
    recentlySeen: toNumber(health.recently_seen),
    offline: toNumber(health.offline),
    inactive: toNumber(health.inactive),
    total: toNumber(health.total)
  };
}

function normalizeBlockchainHealth(blockchain) {
  if (!blockchain || typeof blockchain !== 'object') {
    return {
      pending: 0,
      queued: 0,
      processing: 0,
      submitted: 0,
      failed: 0,
      confirmed: 0,
      inFlight: 0,
      network: null,
      enabled: false
    };
  }
  return {
    pending: toNumber(blockchain.pending),
    queued: toNumber(blockchain.queued),
    processing: toNumber(blockchain.processing),
    submitted: toNumber(blockchain.submitted),
    failed: toNumber(blockchain.failed),
    confirmed: toNumber(blockchain.confirmed),
    inFlight: toNumber(blockchain.in_flight),
    network: blockchain.network ?? null,
    enabled: Boolean(blockchain.enabled)
  };
}

function normalizeAuthAlerts(summary, recent) {
  const safeSummary = summary && typeof summary === 'object' ? summary : {};
  return {
    failedAttempts24h: toNumber(safeSummary.failed_attempts_24h),
    suspiciousEvents24h: toNumber(safeSummary.suspicious_events_24h),
    recent: Array.isArray(recent)
      ? recent.map((row) => ({
          id: row?.id ?? null,
          eventType: row?.event_type ?? '—',
          status: row?.status ?? '—',
          email: row?.email ?? '—',
          occurredAt: row?.occurred_at ?? null,
          severity: row?.severity ?? 'medium'
        }))
      : []
  };
}

function resolveActions(role) {
  if (role === ROLES.ADMIN) return ADMIN_ACTIONS;
  if (role === ROLES.SECURITY_OPERATOR) return OPERATOR_ACTIONS;
  if (role === ROLES.GUARD) return GUARD_ACTIONS;
  return [];
}

export class DashboardRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  assertSuccess(envelope, fallbackMessage) {
    if (envelope?.success === false) {
      throw new Error(envelope?.message || fallbackMessage);
    }
    return envelope;
  }

  async getSummary() {
    const envelope = this.assertSuccess(
      await this.dataSource.getDashboardSummary(),
      'Failed to load dashboard summary'
    );
    return this.normalizeSummary(envelope?.data ?? null);
  }

  normalizeSummary(data) {
    if (!data || typeof data !== 'object') {
      return {
        role: null,
        generatedAt: null,
        timezone: DEFAULT_TIMEZONE,
        summary: {
          totalUsers: 0,
          activePatrols: 0,
          patrolsNeedingReview: 0,
          todayAnprDetections: 0,
          flaggedAnprDetections: 0,
          cameraHealth: normalizeCameraHealth(null),
          blockchain: normalizeBlockchainHealth(null),
          authAlerts: normalizeAuthAlerts(null, []),
          hasActivePatrol: false,
          activePatrolSessionId: null,
          todayPatrolCount: 0,
          todayPatrolStatus: 'unknown',
          readiness: {}
        },
        sections: {
          recentAnprEvents: [],
          activePatrolSessions: [],
          activePatrolLocations: [],
          patrolSessionsNeedingReview: [],
          activePatrol: null,
          todayPatrolSessions: [],
          recentPatrolSessions: [],
          cameraHealth: normalizeCameraHealth(null),
          blockchainHealth: normalizeBlockchainHealth(null),
          authAlerts: normalizeAuthAlerts(null, [])
        },
        actions: []
      };
    }

    const role = data.role ?? null;
    const summary = data.summary && typeof data.summary === 'object' ? data.summary : {};
    const sections = data.sections && typeof data.sections === 'object' ? data.sections : {};

    return {
      role,
      generatedAt: data.generated_at ?? null,
      timezone: data.timezone ?? DEFAULT_TIMEZONE,
      summary: {
        totalUsers: toNumber(summary.total_users),
        activePatrols: toNumber(summary.active_patrols),
        patrolsNeedingReview: toNumber(summary.patrols_needing_review),
        todayAnprDetections: toNumber(summary.today_anpr_detections),
        flaggedAnprDetections: toNumber(summary.flagged_anpr_detections),
        cameraHealth: normalizeCameraHealth(summary.camera_health ?? sections.camera_health),
        blockchain: normalizeBlockchainHealth(summary.blockchain ?? sections.blockchain_health),
        authAlerts: normalizeAuthAlerts(summary.auth_alerts, sections.auth_alerts),
        hasActivePatrol: Boolean(summary.has_active_patrol),
        activePatrolSessionId: summary.active_patrol_session_id ?? null,
        todayPatrolCount: toNumber(summary.today_patrol_count),
        todayPatrolStatus: summary.today_patrol_status ?? 'unknown',
        readiness: summary.readiness && typeof summary.readiness === 'object' ? summary.readiness : {}
      },
      sections: {
        recentAnprEvents: (Array.isArray(sections.recent_anpr_events) ? sections.recent_anpr_events : [])
          .map(normalizeAnprEvent)
          .filter(Boolean),
        activePatrolSessions: (Array.isArray(sections.active_patrol_sessions) ? sections.active_patrol_sessions : [])
          .map(normalizePatrolSession)
          .filter(Boolean),
        activePatrolLocations: (Array.isArray(sections.active_patrol_locations) ? sections.active_patrol_locations : [])
          .map(normalizePatrolLocation)
          .filter(Boolean),
        patrolSessionsNeedingReview: (
          Array.isArray(sections.patrol_sessions_needing_review) ? sections.patrol_sessions_needing_review : []
        )
          .map(normalizePatrolSession)
          .filter(Boolean),
        activePatrol: normalizePatrolSession(sections.active_patrol),
        todayPatrolSessions: (Array.isArray(sections.today_patrol_sessions) ? sections.today_patrol_sessions : [])
          .map(normalizePatrolSession)
          .filter(Boolean),
        recentPatrolSessions: (Array.isArray(sections.recent_patrol_sessions) ? sections.recent_patrol_sessions : [])
          .map(normalizePatrolSession)
          .filter(Boolean),
        cameraHealth: normalizeCameraHealth(sections.camera_health),
        blockchainHealth: normalizeBlockchainHealth(sections.blockchain_health),
        authAlerts: normalizeAuthAlerts(summary.auth_alerts, sections.auth_alerts)
      },
      actions: resolveActions(role)
    };
  }
}
