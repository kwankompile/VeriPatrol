import { useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { Alert, Box } from '@mui/material';

import { addLeafletBaseLayersControl } from 'utils/leafletBaseLayers';

function parseRouteLatLng(point) {
  const lat = parseFloat(point?.latitude);
  const lng = parseFloat(point?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return [lat, lng];
}

function buildRouteLatLngs(routeData) {
  if (!Array.isArray(routeData)) {
    return [];
  }
  return routeData.map(parseRouteLatLng).filter(Boolean);
}

/** Patrol history route map — vanilla Leaflet with shared Map / Satellite base layers. */
export default function LeafletMap({ routeData = [] }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);

  const latLngs = useMemo(() => buildRouteLatLngs(routeData), [routeData]);
  const routesKey = useMemo(() => latLngs.map((coords) => coords.join(',')).join('|'), [latLngs]);

  useEffect(() => {
    if (!window.L || !mapContainerRef.current || latLngs.length === 0) {
      return undefined;
    }

    const L = window.L;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, { scrollWheelZoom: true });
      addLeafletBaseLayersControl(L, mapRef.current);
    }

    const map = mapRef.current;

    layersRef.current.forEach((layer) => {
      map.removeLayer(layer);
    });
    layersRef.current = [];

    if (latLngs.length >= 2) {
      const polyline = L.polyline(latLngs, { color: '#dc2626', weight: 4 }).addTo(map);
      layersRef.current.push(polyline);
    }

    const startMarker = L.marker(latLngs[0]).bindPopup('Start').addTo(map);
    layersRef.current.push(startMarker);

    if (latLngs.length > 1) {
      const endMarker = L.marker(latLngs[latLngs.length - 1]).bindPopup('End').addTo(map);
      layersRef.current.push(endMarker);
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0], 17);
    } else {
      map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
    }

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return undefined;
  }, [routesKey, latLngs]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layersRef.current = [];
      }
    };
  }, []);

  if (!window.L) {
    return <Alert severity="warning">Map library is not loaded.</Alert>;
  }

  if (latLngs.length === 0) {
    return (
      <Alert severity="info" data-testid="patrol-history-map-empty">
        No route data available to display on the map.
      </Alert>
    );
  }

  return (
    <Box
      ref={mapContainerRef}
      data-testid="patrol-history-route-map"
      sx={{
        width: '100%',
        height: 500,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider'
      }}
    />
  );
}

LeafletMap.propTypes = {
  routeData: PropTypes.arrayOf(
    PropTypes.shape({
      latitude: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
      longitude: PropTypes.oneOfType([PropTypes.number, PropTypes.string])
    })
  )
};
