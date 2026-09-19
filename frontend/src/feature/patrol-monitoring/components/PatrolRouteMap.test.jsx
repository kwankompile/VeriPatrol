import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PatrolRouteMap from './PatrolRouteMap';

const mockAddLeafletBaseLayersControl = vi.fn();

vi.mock('utils/leafletBaseLayers', () => ({
  addLeafletBaseLayersControl: (...args) => mockAddLeafletBaseLayersControl(...args)
}));

function createLayerStub(type) {
  const layer = {
    type,
    addTo: vi.fn(function addTo() {
      return layer;
    }),
    bindPopup: vi.fn(function bindPopup() {
      return layer;
    }),
    setLatLng: vi.fn(),
    setRadius: vi.fn(),
    setStyle: vi.fn(),
    addLatLng: vi.fn(),
    openPopup: vi.fn()
  };
  return layer;
}

function createMockLeaflet() {
  const map = {
    invalidateSize: vi.fn(),
    fitBounds: vi.fn(),
    setView: vi.fn(),
    removeLayer: vi.fn(),
    remove: vi.fn()
  };

  const L = {
    map: vi.fn(() => map),
    polyline: vi.fn(() => createLayerStub('polyline')),
    marker: vi.fn(() => createLayerStub('marker')),
    circleMarker: vi.fn(() => createLayerStub('circleMarker')),
    latLngBounds: vi.fn((points) => ({ points })),
    divIcon: vi.fn((options) => options)
  };

  return { L, map };
}

describe('PatrolRouteMap', () => {
  let mockLeaflet;

  beforeEach(() => {
    mockLeaflet = createMockLeaflet();
    window.L = mockLeaflet.L;
    mockAddLeafletBaseLayersControl.mockReset();
  });

  afterEach(() => {
    delete window.L;
  });

  it('initializes Leaflet without temporal dead zone errors', () => {
    const routes = [
      { id: 'r1', latitude: 3.14, longitude: 101.68, recorded_at: '2026-01-01T10:00:00Z' },
      { id: 'r2', latitude: 3.15, longitude: 101.69, recorded_at: '2026-01-01T10:01:00Z' }
    ];

    expect(() =>
      render(
        <PatrolRouteMap
          routes={routes}
          checkpointEvents={[
            {
              id: 'e1',
              status: 'verified',
              checkpoint: { name: 'CP1', latitude: 3.14, longitude: 101.68 }
            }
          ]}
        />
      )
    ).not.toThrow();

    expect(mockLeaflet.L.map).toHaveBeenCalledTimes(1);
    expect(mockAddLeafletBaseLayersControl).toHaveBeenCalledWith(mockLeaflet.L, mockLeaflet.map);
    expect(mockLeaflet.L.polyline).toHaveBeenCalled();
    expect(mockLeaflet.L.marker).toHaveBeenCalled();
    expect(mockLeaflet.map.fitBounds).toHaveBeenCalled();
  });

  it('cleans up map instance on unmount', () => {
    const routes = [{ id: 'r1', latitude: 3.14, longitude: 101.68, recorded_at: '2026-01-01T10:00:00Z' }];

    const { unmount } = render(<PatrolRouteMap routes={routes} />);
    unmount();

    expect(mockLeaflet.map.remove).toHaveBeenCalledTimes(1);
  });

  it('renders recenter button at bottom-left of the map', () => {
    const routes = [{ id: 'r1', latitude: 3.14, longitude: 101.68, recorded_at: '2026-01-01T10:00:00Z' }];

    render(<PatrolRouteMap routes={routes} />);

    const button = screen.getByTestId('patrol-map-recenter-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Recenter map');
    expect(button).toHaveStyle({ left: '12px', bottom: '12px' });
  });

  it('calls fitBounds when recenter is clicked with route data', async () => {
    const user = userEvent.setup();
    const routes = [
      { id: 'r1', latitude: 3.14, longitude: 101.68, recorded_at: '2026-01-01T10:00:00Z' },
      { id: 'r2', latitude: 3.15, longitude: 101.69, recorded_at: '2026-01-01T10:01:00Z' }
    ];

    render(<PatrolRouteMap routes={routes} />);
    mockLeaflet.map.fitBounds.mockClear();

    await user.click(screen.getByTestId('patrol-map-recenter-button'));

    expect(mockLeaflet.map.fitBounds).toHaveBeenCalled();
    expect(mockLeaflet.L.latLngBounds).toHaveBeenCalled();
  });
});
