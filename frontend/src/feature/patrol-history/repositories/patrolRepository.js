export class PatrolRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async getAllPatrols() {
    try {
      return await this.dataSource.getAllPatrols();
    } catch (error) {
      console.error('Error fetching patrols:', error);
      throw error;
    }
  }

  async getAllCheckpointById(patrolHistoryId) {
    try {
      return await this.dataSource.getAllCheckpointById(patrolHistoryId);
    } catch (error) {
      console.error('Error fetching checkpoint by patrol:', error);
      throw error;
    }
  }

  /**
   * Complete paginated route for history/detail maps.
   * Returns normalized route points (not a raw API envelope).
   */
  async getAllRouteById(patrolHistoryId, options = {}) {
    try {
      return await this.dataSource.getAllRouteById(patrolHistoryId, options);
    } catch (error) {
      console.error('Error fetching route by patrol:', error);
      throw error;
    }
  }

  async getPatrolById(patrolId) {
    try {
      return await this.dataSource.getPatrolById(patrolId);
    } catch (error) {
      console.error('Error fetching patrol:', error);
      throw error;
    }
  }

  async createPatrol(patrolData) {
    try {
      if (
        !patrolData.name ||
        !patrolData.model ||
        !patrolData.status ||
        !patrolData.latitude ||
        !patrolData.longitude ||
        !patrolData.serial_number
      ) {
        throw new Error('Name, location, status, latitude, longitude, and serial number are required');
      }
      return await this.dataSource.createPatrol(patrolData);
    } catch (error) {
      console.error('Error creating patrol:', error);
      throw error;
    }
  }

  async updatePatrol(patrolId, patrolData) {
    try {
      if (
        !patrolData.name ||
        !patrolData.model ||
        !patrolData.status ||
        !patrolData.latitude ||
        !patrolData.longitude ||
        !patrolData.serial_number
      ) {
        throw new Error('Name, location, status, latitude, longitude, and serial number are required');
      }
      return await this.dataSource.updatePatrol(patrolId, patrolData);
    } catch (error) {
      console.error('Error updating patrol:', error);
      throw error;
    }
  }

  async deletePatrol(patrolId) {
    try {
      return await this.dataSource.deletePatrol(patrolId);
    } catch (error) {
      console.error('Error deleting patrol:', error);
      throw error;
    }
  }

  filterPatrols(patrols, searchText) {
    if (!searchText) return patrols;

    const lowerSearch = searchText.toLowerCase();
    return patrols.filter(
      (patrol) => patrol.guard_user.full_name.toLowerCase().includes(lowerSearch) || patrol.zone.name.toLowerCase().includes(lowerSearch)
    );
  }

  paginatePatrols(patrols, page, rowsPerPage) {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return patrols.slice(start, end);
  }
}
