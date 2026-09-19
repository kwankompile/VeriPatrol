import { useCallback, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { Alert, Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material';
import { IconCurrentLocation as RecenterIcon } from '@tabler/icons-react';

import { addLeafletBaseLayersControl } from 'utils/leafletBaseLayers';

import { anomalyToLatLngs, buildAnomalyPopupHtml, getAnomalyMapStyle } from '../utils/patrolAnomalyUtils';
import { checkpointMapColor } from '../utils/patrolStatusUtils';

const GAP_THRESHOLD_SECONDS = 30;
const LARGE_GAP_SECONDS = 300;
const DEFAULT_MAP_CENTER = [3.139, 101.6869];
const DEFAULT_MAP_ZOOM = 12;

function parseCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function routeToLatLng(route) {
  const lat = parseCoord(route?.latitude);
  const lng = parseCoord(route?.longitude);
  if (lat == null || lng == null) return null;
  return [lat, lng];
}

function recordedAtMs(route) {
  if (!route?.recorded_at) return null;
  const t = new Date(route.recorded_at).getTime();
  return Number.isFinite(t) ? t : null;
}

function detectRouteGaps(routes) {
  const gaps = [];
  for (let i = 1; i < routes.length; i += 1) {
    const prevMs = recordedAtMs(routes[i - 1]);
    const curMs = recordedAtMs(routes[i]);
    if (prevMs == null || curMs == null) continue;
    const deltaSec = (curMs - prevMs) / 1000;
    if (deltaSec > GAP_THRESHOLD_SECONDS) {
      gaps.push({
        index: i,
        from: routes[i - 1],
        to: routes[i],
        gapSeconds: Math.round(deltaSec)
      });
    }
  }
  return gaps;
}

function checkpointColor(status) {
  return checkpointMapColor(status);
}

function createGuardReplayIcon(L) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:18px;height:18px;
      background:#0ea5e9;
      border:3px solid #fff;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(14,165,233,0.6);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

function createPinIcon(L, label, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${color};
      color:#fff;
      font-size:11px;
      font-weight:700;
      padding:2px 6px;
      border-radius:4px;
      border:2px solid #fff;
      box-shadow:0 1px 4px rgba(0,0,0,0.35);
      white-space:nowrap;
    ">${label}</div>`,
    iconSize: [48, 24],
    iconAnchor: [24, 12]
  });
}

function clearLayers(map, layers) {
  layers.forEach((layer) => {
    map.removeLayer(layer);
  });
  layers.length = 0;
}

export default function PatrolRouteMap({
  routes = [],
  checkpointEvents = [],
  anomalies = [],
  selectedAnomaly = null,
  showAnomalies = true,
  replayPoint = null,
  replayActive = false,
  replayProgressIndex = 0,
  highlightedCheckpointIds = [],
  loading = false,
  error = null,
  onLargeGapDetected,
  onLegendStatsChange
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);
  const trailPolylineRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const checkpointLayerMapRef = useRef(new Map());
  const anomalyLayerMapRef = useRef(new Map());
  const replayTraversedRef = useRef(null);
  const replayRemainingRef = useRef(null);
  const replayGuardMarkerRef = useRef(null);
  const initialFitDoneRef = useRef(false);
  const prevRoutesKeyRef = useRef('');

  const highlightedCheckpointSet = useMemo(() => new Set(highlightedCheckpointIds ?? []), [highlightedCheckpointIds]);

  const sortedRoutes = useMemo(() => {
    return [...routes].sort((a, b) => {
      const ta = recordedAtMs(a) ?? 0;
      const tb = recordedAtMs(b) ?? 0;
      return ta - tb;
    });
  }, [routes]);

  const routePoints = useMemo(() => sortedRoutes.map(routeToLatLng).filter(Boolean), [sortedRoutes]);

  const gaps = useMemo(() => detectRouteGaps(sortedRoutes), [sortedRoutes]);

  const checkpointMarkers = useMemo(() => {
    return checkpointEvents
      .map((event) => {
        const lat = parseCoord(event?.checkpoint?.latitude);
        const lng = parseCoord(event?.checkpoint?.longitude);
        if (lat == null || lng == null) return null;
        return {
          id: event.id,
          lat,
          lng,
          name: event.checkpoint?.name ?? 'Checkpoint',
          status: event.status
        };
      })
      .filter(Boolean);
  }, [checkpointEvents]);

  const hasRouteData = routePoints.length > 0;
  const hasCheckpointData = checkpointMarkers.length > 0;
  const hasMapData = hasRouteData || hasCheckpointData;

  const routesKey = useMemo(
    () => sortedRoutes.map((r) => `${r.id ?? ''}:${r.recorded_at ?? ''}:${r.latitude}:${r.longitude}`).join('|'),
    [sortedRoutes]
  );

  const contentBoundsPoints = useMemo(() => {
    const points = [...routePoints];
    checkpointMarkers.forEach((cp) => {
      points.push([cp.lat, cp.lng]);
    });
    return points;
  }, [routePoints, checkpointMarkers]);

  const handleRecenterMap = useCallback(() => {
    const leaflet = window.L;
    const map = mapRef.current;
    if (!leaflet || !map) {
      return;
    }

    if (contentBoundsPoints.length > 0) {
      map.fitBounds(leaflet.latLngBounds(contentBoundsPoints), { padding: [40, 40], maxZoom: 18 });
      return;
    }

    map.setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);
  }, [contentBoundsPoints]);

  const appendGapSegment = (L, map, fromRoute, toRoute) => {
    const from = routeToLatLng(fromRoute);
    const to = routeToLatLng(toRoute);
    if (!from || !to) return;

    const prevMs = recordedAtMs(fromRoute);
    const curMs = recordedAtMs(toRoute);
    const gapSeconds = prevMs != null && curMs != null ? Math.round((curMs - prevMs) / 1000) : 0;

    const gapLine = L.polyline([from, to], {
      color: '#f97316',
      weight: 4,
      opacity: 0.9,
      dashArray: '8, 8'
    }).addTo(map);
    layersRef.current.push(gapLine);

    const midLat = (from[0] + to[0]) / 2;
    const midLng = (from[1] + to[1]) / 2;
    const gapMarker = L.circleMarker([midLat, midLng], {
      radius: 6,
      color: '#f97316',
      fillColor: '#fff7ed',
      fillOpacity: 1,
      weight: 2
    })
      .bindPopup(`GPS gap: ${gapSeconds}s`)
      .addTo(map);
    layersRef.current.push(gapMarker);

    if (gapSeconds >= LARGE_GAP_SECONDS && onLargeGapDetected) {
      onLargeGapDetected(gapSeconds);
    }
  };

  const appendRoutePoint = (L, map, route, index, total) => {
    const pt = routeToLatLng(route);
    if (!pt) return;

    if (!trailPolylineRef.current) {
      trailPolylineRef.current = L.polyline([pt], {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85
      }).addTo(map);
      layersRef.current.push(trailPolylineRef.current);

      startMarkerRef.current = L.marker(pt, {
        icon: createPinIcon(L, 'Start', '#16a34a')
      })
        .bindPopup('Patrol start')
        .addTo(map);
      layersRef.current.push(startMarkerRef.current);
    } else {
      trailPolylineRef.current.addLatLng(pt);
    }

    if (index > 0 && index < total - 1) {
      const dot = L.circleMarker(pt, {
        radius: 3,
        color: '#64748b',
        fillColor: '#64748b',
        fillOpacity: 0.9,
        weight: 1
      }).addTo(map);
      layersRef.current.push(dot);
    }

    if (index > 0) {
      appendGapSegment(L, map, sortedRoutes[index - 1], route);
    }

    if (endMarkerRef.current) {
      map.removeLayer(endMarkerRef.current);
      const idx = layersRef.current.indexOf(endMarkerRef.current);
      if (idx >= 0) layersRef.current.splice(idx, 1);
    }

    endMarkerRef.current = L.marker(pt, {
      icon: createPinIcon(L, index === 0 ? 'Start' : 'End', index === 0 ? '#16a34a' : '#dc2626')
    })
      .bindPopup(index === 0 ? 'Patrol start' : 'Patrol end')
      .addTo(map);
    layersRef.current.push(endMarkerRef.current);
  };

  const renderAnomalyLayers = (L, map) => {
    anomalyLayerMapRef.current.forEach((layer) => {
      map.removeLayer(layer);
    });
    anomalyLayerMapRef.current.clear();

    if (!showAnomalies || !anomalies.length) {
      return;
    }

    anomalies.forEach((item) => {
      const latLngs = anomalyToLatLngs(item);
      if (!latLngs?.length) {
        return;
      }

      const style = getAnomalyMapStyle(item.type);
      const isSelected = selectedAnomaly?.id === item.id;
      const popupHtml = buildAnomalyPopupHtml(item);
      let layer;

      if (style.isMarker || latLngs.length === 1) {
        const pt = latLngs[0];
        layer = L.circleMarker(pt, {
          radius: isSelected ? 10 : 7,
          color: style.color,
          fillColor: isSelected ? style.color : '#fef3c7',
          fillOpacity: 0.95,
          weight: isSelected ? 3 : 2
        }).bindPopup(popupHtml);
      } else {
        layer = L.polyline(latLngs, {
          color: style.color,
          weight: isSelected ? style.weight + 2 : style.weight,
          opacity: isSelected ? 1 : 0.85,
          dashArray: style.dashArray ?? undefined
        }).bindPopup(popupHtml);
      }

      layer.addTo(map);
      anomalyLayerMapRef.current.set(item.id, layer);
    });
  };

  const syncCheckpointMarkers = (L, map) => {
    const nextIds = new Set(checkpointMarkers.map((cp) => cp.id));

    checkpointLayerMapRef.current.forEach((layer, id) => {
      if (!nextIds.has(id)) {
        map.removeLayer(layer);
        checkpointLayerMapRef.current.delete(id);
      }
    });

    checkpointMarkers.forEach((cp) => {
      const color = checkpointColor(cp.status);
      const emphasized = highlightedCheckpointSet.has(cp.id);
      const existing = checkpointLayerMapRef.current.get(cp.id);
      if (existing) {
        map.removeLayer(existing);
      }

      const marker = L.circleMarker([cp.lat, cp.lng], {
        radius: emphasized ? 14 : 10,
        color: emphasized ? '#fbbf24' : '#ffffff',
        fillColor: color,
        fillOpacity: 0.95,
        weight: emphasized ? 4 : 3
      })
        .bindPopup(`<strong>${cp.name}</strong><br/>Status: ${cp.status ?? 'pending'}`)
        .addTo(map);

      checkpointLayerMapRef.current.set(cp.id, marker);
    });
  };

  const fullRedraw = (L, map) => {
    clearLayers(map, layersRef.current);
    trailPolylineRef.current = null;
    startMarkerRef.current = null;
    endMarkerRef.current = null;
    checkpointLayerMapRef.current.forEach((layer) => map.removeLayer(layer));
    checkpointLayerMapRef.current.clear();

    if (!hasMapData) {
      map.setView([3.139, 101.6869], 13);
      return;
    }

    const boundsPoints = [];

    if (routePoints.length > 0) {
      trailPolylineRef.current = L.polyline(routePoints, {
        color: '#2563eb',
        weight: 4,
        opacity: 0.85
      }).addTo(map);
      layersRef.current.push(trailPolylineRef.current);
      routePoints.forEach((pt) => boundsPoints.push(pt));
    }

    gaps.forEach((gap) => appendGapSegment(L, map, gap.from, gap.to));

    sortedRoutes.forEach((route, index) => {
      const pt = routeToLatLng(route);
      if (!pt) return;
      if (index > 0 && index < sortedRoutes.length - 1) {
        const dot = L.circleMarker(pt, {
          radius: 3,
          color: '#64748b',
          fillColor: '#64748b',
          fillOpacity: 0.9,
          weight: 1
        }).addTo(map);
        layersRef.current.push(dot);
      }
    });

    if (routePoints.length >= 1) {
      startMarkerRef.current = L.marker(routePoints[0], {
        icon: createPinIcon(L, 'Start', '#16a34a')
      })
        .bindPopup('Patrol start')
        .addTo(map);
      layersRef.current.push(startMarkerRef.current);
    }

    if (routePoints.length >= 2) {
      const endPoint = routePoints[routePoints.length - 1];
      endMarkerRef.current = L.marker(endPoint, {
        icon: createPinIcon(L, 'End', '#dc2626')
      })
        .bindPopup('Patrol end')
        .addTo(map);
      layersRef.current.push(endMarkerRef.current);
    }

    syncCheckpointMarkers(L, map);
    renderAnomalyLayers(L, map);
    checkpointMarkers.forEach((cp) => boundsPoints.push([cp.lat, cp.lng]));

    if (!initialFitDoneRef.current && !replayActive && boundsPoints.length > 0) {
      const bounds = L.latLngBounds(boundsPoints);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
      initialFitDoneRef.current = true;
    }
  };

  const syncReplayLayers = (L, map) => {
    if (replayTraversedRef.current) {
      map.removeLayer(replayTraversedRef.current);
      replayTraversedRef.current = null;
    }
    if (replayRemainingRef.current) {
      map.removeLayer(replayRemainingRef.current);
      replayRemainingRef.current = null;
    }
    if (replayGuardMarkerRef.current) {
      map.removeLayer(replayGuardMarkerRef.current);
      replayGuardMarkerRef.current = null;
    }

    if (!replayActive || routePoints.length < 2) {
      if (trailPolylineRef.current) {
        trailPolylineRef.current.setStyle({ opacity: 0.85, color: '#2563eb' });
      }
      return;
    }

    const safeIndex = Math.max(0, Math.min(replayProgressIndex, routePoints.length - 1));
    const traversed = routePoints.slice(0, safeIndex + 1);
    const remaining = routePoints.slice(safeIndex);

    if (trailPolylineRef.current) {
      trailPolylineRef.current.setStyle({ opacity: 0.35, color: '#94a3b8' });
    }

    if (traversed.length >= 2) {
      replayTraversedRef.current = L.polyline(traversed, {
        color: '#059669',
        weight: 5,
        opacity: 0.95
      }).addTo(map);
    } else if (traversed.length === 1) {
      replayTraversedRef.current = L.circleMarker(traversed[0], {
        radius: 5,
        color: '#059669',
        fillColor: '#059669',
        fillOpacity: 1,
        weight: 2
      }).addTo(map);
    }

    if (remaining.length >= 2) {
      replayRemainingRef.current = L.polyline(remaining, {
        color: '#cbd5e1',
        weight: 3,
        opacity: 0.7,
        dashArray: '6, 10'
      }).addTo(map);
    }

    const guardPt = replayPoint ? routeToLatLng(replayPoint) : traversed[traversed.length - 1];
    if (guardPt) {
      const timeLabel = replayPoint?.recorded_at ? new Date(replayPoint.recorded_at).toLocaleString() : 'Replay position';
      replayGuardMarkerRef.current = L.marker(guardPt, {
        icon: createGuardReplayIcon(L),
        zIndexOffset: 1000
      })
        .bindPopup(`<strong>Guard (replay)</strong><br/>${timeLabel}`)
        .addTo(map);
    }
  };

  useEffect(() => {
    const leaflet = window.L;
    if (!leaflet || !mapContainerRef.current || loading || error) {
      return undefined;
    }

    if (!mapRef.current) {
      mapRef.current = leaflet.map(mapContainerRef.current, {
        scrollWheelZoom: true
      });

      addLeafletBaseLayersControl(leaflet, mapRef.current);
    }

    const map = mapRef.current;

    const prevKey = prevRoutesKeyRef.current;
    const canIncremental =
      initialFitDoneRef.current && prevKey && routesKey.startsWith(prevKey) && sortedRoutes.length > 0 && routesKey !== prevKey;

    if (canIncremental) {
      const prevCount = prevKey.split('|').filter(Boolean).length;
      for (let i = prevCount; i < sortedRoutes.length; i += 1) {
        appendRoutePoint(leaflet, map, sortedRoutes[i], i, sortedRoutes.length);
      }
      syncCheckpointMarkers(leaflet, map);
      renderAnomalyLayers(leaflet, map);
      syncReplayLayers(leaflet, map);
    } else {
      if (routesKey !== prevKey) {
        initialFitDoneRef.current = false;
      }
      fullRedraw(leaflet, map);
      syncReplayLayers(leaflet, map);
    }

    prevRoutesKeyRef.current = routesKey;

    const resizeTimer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(resizeTimer);
    };
  }, [
    sortedRoutes,
    routePoints,
    gaps,
    checkpointMarkers,
    anomalies,
    selectedAnomaly,
    showAnomalies,
    hasMapData,
    loading,
    error,
    routesKey,
    onLargeGapDetected
  ]);

  useEffect(() => {
    const leaflet = window.L;
    if (!mapRef.current || !leaflet || loading || error) {
      return undefined;
    }
    syncReplayLayers(leaflet, mapRef.current);
    syncCheckpointMarkers(leaflet, mapRef.current);
    return undefined;
  }, [replayActive, replayProgressIndex, replayPoint, highlightedCheckpointIds, routePoints, loading, error]);

  useEffect(() => {
    onLegendStatsChange?.({
      gapCount: gaps.length,
      anomalyCount: showAnomalies ? anomalies.length : 0
    });
  }, [gaps.length, anomalies.length, showAnomalies, onLegendStatsChange]);

  useEffect(() => {
    const leaflet = window.L;
    if (!mapRef.current || !leaflet || !selectedAnomaly || replayActive) {
      return undefined;
    }

    const latLngs = anomalyToLatLngs(selectedAnomaly);
    if (!latLngs?.length) {
      return undefined;
    }

    const map = mapRef.current;
    const bounds = leaflet.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });

    const layer = anomalyLayerMapRef.current.get(selectedAnomaly.id);
    if (layer?.openPopup) {
      layer.openPopup();
    }

    return undefined;
  }, [selectedAnomaly, replayActive]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layersRef.current = [];
        trailPolylineRef.current = null;
        startMarkerRef.current = null;
        endMarkerRef.current = null;
        replayTraversedRef.current = null;
        replayRemainingRef.current = null;
        replayGuardMarkerRef.current = null;
        checkpointLayerMapRef.current.clear();
        anomalyLayerMapRef.current.clear();
        initialFitDoneRef.current = false;
        prevRoutesKeyRef.current = '';
      }
    };
  }, []);

  if (loading && !mapRef.current) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!hasMapData) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        No patrol route data available.
      </Typography>
    );
  }

  return (
    <Box sx={{ position: 'relative' }}>
      {!hasRouteData ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No patrol route data available. Showing checkpoint locations only.
        </Typography>
      ) : null}
      <Box
        ref={mapContainerRef}
        sx={{
          height: { xs: 320, sm: 420 },
          width: '100%',
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          zIndex: 0
        }}
      />
      <Tooltip title="Recenter map">
        <IconButton
          aria-label="Recenter map"
          onClick={handleRecenterMap}
          size="small"
          data-testid="patrol-map-recenter-button"
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
      {loading ? (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(255, 255, 255, 0.55)',
            borderRadius: 1,
            pointerEvents: 'none'
          }}
        >
          <CircularProgress size={24} />
        </Box>
      ) : null}
    </Box>
  );
}

PatrolRouteMap.propTypes = {
  routes: PropTypes.arrayOf(PropTypes.object),
  checkpointEvents: PropTypes.arrayOf(PropTypes.object),
  anomalies: PropTypes.arrayOf(PropTypes.object),
  selectedAnomaly: PropTypes.object,
  showAnomalies: PropTypes.bool,
  replayPoint: PropTypes.object,
  replayActive: PropTypes.bool,
  replayProgressIndex: PropTypes.number,
  highlightedCheckpointIds: PropTypes.arrayOf(PropTypes.string),
  loading: PropTypes.bool,
  error: PropTypes.string,
  onLargeGapDetected: PropTypes.func,
  onLegendStatsChange: PropTypes.func
};
