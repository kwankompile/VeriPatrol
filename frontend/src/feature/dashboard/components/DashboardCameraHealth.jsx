import PropTypes from 'prop-types';

import DashboardStatusList from './DashboardStatusList';

export default function DashboardCameraHealth({ health }) {
  const items = [
    { id: 'online', label: 'Online', value: health?.online ?? 0, color: 'success' },
    { id: 'recent', label: 'Recently seen', value: health?.recentlySeen ?? 0, color: 'info' },
    { id: 'offline', label: 'Offline', value: health?.offline ?? 0, color: 'warning' },
    { id: 'inactive', label: 'Inactive / disabled', value: health?.inactive ?? 0, color: 'default' }
  ];

  return (
    <DashboardStatusList
      items={items}
      emptyTitle="No cameras"
      emptyMessage="Camera health counts will appear when cameras are registered."
      data-testid="dashboard-camera-health"
    />
  );
}

DashboardCameraHealth.propTypes = {
  health: PropTypes.shape({
    online: PropTypes.number,
    recentlySeen: PropTypes.number,
    offline: PropTypes.number,
    inactive: PropTypes.number
  })
};
