import { deriveOperationalStatus, maskRtspUrl, parseOptionalInteger, parseOptionalNumber } from '../utils/cameraValidation';

const SENSITIVE_CAMERA_KEYS = new Set([
  'password',
  'password_hash',
  'access_token',
  'token',
  'username',
  'ip_address',
  'port'
]);

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const formatResolution = (width, height) => {
  if (!width && !height) return '—';
  if (width && height) return `${width} × ${height}`;
  return String(width || height);
};

const formatCoordinates = (latitude, longitude) => {
  if (latitude == null && longitude == null) return '—';
  if (latitude == null || longitude == null) return '—';
  return `${latitude}, ${longitude}`;
};

export class CameraManagementRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  assertSuccess(envelope, fallbackMessage) {
    if (envelope?.success === false) {
      throw new Error(envelope?.message || fallbackMessage);
    }
    return envelope;
  }

  sanitizeCameraSource(camera) {
    if (!camera || typeof camera !== 'object') return {};
    const safe = { ...camera };
    SENSITIVE_CAMERA_KEYS.forEach((key) => {
      delete safe[key];
    });
    return safe;
  }

  normalizeCamera(camera) {
    const source = this.sanitizeCameraSource(camera);
    if (!source || typeof source !== 'object' || !source.id) return null;

    const rtspUrlMasked = source.rtsp_url_masked || maskRtspUrl(source.rtsp_url) || null;
    const operationalStatus = deriveOperationalStatus(source.last_seen_at);

    return {
      id: source.id,
      name: source.name ?? '—',
      email: source.email ?? '—',
      credentialEnabled: Boolean(source.credential_enabled),
      isActive: Boolean(source.is_active),
      location: source.location ?? null,
      rtspUrlMasked: rtspUrlMasked || '—',
      rtspReportedAt: source.rtsp_reported_at ?? null,
      lastLoginAt: source.last_login_at ?? null,
      lastSeenAt: source.last_seen_at ?? null,
      credentialRotatedAt: source.credential_rotated_at ?? null,
      latitude: source.latitude ?? null,
      longitude: source.longitude ?? null,
      resolutionWidth: source.resolution_width ?? null,
      resolutionHeight: source.resolution_height ?? null,
      createdAt: source.created_at ?? null,
      updatedAt: source.updated_at ?? null,
      formattedRtspReportedAt: formatDateTime(source.rtsp_reported_at),
      formattedLastLoginAt: formatDateTime(source.last_login_at),
      formattedLastSeenAt: formatDateTime(source.last_seen_at),
      formattedCredentialRotatedAt: formatDateTime(source.credential_rotated_at),
      formattedCreatedAt: formatDateTime(source.created_at),
      formattedUpdatedAt: formatDateTime(source.updated_at),
      formattedResolution: formatResolution(source.resolution_width, source.resolution_height),
      formattedCoordinates: formatCoordinates(source.latitude, source.longitude),
      operationalStatusLabel: operationalStatus.label,
      operationalStatusColor: operationalStatus.color
    };
  }

  unwrapPaginatedEnvelope(envelope) {
    const payload = envelope?.data ?? envelope;

    if (payload && typeof payload === 'object' && Array.isArray(payload.data) && ('current_page' in payload || 'meta' in payload)) {
      const nestedMeta = payload.meta ?? {};
      return {
        rows: payload.data,
        isServerPaginated: true,
        meta: {
          total: payload.total ?? nestedMeta.total ?? payload.data.length,
          currentPage: payload.current_page ?? nestedMeta.current_page ?? 1,
          lastPage: payload.last_page ?? nestedMeta.last_page ?? 1,
          perPage: payload.per_page ?? nestedMeta.per_page ?? payload.data.length
        }
      };
    }

    if (Array.isArray(payload)) {
      return {
        rows: payload,
        isServerPaginated: false,
        meta: {
          total: payload.length,
          currentPage: 1,
          lastPage: 1,
          perPage: payload.length
        }
      };
    }

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return {
      rows,
      isServerPaginated: false,
      meta: {
        total: rows.length,
        currentPage: 1,
        lastPage: 1,
        perPage: rows.length
      }
    };
  }

  async getCameras(params = {}) {
    const envelope = this.assertSuccess(await this.dataSource.getCameras(params), 'Failed to load cameras');
    const { rows, meta, isServerPaginated } = this.unwrapPaginatedEnvelope(envelope);

    return {
      cameras: rows.map((row) => this.normalizeCamera(row)).filter(Boolean),
      pagination: {
        total: meta.total,
        page: meta.currentPage,
        perPage: meta.perPage,
        lastPage: meta.lastPage
      },
      isServerPaginated
    };
  }

  async getCameraById(id) {
    const envelope = this.assertSuccess(await this.dataSource.getCameraById(id), 'Failed to load camera');
    return this.normalizeCamera(envelope?.data ?? null);
  }

  async createCamera(payload) {
    const envelope = this.assertSuccess(await this.dataSource.createCamera(payload), 'Failed to create camera');
    return this.normalizeCamera(envelope?.data ?? null);
  }

  async updateCamera(id, payload) {
    const envelope = this.assertSuccess(await this.dataSource.updateCamera(id, payload), 'Failed to update camera');
    return this.normalizeCamera(envelope?.data ?? null);
  }

  async deleteCamera(id) {
    await this.dataSource.deleteCamera(id);
    return true;
  }

  buildCreatePayload(form) {
    return {
      name: form.name?.trim() ?? '',
      email: form.email?.trim() ?? '',
      password: form.password ?? '',
      credential_enabled: Boolean(form.credentialEnabled),
      is_active: Boolean(form.isActive),
      location: form.location?.trim() || null,
      latitude: parseOptionalNumber(form.latitude),
      longitude: parseOptionalNumber(form.longitude),
      resolution_width: parseOptionalInteger(form.resolutionWidth),
      resolution_height: parseOptionalInteger(form.resolutionHeight)
    };
  }

  buildUpdatePayload(form) {
    const payload = {
      name: form.name?.trim() ?? '',
      email: form.email?.trim() ?? '',
      credential_enabled: Boolean(form.credentialEnabled),
      is_active: Boolean(form.isActive),
      location: form.location?.trim() || null,
      latitude: parseOptionalNumber(form.latitude),
      longitude: parseOptionalNumber(form.longitude),
      resolution_width: parseOptionalInteger(form.resolutionWidth),
      resolution_height: parseOptionalInteger(form.resolutionHeight)
    };

    const password = form.password?.trim();
    if (password) {
      payload.password = password;
    }

    return payload;
  }
}
