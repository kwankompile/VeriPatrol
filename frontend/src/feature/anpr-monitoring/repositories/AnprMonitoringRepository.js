import { unwrapPaginatedEnvelope } from '../datasources/anprMonitoringService';

const IMAGE_TYPE_ORDER = { full: 0, plate: 1, annotated: 2 };

const parseConfidence = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const formatDetectionTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
};

const resolvePreviewUrl = (image) => {
  if (!image || typeof image !== 'object') return null;

  const candidates = [image.url, image.image_url, image.public_url, image.file_url].filter(Boolean);

  for (const candidate of candidates) {
    const value = String(candidate).trim();
    if (!value) continue;
    if (/^https?:\/\//i.test(value)) return value;
  }

  return null;
};

const normalizeCamera = (camera) => {
  if (!camera || typeof camera !== 'object') return null;
  return {
    id: camera.id ?? null,
    name: camera.name ?? 'Unknown camera',
    location: camera.location ?? null,
    isActive: Boolean(camera.is_active),
    lastSeenAt: camera.last_seen_at ?? null
  };
};

const normalizeVehicle = (vehicle) => {
  if (!vehicle || typeof vehicle !== 'object') return null;
  const source = vehicle.source ?? null;
  return {
    id: vehicle.id ?? null,
    plateNumber: vehicle.plate_number ?? null,
    ownerName: vehicle.owner_name ?? null,
    vehicleType: vehicle.vehicle_type ?? null,
    status: vehicle.status ?? null,
    source,
    sourceLabel: source === 'auto_detected' ? 'Auto-detected' : source === 'manual' ? 'Manual' : source,
    notes: vehicle.notes ?? null,
    isAutoDetected: source === 'auto_detected'
  };
};

const normalizeBlockchainProof = (proof) => {
  if (!proof || typeof proof !== 'object') return null;

  return {
    id: proof.id ?? null,
    entityType: proof.entity_type ?? null,
    proofType: proof.proof_type ?? null,
    network: proof.network ?? null,
    environment: proof.environment ?? null,
    status: proof.status ?? null,
    txHash: proof.tx_hash ?? null,
    blockNumber: proof.block_number ?? null,
    confirmations: proof.confirmations ?? null,
    submittedAt: proof.submitted_at ?? null,
    confirmedAt: proof.confirmed_at ?? null,
    lastError: proof.last_error ?? null
  };
};

const normalizeImageBlockchainProofSummary = (summary) => {
  if (!summary || typeof summary !== 'object') return null;

  return {
    count: Number(summary.count ?? 0),
    confirmedCount: Number(summary.confirmed_count ?? 0),
    statuses: Array.isArray(summary.statuses) ? summary.statuses.map(String) : []
  };
};

const normalizeImage = (image) => {
  if (!image || typeof image !== 'object') return null;

  const imageType = String(image.image_type ?? '').toLowerCase();
  const previewUrl = resolvePreviewUrl(image);

  return {
    id: image.id ?? null,
    anprEventId: image.anpr_event_id ?? null,
    imageType,
    filePath: image.file_path ?? null,
    fileSize: image.file_size ?? null,
    resolution: image.resolution ?? null,
    expiresAt: image.expires_at ?? null,
    previewUrl,
    blockchainProof: normalizeBlockchainProof(image.blockchain_proof)
  };
};

const sortImages = (images) =>
  [...images].sort((a, b) => {
    const orderA = IMAGE_TYPE_ORDER[a.imageType] ?? 99;
    const orderB = IMAGE_TYPE_ORDER[b.imageType] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });

export class AnprMonitoringRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  assertSuccess(envelope, fallbackMessage) {
    if (envelope?.success === false) {
      throw new Error(envelope?.message || fallbackMessage);
    }
    return envelope;
  }

  buildListQueryParams(filters = {}, page = 0, rowsPerPage = 10) {
    const params = {
      page: page + 1,
      per_page: rowsPerPage,
      sort: 'detection_time',
      direction: 'desc'
    };

    const plateSearch = String(filters.plateSearch ?? '').trim();
    if (plateSearch) {
      params.plate_number = plateSearch;
    }

    if (filters.validity === 'valid') {
      params.is_valid = 1;
    } else if (filters.validity === 'invalid') {
      params.is_valid = 0;
    }

    if (filters.flagged === 'flagged') {
      params.is_flagged = 1;
    } else if (filters.flagged === 'unflagged') {
      params.is_flagged = 0;
    }

    return params;
  }

  async getAnprEvents(params = {}) {
    const envelope = this.assertSuccess(await this.dataSource.getAnprEvents(params), 'Failed to load ANPR events');
    const { rows, meta } = unwrapPaginatedEnvelope(envelope);
    return {
      events: rows.map((event) => this.normalizeEvent(event)),
      pagination: {
        total: meta.total,
        page: meta.currentPage,
        perPage: meta.perPage,
        lastPage: meta.lastPage
      }
    };
  }

  async getAnprEventById(id) {
    const envelope = this.assertSuccess(await this.dataSource.getAnprEventById(id), 'Failed to load ANPR event');
    return this.normalizeEvent(envelope?.data ?? null);
  }

  async getAnprImagesForEvent(anprEventId) {
    const envelope = this.assertSuccess(
      await this.dataSource.getAnprImages({ anpr_event_id: anprEventId, per_page: 100 }),
      'Failed to load ANPR images'
    );
    const { rows } = unwrapPaginatedEnvelope(envelope);
    return sortImages(rows.map((image) => normalizeImage(image)).filter(Boolean));
  }

  normalizeEvent(event) {
    if (!event || typeof event !== 'object') return null;

    const images = sortImages((Array.isArray(event.images) ? event.images : []).map((image) => normalizeImage(image)).filter(Boolean));

    const imageMap = images.reduce((acc, image) => {
      if (image.imageType) acc[image.imageType] = image;
      return acc;
    }, {});

    const confidence = parseConfidence(event.confidence);
    const imagesCountFromApi = Number(event.images_count);
    const evidenceCount =
      images.length > 0
        ? images.length
        : Number.isFinite(imagesCountFromApi)
          ? imagesCountFromApi
          : 0;

    return {
      id: event.id ?? null,
      plateNumber: event.plate_number ?? '—',
      confidence,
      confidencePercent: `${(confidence * 100).toFixed(1)}%`,
      detectionTime: event.detection_time ?? null,
      formattedDetectionTime: formatDetectionTime(event.detection_time),
      isValid: Boolean(event.is_valid),
      isFlagged: Boolean(event.is_flagged),
      latitude: event.latitude ?? null,
      longitude: event.longitude ?? null,
      camera: normalizeCamera(event.camera),
      vehicle: normalizeVehicle(event.vehicle),
      images,
      imageMap,
      evidenceCount,
      hasEvidence: evidenceCount > 0,
      blockchainProof: normalizeBlockchainProof(event.blockchain_proof),
      imageBlockchainProofSummary: normalizeImageBlockchainProofSummary(event.image_blockchain_proof_summary)
    };
  }
}
