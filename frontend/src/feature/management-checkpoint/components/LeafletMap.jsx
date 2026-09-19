import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, IconButton, Tooltip, Typography } from '@mui/material';
import { IconCurrentLocation as RecenterIcon } from '@tabler/icons-react';
import { addLeafletBaseLayersControl } from 'utils/leafletBaseLayers';
import { normalizeCoordinate } from '../utils/coordinateUtils';

/** Read-only checkpoint map with radius circle (view page). */
export default function LeafletMap({ checkpoint }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const recenterTargetRef = useRef({ lat: null, lng: null });
  const [isMapDragging, setIsMapDragging] = useState(false);

  const lat = normalizeCoordinate(checkpoint?.latitude, 'latitude', { asNumber: true });
  const lng = normalizeCoordinate(checkpoint?.longitude, 'longitude', { asNumber: true });
  const radius = Number(checkpoint?.radius) > 0 ? Number(checkpoint.radius) : 20;

  useEffect(() => {
    recenterTargetRef.current = { lat, lng };
  }, [lat, lng]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    const { lat: targetLat, lng: targetLng } = recenterTargetRef.current;
    if (!map || !Number.isFinite(targetLat) || !Number.isFinite(targetLng)) return;

    const zoom = map.getZoom() || 17;
    map.setView([targetLat, targetLng], zoom, { animate: true });
  }, []);

  useEffect(() => {
    if (!window.L || !mapContainerRef.current || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return undefined;
    }

    const L = window.L;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, { dragging: true, scrollWheelZoom: true }).setView([lat, lng], 17);
      addLeafletBaseLayersControl(L, mapRef.current, { position: 'topright' });

      markerRef.current = L.marker([lat, lng], { draggable: false }).addTo(mapRef.current);
      circleRef.current = L.circle([lat, lng], {
        radius,
        color: '#1976d2',
        fillColor: '#1976d2',
        fillOpacity: 0.15,
        weight: 2
      }).addTo(mapRef.current);

      mapRef.current.on('dragstart', () => setIsMapDragging(true));
      mapRef.current.on('dragend', () => setIsMapDragging(false));
    } else {
      markerRef.current?.setLatLng([lat, lng]);
      circleRef.current?.setLatLng([lat, lng]);
      circleRef.current?.setRadius(radius);
    }

    return undefined;
  }, [lat, lng, radius]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return <Alert severity="info">No valid coordinates to display on the map.</Alert>;
  }

  if (!window.L) {
    return <Alert severity="warning">Map library is not loaded.</Alert>;
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Drag the map to pan. The circle shows the checkpoint radius.
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <Box
          ref={mapContainerRef}
          className={isMapDragging ? 'checkpoint-map-view checkpoint-map-view--dragging' : 'checkpoint-map-view'}
          sx={{
            height: 400,
            width: '100%',
            borderRadius: 2,
            overflow: 'hidden',
            '& .leaflet-container': {
              cursor: 'grab'
            },
            '&.checkpoint-map-view--dragging .leaflet-container': {
              cursor: 'grabbing'
            }
          }}
        />
        <Tooltip title="Recenter map">
          <IconButton
            aria-label="Recenter map"
            onClick={handleRecenter}
            size="small"
            data-testid="checkpoint-map-recenter-button"
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
    </Box>
  );
}
