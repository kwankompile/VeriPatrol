export const patrolLiveDataSource = {
  fetchPatrols: async () => {
    return [
      {
        id: '1', // Unique identifier
        name: 'Muhammad Ikhwan Arifi', // Human-readable name
        location: {
          name: 'Ikhwan001', // Site name
          coordinates: {
            lat: 3.139, // GPS latitude
            lng: 101.6869, // GPS longitude
            altitude: 15.5 // Height in meters
          }
        },
        installation_date: '2024-01-15',
        last_maintenance: '2024-10-20',
        next_maintenance_due: '2025-01-20',
        last_modified: 'Zone A'
      },
      {
        id: '2', // Unique identifier
        name: 'Muhammad Lukman', // Human-readable name
        location: {
          name: 'Lukman102', // Site name
          coordinates: {
            lat: 3.139, // GPS latitude
            lng: 101.6869, // GPS longitude
            altitude: 15.5 // Height in meters
          }
        },
        installation_date: '2024-01-15',
        last_maintenance: '2024-10-20',
        next_maintenance_due: '2025-01-20',
        last_modified: 'Zone B'
      },
      {
        id: '3', // Unique identifier
        name: 'Aiman Asyraaf', // Human-readable name
        location: {
          name: 'Aiman763', // Site name
          coordinates: {
            lat: 3.139, // GPS latitude
            lng: 101.6869, // GPS longitude
            altitude: 15.5 // Height in meters
          }
        },
        installation_date: '2024-01-15',
        last_maintenance: '2024-10-20',
        next_maintenance_due: '2025-01-20',
        last_modified: 'Zone C'
      }
    ];
  },

  fetchPatrolById: async (patrolId) => {
    const patrols = await patrolLiveDataSource.fetchPatrols();
    return patrols.find((patrol) => patrol.id === patrolId);
  },

  createPatrol: async (patrolData) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const newPatrol = {
      id: Date.now().toString(),
      ...patrolData,
      profilePicture:
        patrolData.profilePicture || `https://ui-avatars.com/api/?name=${encodeURIComponent(patrolData.name)}&size=200&background=random`,
      lastModified: new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    };
    return { success: true, data: newPatrol };
  },

  updatePatrol: async (patrolId, patrolData) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      success: true,
      data: {
        id: patrolId,
        ...patrolData,
        lastModified: new Date().toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        })
      }
    };
  },

  deletePatrol: async (patrolId) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { success: true, id: patrolId };
  }
};
