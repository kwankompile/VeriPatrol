import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, IconButton, Tooltip, Typography } from '@mui/material';
import { IconCurrentLocation as RecenterIcon } from '@tabler/icons-react';

import { addLeafletBaseLayersControl } from 'utils/leafletBaseLayers';
import { DEFAULT_MAP_CENTER } from '../utils/checkpointConstants';
import { normalizeCoordinate } from '../utils/coordinateUtils';

/**
 * Interactive Leaflet map: click/drag marker, radius circle synced with form.
 */
export default function CheckpointMapPicker({
  latitude,
  longitude,
  recenterLatitude = DEFAULT_MAP_CENTER.latitude,
  recenterLongitude = DEFAULT_MAP_CENTER.longitude,
  radius,
  onCoordinatesChange,
  coordinateError,
  disabled = false
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const disabledRef = useRef(disabled);
  const onCoordinatesChangeRef = useRef(onCoordinatesChange);
  const recenterTargetRef = useRef({ lat: recenterLatitude, lng: recenterLongitude });
  const [isMapDragging, setIsMapDragging] = useState(false);

  const lat = Number.isFinite(latitude) ? latitude : DEFAULT_MAP_CENTER.latitude;
  const lng = Number.isFinite(longitude) ? longitude : DEFAULT_MAP_CENTER.longitude;
  const radiusM = Number(radius) > 0 ? Number(radius) : 20;

  useEffect(() => {
    recenterTargetRef.current = {
      lat: Number.isFinite(recenterLatitude) ? recenterLatitude : DEFAULT_MAP_CENTER.latitude,
      lng: Number.isFinite(recenterLongitude) ? recenterLongitude : DEFAULT_MAP_CENTER.longitude
    };
  }, [recenterLatitude, recenterLongitude]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onCoordinatesChangeRef.current = onCoordinatesChange;
  }, [onCoordinatesChange]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const { lat: targetLat, lng: targetLng } = recenterTargetRef.current;
    const zoom = map.getZoom() || 16;
    map.setView([targetLat, targetLng], zoom, { animate: true });
  }, []);

  useEffect(() => {
    if (!window.L || !mapContainerRef.current) {
      return undefined;
    }

    const L = window.L;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        scrollWheelZoom: !disabled,
        dragging: !disabled
      }).setView([lat, lng], 16);

      addLeafletBaseLayersControl(L, mapRef.current, { position: 'topright' });

      const emitCoords = (nextLat, nextLng) => {
        if (disabledRef.current) return;
        onCoordinatesChangeRef.current?.({
          latitude: normalizeCoordinate(nextLat, 'latitude'),
          longitude: normalizeCoordinate(nextLng, 'longitude')
        });
      };

      markerRef.current = L.marker([lat, lng], { draggable: !disabled }).addTo(mapRef.current);

      markerRef.current.on('dragend', () => {
        const pos = markerRef.current.getLatLng();
        emitCoords(pos.lat, pos.lng);
        if (circleRef.current) {
          circleRef.current.setLatLng(pos);
        }
      });

      mapRef.current.on('click', (event) => {
        if (disabledRef.current) return;
        const { lat: clickLat, lng: clickLng } = event.latlng;
        markerRef.current.setLatLng([clickLat, clickLng]);
        emitCoords(clickLat, clickLng);
        if (circleRef.current) {
          circleRef.current.setLatLng([clickLat, clickLng]);
        }
      });

      mapRef.current.on('dragstart', () => setIsMapDragging(true));
      mapRef.current.on('dragend', () => setIsMapDragging(false));
    }

    if (mapRef.current) {
      if (disabled) {
        mapRef.current.dragging.disable();
        mapRef.current.scrollWheelZoom.disable();
      } else {
        mapRef.current.dragging.enable();
        mapRef.current.scrollWheelZoom.enable();
      }
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      if (disabled) {
        markerRef.current.dragging?.disable();
      } else {
        markerRef.current.dragging?.enable();
      }
    }

    if (circleRef.current) {
      circleRef.current.setLatLng([lat, lng]);
      circleRef.current.setRadius(radiusM);
    } else if (mapRef.current) {
      circleRef.current = L.circle([lat, lng], {
        radius: radiusM,
        color: '#1976d2',
        fillColor: '#1976d2',
        fillOpacity: 0.15,
        weight: 2
      }).addTo(mapRef.current);
    }

    return undefined;
  }, [lat, lng, radiusM, disabled]);

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

  if (!window.L) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Map library is not loaded. Ensure Leaflet scripts are included in index.html.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Click the map or drag the marker to set coordinates. Drag the map to pan. The circle shows the checkpoint radius.
      </Typography>
      <Box sx={{ position: 'relative' }}>
        <Box
          ref={mapContainerRef}
          className={isMapDragging ? 'checkpoint-map-picker checkpoint-map-picker--dragging' : 'checkpoint-map-picker'}
          sx={{
            height: 360,
            width: '100%',
            borderRadius: 2,
            border: '1px solid',
            borderColor: coordinateError ? 'error.main' : 'divider',
            overflow: 'hidden',
            opacity: disabled ? 0.6 : 1,
            pointerEvents: disabled ? 'none' : 'auto',
            '& .leaflet-container': {
              cursor: 'grab'
            },
            '&.checkpoint-map-picker--dragging .leaflet-container': {
              cursor: 'grabbing'
            },
            '& .leaflet-marker-icon': {
              cursor: 'grab'
            },
            '& .leaflet-marker-dragging': {
              cursor: 'grabbing'
            }
          }}
        />
        <Tooltip title="Recenter map">
          <IconButton
            aria-label="Recenter map"
            onClick={handleRecenter}
            disabled={disabled}
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
      {coordinateError ? (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
          {coordinateError}
        </Typography>
      ) : null}
    </Box>
  );
}
