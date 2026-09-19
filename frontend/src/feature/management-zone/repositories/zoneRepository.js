export class ZoneRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async getAllZones(params) {
    try {
      return await this.dataSource.getAllZones(params);
    } catch (error) {
      console.error('Error fetching zones:', error);
      throw error;
    }
  }

  async getZoneById(zoneId) {
    try {
      return await this.dataSource.getZoneById(zoneId);
    } catch (error) {
      console.error('Error fetching zone:', error);
      throw error;
    }
  }

  async createZone(zoneData) {
    try {
      return await this.dataSource.createZone(zoneData);
    } catch (error) {
      console.error('Error creating zone:', error);
      throw error;
    }
  }

  async updateZone(zoneId, zoneData) {
    try {
      return await this.dataSource.updateZone(zoneId, zoneData);
    } catch (error) {
      console.error('Error updating zone:', error);
      throw error;
    }
  }

  async deleteZone(zoneId) {
    try {
      return await this.dataSource.deleteZone(zoneId);
    } catch (error) {
      console.error('Error deleting zone:', error);
      throw error;
    }
  }

  /** @returns {{ items: object[], total: number, page: number, perPage: number, lastPage: number }} */
  normalizeZoneListResponse(payload) {
    const paginated = payload?.data ?? payload;
    const items = Array.isArray(paginated?.data) ? paginated.data : Array.isArray(paginated) ? paginated : [];
    const meta = paginated?.meta ?? {};
    return {
      items,
      total: meta.total ?? items.length,
      page: meta.current_page ?? 1,
      perPage: meta.per_page ?? (items.length || 15),
      lastPage: meta.last_page ?? 1
    };
  }

  normalizeZone(payload) {
    return payload?.data ?? payload;
  }

  normalizeZonesList(payload) {
    const paginated = payload?.data ?? payload;
    if (Array.isArray(paginated?.data)) return paginated.data;
    if (Array.isArray(paginated)) return paginated;
    return [];
  }
}
