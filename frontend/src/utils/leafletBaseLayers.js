/**
 * Shared Leaflet base map tile layers (OpenStreetMap + Esri World Imagery).
 * Uses vanilla Leaflet `L.control.layers` — the project loads Leaflet from CDN, not react-leaflet.
 */

export const LEAFLET_BASE_LAYER_MAP = Object.freeze({
  label: 'Map',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

export const LEAFLET_BASE_LAYER_SATELLITE = Object.freeze({
  label: 'Satellite',
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  attribution:
    '&copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
});

/**
 * Adds Map (default) and Satellite base layers with a Leaflet layer control.
 * Only one base layer is active at a time.
 *
 * @param {typeof import('leaflet')} L
 * @param {import('leaflet').Map} map
 * @param {{ position?: string, defaultLayer?: 'map' | 'satellite' }} [options]
 * @returns {{ mapLayer: import('leaflet').TileLayer, satelliteLayer: import('leaflet').TileLayer, control: import('leaflet').Control.Layers }}
 */
export function addLeafletBaseLayersControl(L, map, options = {}) {
  const { position = 'topright', defaultLayer = 'map' } = options;

  const mapLayer = L.tileLayer(LEAFLET_BASE_LAYER_MAP.url, {
    attribution: LEAFLET_BASE_LAYER_MAP.attribution
  });

  const satelliteLayer = L.tileLayer(LEAFLET_BASE_LAYER_SATELLITE.url, {
    attribution: LEAFLET_BASE_LAYER_SATELLITE.attribution
  });

  const baseLayers = {
    [LEAFLET_BASE_LAYER_MAP.label]: mapLayer,
    [LEAFLET_BASE_LAYER_SATELLITE.label]: satelliteLayer
  };

  if (defaultLayer === 'satellite') {
    satelliteLayer.addTo(map);
  } else {
    mapLayer.addTo(map);
  }

  const control = L.control.layers(baseLayers, null, { position }).addTo(map);

  return { mapLayer, satelliteLayer, control };
}
