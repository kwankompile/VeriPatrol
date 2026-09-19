import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import LeafletMap from './LeafletMap';

const mockAddLeafletBaseLayersControl = vi.fn();

vi.mock('utils/leafletBaseLayers', () => ({
  addLeafletBaseLayersControl: (...args) => mockAddLeafletBaseLayersControl(...args)
}));

function createMockLeaflet() {
  const layers = [];

  const map = {
    setView: vi.fn(),
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    removeLayer: vi.fn((layer) => {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
    }),
    remove: vi.fn()
  };

  const L = {
    map: vi.fn(() => map),
    polyline: vi.fn((latLngs, options) => {
      const layer = { type: 'polyline', latLngs, options, addTo: vi.fn(() => layer) };
      layer.addTo.mockImplementation(() => {
        layers.push(layer);
        return layer;
      });
      return layer;
    }),
    marker: vi.fn((latLng) => {
      const layer = {
        type: 'marker',
        latLng,
        addTo: vi.fn(() => layer),
        bindPopup: vi.fn(() => layer)
      };
      layer.addTo.mockImplementation(() => {
        layers.push(layer);
        return layer;
      });
      return layer;
    }),
    latLngBounds: vi.fn((points) => ({ points }))
  };

  return { L, map, layers };
}

describe('patrol-history LeafletMap', () => {
  let mockLeaflet;

  beforeEach(() => {
    mockLeaflet = createMockLeaflet();
    window.L = mockLeaflet.L;
    mockAddLeafletBaseLayersControl.mockReset();
  });

  afterEach(() => {
    delete window.L;
  });

  it('shows empty state when route data is missing', () => {
    render(<LeafletMap routeData={[]} />);
    expect(screen.getByTestId('patrol-history-map-empty')).toBeInTheDocument();
    expect(mockLeaflet.L.map).not.toHaveBeenCalled();
  });

  it('initializes Leaflet map with base layer control and route overlays', () => {
    const routeData = [
      { latitude: 3.14, longitude: 101.68 },
      { latitude: 3.15, longitude: 101.69 }
    ];

    render(<LeafletMap routeData={routeData} />);

    expect(screen.getByTestId('patrol-history-route-map')).toBeInTheDocument();
    expect(mockLeaflet.L.map).toHaveBeenCalledTimes(1);
    expect(mockAddLeafletBaseLayersControl).toHaveBeenCalledWith(mockLeaflet.L, mockLeaflet.map);
    expect(mockLeaflet.L.polyline).toHaveBeenCalledWith(
      [
        [3.14, 101.68],
        [3.15, 101.69]
      ],
      { color: '#dc2626', weight: 4 }
    );
    expect(mockLeaflet.L.marker).toHaveBeenCalledTimes(2);
    expect(mockLeaflet.map.fitBounds).toHaveBeenCalled();
  });

  it('cleans up map instance on unmount', () => {
    const routeData = [{ latitude: 3.14, longitude: 101.68 }];

    const { unmount } = render(<LeafletMap routeData={routeData} />);
    unmount();

    expect(mockLeaflet.map.remove).toHaveBeenCalledTimes(1);
  });
});
