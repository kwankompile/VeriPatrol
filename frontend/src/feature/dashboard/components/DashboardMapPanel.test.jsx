import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import DashboardMapPanel from './DashboardMapPanel';

const mockAddLeafletBaseLayersControl = vi.fn();

vi.mock('utils/leafletBaseLayers', () => ({
  addLeafletBaseLayersControl: (...args) => mockAddLeafletBaseLayersControl(...args)
}));

function createLayerStub() {
  const layer = {
    addTo: vi.fn(function addTo() {
      return layer;
    }),
    bindPopup: vi.fn(function bindPopup() {
      return layer;
    })
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
    marker: vi.fn(() => createLayerStub()),
    latLngBounds: vi.fn((points) => ({ points })),
    divIcon: vi.fn((options) => options)
  };

  return { L, map };
}

describe('DashboardMapPanel', () => {
  let mockLeaflet;

  beforeEach(() => {
    mockLeaflet = createMockLeaflet();
    window.L = mockLeaflet.L;
    mockAddLeafletBaseLayersControl.mockReset();
  });

  afterEach(() => {
    delete window.L;
  });

  it('renders empty state without recenter button when no locations exist', () => {
    render(<DashboardMapPanel locations={[]} />);

    expect(screen.getByTestId('dashboard-map-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-map-recenter-button')).not.toBeInTheDocument();
    expect(mockLeaflet.L.map).not.toHaveBeenCalled();
  });

  it('renders map with layer control and recenter button when locations exist', () => {
    const locations = [
      { sessionId: 'p1', guardName: 'Guard A', zoneName: 'Zone 1', latitude: 3.14, longitude: 101.68 }
    ];

    render(<DashboardMapPanel locations={locations} />);

    expect(screen.getByTestId('dashboard-map-panel')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-map-recenter-button')).toBeInTheDocument();
    expect(mockLeaflet.L.map).toHaveBeenCalledTimes(1);
    expect(mockAddLeafletBaseLayersControl).toHaveBeenCalledWith(mockLeaflet.L, mockLeaflet.map, { position: 'topright' });
    expect(mockLeaflet.map.setView).toHaveBeenCalledWith([3.14, 101.68], 15);
  });

  it('calls fitBounds when recenter is clicked with multiple marker points', async () => {
    const user = userEvent.setup();
    const locations = [
      { sessionId: 'p1', guardName: 'Guard A', zoneName: 'Zone 1', latitude: 3.14, longitude: 101.68 },
      { sessionId: 'p2', guardName: 'Guard B', zoneName: 'Zone 2', latitude: 3.15, longitude: 101.69 }
    ];

    render(<DashboardMapPanel locations={locations} />);
    mockLeaflet.map.fitBounds.mockClear();

    await user.click(screen.getByTestId('dashboard-map-recenter-button'));

    expect(mockLeaflet.map.fitBounds).toHaveBeenCalled();
    expect(mockLeaflet.L.latLngBounds).toHaveBeenCalled();
  });

  it('cleans up map instance on unmount', () => {
    const locations = [{ sessionId: 'p1', latitude: 3.14, longitude: 101.68 }];

    const { unmount } = render(<DashboardMapPanel locations={locations} />);
    unmount();

    expect(mockLeaflet.map.remove).toHaveBeenCalledTimes(1);
  });
});
