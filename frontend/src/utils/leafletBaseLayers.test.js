import { describe, expect, it, vi } from 'vitest';

import {
  LEAFLET_BASE_LAYER_MAP,
  LEAFLET_BASE_LAYER_SATELLITE,
  addLeafletBaseLayersControl
} from './leafletBaseLayers';

describe('leafletBaseLayers', () => {
  it('defines map and satellite tile configs', () => {
    expect(LEAFLET_BASE_LAYER_MAP.label).toBe('Map');
    expect(LEAFLET_BASE_LAYER_MAP.url).toContain('openstreetmap');
    expect(LEAFLET_BASE_LAYER_SATELLITE.label).toBe('Satellite');
    expect(LEAFLET_BASE_LAYER_SATELLITE.url).toContain('World_Imagery');
  });

  it('adds layer control with map as default', () => {
    const mapLayer = { addTo: vi.fn() };
    const satelliteLayer = { addTo: vi.fn() };
    const control = { addTo: vi.fn() };

    const L = {
      tileLayer: vi.fn((url) => (url.includes('openstreetmap') ? mapLayer : satelliteLayer)),
      control: {
        layers: vi.fn(() => control)
      }
    };

    const map = {};
    const result = addLeafletBaseLayersControl(L, map);

    expect(mapLayer.addTo).toHaveBeenCalledWith(map);
    expect(satelliteLayer.addTo).not.toHaveBeenCalled();
    expect(L.control.layers).toHaveBeenCalledWith(
      { Map: mapLayer, Satellite: satelliteLayer },
      null,
      { position: 'topright' }
    );
    expect(control.addTo).toHaveBeenCalledWith(map);
    expect(result.mapLayer).toBe(mapLayer);
    expect(result.satelliteLayer).toBe(satelliteLayer);
  });
});
