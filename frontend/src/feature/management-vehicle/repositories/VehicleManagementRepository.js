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

const summarizeNotes = (notes, maxLength = 60) => {
  if (!notes) return '—';
  const text = String(notes).trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
};

export class VehicleManagementRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  assertSuccess(envelope, fallbackMessage) {
    if (envelope?.success === false) {
      throw new Error(envelope?.message || fallbackMessage);
    }
    return envelope;
  }

  normalizeVehicle(vehicle) {
    if (!vehicle || typeof vehicle !== 'object') return null;

    const source = vehicle.source ?? null;
    const status = vehicle.status ?? 'normal';

    return {
      id: vehicle.id ?? null,
      plateNumber: vehicle.plate_number ?? '—',
      ownerName: vehicle.owner_name ?? null,
      vehicleType: vehicle.vehicle_type ?? null,
      status,
      source,
      sourceLabel: source === 'auto_detected' ? 'Auto-detected' : source === 'manual' ? 'Manual' : (source ?? '—'),
      notes: vehicle.notes ?? null,
      notesSummary: summarizeNotes(vehicle.notes),
      createdAt: vehicle.created_at ?? null,
      updatedAt: vehicle.updated_at ?? null,
      formattedCreatedAt: formatDateTime(vehicle.created_at),
      formattedUpdatedAt: formatDateTime(vehicle.updated_at),
      isAutoDetected: source === 'auto_detected'
    };
  }

  unwrapPaginatedEnvelope(envelope) {
    const payload = envelope?.data ?? envelope;
    const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    const nestedMeta = payload?.meta ?? {};

    return {
      rows,
      meta: {
        total: payload?.total ?? nestedMeta.total ?? rows.length,
        currentPage: payload?.current_page ?? nestedMeta.current_page ?? 1,
        lastPage: payload?.last_page ?? nestedMeta.last_page ?? 1,
        perPage: payload?.per_page ?? nestedMeta.per_page ?? rows.length
      }
    };
  }

  async getVehicles(params = {}) {
    const envelope = this.assertSuccess(await this.dataSource.getVehicles(params), 'Failed to load vehicles');
    const { rows, meta } = this.unwrapPaginatedEnvelope(envelope);

    return {
      vehicles: rows.map((row) => this.normalizeVehicle(row)).filter(Boolean),
      pagination: {
        total: meta.total,
        page: meta.currentPage,
        perPage: meta.perPage,
        lastPage: meta.lastPage
      }
    };
  }

  async getVehicleById(id) {
    const envelope = this.assertSuccess(await this.dataSource.getVehicleById(id), 'Failed to load vehicle');
    return this.normalizeVehicle(envelope?.data ?? null);
  }

  async updateVehicle(id, payload) {
    const envelope = this.assertSuccess(await this.dataSource.updateVehicle(id, payload), 'Failed to update vehicle');
    return this.normalizeVehicle(envelope?.data ?? null);
  }

  buildUpdatePayload(form) {
    return {
      owner_name: form.ownerName?.trim() || null,
      vehicle_type: form.vehicleType?.trim() || null,
      status: form.status,
      notes: form.notes?.trim() || null
    };
  }
}
