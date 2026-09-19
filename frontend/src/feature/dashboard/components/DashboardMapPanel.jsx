import { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Box, IconButton, Tooltip } from '@mui/material';
import { IconCurrentLocation as RecenterIcon } from '@tabler/icons-react';

import ContentEmptyState from 'ui-component/state/ContentEmptyState';
import { addLeafletBaseLayersControl } from 'utils/leafletBaseLayers';
import { formatDashboardTimestamp } from '../utils/dashboardFormatters';

const DEFAULT_CENTER = [3.139, 101.6869];
const DEFAULT_ZOOM = 12;

function createGuardIcon(L) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:16px;height:16px;
      background:#673ab7;
      border:3px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(103,58,183,0.6);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
}

export default function DashboardMapPanel({ locations = [], timezone = 'Asia/Kuala_Lumpur', height = 280 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const markerPointsRef = useRef([]);

  const hasLocations = Array.isArray(locations) && locations.length > 0;

  const fitMapToPoints = useCallback((map, leaflet, points) => {
    if (points.length === 1) {
      map.setView(points[0], 15);
    } else if (points.length > 1) {
      map.fitBounds(leaflet.latLngBounds(points), { padding: [36, 36], maxZoom: 16 });
    } else {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }
  }, []);

  const handleRecenterMap = useCallback(() => {
    const leaflet = typeof window !== 'undefined' ? window.L : undefined;
    const map = mapRef.current;
    if (!leaflet || !map) {
      return;
    }
    fitMapToPoints(map, leaflet, markerPointsRef.current);
  }, [fitMapToPoints]);

  useEffect(() => {
    const leaflet = typeof window !== 'undefined' ? window.L : undefined;
    if (!leaflet || !containerRef.current || !hasLocations) {
      return undefined;
    }

    if (!mapRef.current) {
      mapRef.current = leaflet.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true });
      addLeafletBaseLayersControl(leaflet, mapRef.current, { position: 'topright' });
    }

    const map = mapRef.current;

    markersRef.current.forEach((marker) => map.removeLayer(marker));
    markersRef.current = [];

    const points = [];
    locations.forEach((location) => {
      const point = [location.latitude, location.longitude];
      points.push(point);
      const recorded = location.recordedAt ? formatDashboardTimestamp(location.recordedAt, timezone) : 'Live';
      const marker = leaflet.marker(point, { icon: createGuardIcon(leaflet) })
        .bindPopup(`<strong>${location.guardName ?? 'Guard'}</strong><br/>${location.zoneName ?? ''}<br/>${recorded}`)
        .addTo(map);
      markersRef.current.push(marker);
    });

    markerPointsRef.current = points;
    fitMapToPoints(map, leaflet, points);

    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [locations, timezone, hasLocations, fitMapToPoints]);

  useEffect(
    () => () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = [];
        markerPointsRef.current = [];
      }
    },
    []
  );

  if (!hasLocations) {
    return (
      <ContentEmptyState
        title="No active guard location available."
        message="Guard positions appear here while patrols are active and reporting GPS."
        testId="dashboard-map-empty"
      />
    );
  }

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        ref={containerRef}
        data-testid="dashboard-map-panel"
        sx={{
          height,
          width: '100%',
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          zIndex: 0,
          bgcolor: 'grey.100'
        }}
      />
      <Tooltip title="Recenter map">
        <IconButton
          aria-label="Recenter map"
          onClick={handleRecenterMap}
          size="small"
          data-testid="dashboard-map-recenter-button"
          sx={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            zIndex: 1000,
            bgcolor: 'background.paper',
            boxShadow: 2,
            '&:hover': { bgcolor: 'background.paper' }
          }}
        >
          <RecenterIcon size={18} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

DashboardMapPanel.propTypes = {
  locations: PropTypes.arrayOf(PropTypes.object),
  timezone: PropTypes.string,
  height: PropTypes.number
};
