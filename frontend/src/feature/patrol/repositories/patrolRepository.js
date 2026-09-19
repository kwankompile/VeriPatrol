export class PatrolRepository {
  constructor(dataSource) {
    this.dataSource = dataSource;
  }

  async getAllZones() {
    try {
      const zones = await this.dataSource.getAllZones();
      return Array.isArray(zones) ? zones : [];
    } catch (error) {
      console.error('Error fetching zones:', error);
      throw error;
    }
  }

  async createPatrol(patrolData) {
    try {
      if (!patrolData.zone_id) {
        throw new Error('Zone is required to start a patrol');
      }
      return await this.dataSource.createPatrol(patrolData);
    } catch (error) {
      console.error('Error creating patrol:', error);
      throw error;
    }
  }

  async updatePatrol(patrolId, patrolData) {
    try {
      return await this.dataSource.updatePatrol(patrolId, patrolData);
    } catch (error) {
      console.error('Error updating patrol:', error);
      throw error;
    }
  }

  async getActivePatrolSession() {
    try {
      return await this.dataSource.getActivePatrolSession();
    } catch (error) {
      console.error('Error fetching active patrol session:', error);
      throw error;
    }
  }

  async getAllCheckpointsByZoneId(zoneId) {
    try {
      const checkpoints = await this.dataSource.getAllCheckpointsByZoneId(zoneId);
      return Array.isArray(checkpoints) ? checkpoints : [];
    } catch (error) {
      console.error('Error fetching checkpoints by zone id:', error);
      throw error;
    }
  }

  async createBatchCheckpointLogs(checkpointDataArray) {
    try {
      const promises = checkpointDataArray.map((data) => this.dataSource.createCheckpointLog(data));

      const results = await Promise.all(promises);
      console.log(`Created ${results.length} checkpoint logs`);
      return results;
    } catch (error) {
      console.error('Error in batch creation:', error);
      throw error;
    }
  }

  async updateCheckpointLog(logId, data) {
    try {
      return await this.dataSource.updateCheckpointLog(logId, data);
    } catch (error) {
      console.error('Error updating checkpoint log:', error);
      throw error;
    }
  }

  /**
   * @deprecated GPS movement is persisted only via location_logs (Dexie + POST /pwa/sync).
   * Do not call this from new code. Kept for legacy callers / tests.
   */
  async createPatrolRoute(data) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[deprecated] createPatrolRoute: use location_logs / PWA sync. POST /patrol-routes is deprecated.'
      );
    }
    try {
      return await this.dataSource.createPatrolRoute(data);
    } catch (error) {
      console.error('Error creating patrol route:', error);
      throw error;
    }
  }

  async getPatrolSummary(patrolSessionId) {
    try {
      if (!patrolSessionId) {
        throw new Error('Patrol session id is required for summary');
      }
      return await this.dataSource.getPatrolSummary(patrolSessionId);
    } catch (error) {
      console.error('Error fetching patrol summary:', error);
      throw error;
    }
  }

  async validatePatrolSession(patrolSessionId) {
    try {
      if (!patrolSessionId) {
        throw new Error('Patrol session id is required for validation');
      }
      return await this.dataSource.validatePatrolSession(patrolSessionId);
    } catch (error) {
      console.error('Error validating patrol session:', error);
      throw error;
    }
  }
}
