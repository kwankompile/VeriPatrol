export class PatrolLiveRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async getAllPatrolLives() {
    try {
      return await this.dataSource.fetchPatrols();
    } catch (error) {
      console.error('Error fetching patrolLives:', error);
      throw error;
    }
  }

  async getPatrolLiveById(patrolLiveId) {
    try {
      return await this.dataSource.getPatrolLiveById(patrolLiveId);
    } catch (error) {
      console.error('Error fetching patrolLive:', error);
      throw error;
    }
  }

  async createPatrolLive(patrolLiveData) {
    try {
      if (
        !patrolLiveData.name ||
        !patrolLiveData.location ||
        !patrolLiveData.status ||
        !patrolLiveData.latitude ||
        !patrolLiveData.longitude ||
        !patrolLiveData.serial_number
      ) {
        throw new Error('Name, location, status, latitude, longitude, and serial number are required');
      }
      return await this.dataSource.createPatrolLive(patrolLiveData);
    } catch (error) {
      console.error('Error creating patrolLive:', error);
      throw error;
    }
  }

  async updatePatrolLive(patrolLiveId, patrolLiveData) {
    try {
      if (
        !patrolLiveData.name ||
        !patrolLiveData.location ||
        !patrolLiveData.status ||
        !patrolLiveData.latitude ||
        !patrolLiveData.longitude ||
        !patrolLiveData.serial_number
      ) {
        throw new Error('Name, location, status, latitude, longitude, and serial number are required');
      }
      return await this.dataSource.updatePatrolLive(patrolLiveId, patrolLiveData);
    } catch (error) {
      console.error('Error updating patrolLive:', error);
      throw error;
    }
  }

  async deletePatrolLive(patrolLiveId) {
    try {
      return await this.dataSource.deletePatrolLive(patrolLiveId);
    } catch (error) {
      console.error('Error deleting patrolLive:', error);
      throw error;
    }
  }

  filterPatrolLives(patrolLives, searchText) {
    if (!searchText) return patrolLives;

    const lowerSearch = searchText.toLowerCase();
    return patrolLives.filter(
      (patrolLive) => patrolLive.name.toLowerCase().includes(lowerSearch) || patrolLive.location.toLowerCase().includes(lowerSearch)
    );
  }

  paginatePatrolLives(patrolLives, page, rowsPerPage) {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return patrolLives.slice(start, end);
  }
}
