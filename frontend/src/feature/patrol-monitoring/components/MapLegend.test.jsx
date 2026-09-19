import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import MapLegend from './MapLegend';
import { MAP_ROUTE_LEGEND_ITEMS } from '../utils/mapLegendUtils';
import { CHECKPOINT_STATUS_HELP } from '../utils/patrolStatusUtils';

describe('MapLegend', () => {
  it('renders route, anomaly, and checkpoint legend sections', () => {
    render(<MapLegend gapCount={2} anomalyCount={3} />);

    expect(screen.getByTestId('map-legend-content')).toBeInTheDocument();
    expect(screen.getByTestId('map-legend-route-patrol_trail')).toBeInTheDocument();
    expect(screen.getByTestId('map-legend-anomaly-gps_jump')).toBeInTheDocument();
    expect(screen.getByTestId('map-legend-checkpoint-verified')).toBeInTheDocument();
    expect(screen.getByText(/2 GPS gaps detected/i)).toBeInTheDocument();
    expect(screen.getByText(/3 movement review items/i)).toBeInTheDocument();
  });

  it('shows hover tooltip for a route legend item', async () => {
    const user = userEvent.setup();
    render(<MapLegend />);

    const patrolTrail = MAP_ROUTE_LEGEND_ITEMS.find((item) => item.key === 'patrol_trail');
    await user.hover(screen.getByTestId('map-legend-route-patrol_trail'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(patrolTrail.description);
  });

  it('shows hover tooltip for a checkpoint status legend item', async () => {
    const user = userEvent.setup();
    render(<MapLegend />);

    await user.hover(screen.getByTestId('map-legend-checkpoint-verified'));

    expect(await screen.findByRole('tooltip')).toHaveTextContent(CHECKPOINT_STATUS_HELP.verified.description);
  });
});
