export class CheckpointRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async getCheckpoints(params) {
    try {
      return await this.dataSource.getCheckpoints(params);
    } catch (error) {
      console.error('Error fetching checkpoints:', error);
      throw error;
    }
  }

  async getCheckpointById(checkpointId) {
    try {
      return await this.dataSource.getCheckpointById(checkpointId);
    } catch (error) {
      console.error('Error fetching checkpoint:', error);
      throw error;
    }
  }

  async createCheckpoint(checkpointData) {
    try {
      return await this.dataSource.createCheckpoint(checkpointData);
    } catch (error) {
      console.error('Error creating checkpoint:', error);
      throw error;
    }
  }

  async updateCheckpoint(checkpointId, checkpointData) {
    try {
      return await this.dataSource.updateCheckpoint(checkpointId, checkpointData);
    } catch (error) {
      console.error('Error updating checkpoint:', error);
      throw error;
    }
  }

  async deleteCheckpoint(checkpointId) {
    try {
      return await this.dataSource.deleteCheckpoint(checkpointId);
    } catch (error) {
      console.error('Error deleting checkpoint:', error);
      throw error;
    }
  }

  async getZones() {
    try {
      return await this.dataSource.getZones();
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

  /** @returns {{ items: object[], total: number, page: number, perPage: number, lastPage: number }} */
  normalizeCheckpointListResponse(payload) {
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

  normalizeZonesList(payload) {
    const paginated = payload?.data ?? payload;
    if (Array.isArray(paginated?.data)) return paginated.data;
    if (Array.isArray(paginated)) return paginated;
    return [];
  }
}
