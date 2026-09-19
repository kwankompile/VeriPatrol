import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'test/testUtils';
import LiveIndicator from 'ui-component/LiveIndicator';
import AnprLiveIndicator from './AnprLiveIndicator';
import AnprEventTable from './AnprEventTable';
import AnprEventSummaryCards from './AnprEventSummaryCards';
import AnprEvidenceGallery from './AnprEvidenceGallery';

vi.mock('utils/auth', () => ({
  hasRole: vi.fn(() => true),
  ROLES: { ADMIN: 'Admin' },
  getAuthToken: vi.fn(() => 'token')
}));

describe('LiveIndicator', () => {
  it('renders live status with tooltip', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LiveIndicator status="live" />);
    const indicator = screen.getByRole('status', { name: /live update/i });
    expect(indicator).toBeInTheDocument();
    await user.hover(indicator);
    expect(await screen.findByText(/Live update/i)).toBeInTheDocument();
  });

  it('does not render LIVE text label', () => {
    renderWithProviders(<LiveIndicator status="live" />);
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });
});

describe('AnprLiveIndicator', () => {
  it('re-exports LiveIndicator', () => {
    renderWithProviders(<AnprLiveIndicator status="reconnecting" />);
    expect(screen.getByRole('status', { name: /last refresh failed/i })).toBeInTheDocument();
  });
});

describe('AnprEventTable', () => {
  const events = [
    {
      id: 'evt-1',
      plateNumber: 'ABC1234',
      confidencePercent: '90.0%',
      detectionTime: '2026-01-01T10:00:00Z',
      camera: { name: 'Gate Camera' },
      isValid: true,
      isFlagged: false,
      hasEvidence: true,
      evidenceCount: 2
    }
  ];

  it('renders rows and calls detail handler', async () => {
    const user = userEvent.setup();
    const onViewDetails = vi.fn();
    renderWithProviders(<AnprEventTable events={events} highlightedEventIds={['evt-1']} onViewDetails={onViewDetails} />);

    expect(screen.getByText('ABC1234')).toBeInTheDocument();
    expect(screen.getByText('2 images')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^view$/i }));
    expect(onViewDetails).toHaveBeenCalledWith('evt-1');
  });
});

describe('AnprEventSummaryCards', () => {
  it('displays linked vehicle context for admin', () => {
    renderWithProviders(
      <AnprEventSummaryCards
        event={{
          plateNumber: 'ABC1234',
          confidencePercent: '90.0%',
          formattedDetectionTime: '1 Jan 2026, 6:00 pm',
          evidenceCount: 1,
          hasEvidence: true,
          vehicle: {
            id: 'veh-1',
            plateNumber: 'ABC1234',
            ownerName: 'Jane Owner',
            vehicleType: 'car',
            status: 'normal',
            source: 'manual',
            isAutoDetected: false
          }
        }}
      />
    );

    expect(screen.getByText(/Jane Owner/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open vehicle record/i })).toBeInTheDocument();
  });

  it('handles auto-detected unknown vehicle', async () => {
    const auth = await import('utils/auth');
    auth.hasRole.mockReturnValue(false);

    renderWithProviders(
      <AnprEventSummaryCards
        event={{
          plateNumber: 'XYZ7788',
          confidencePercent: '80.0%',
          formattedDetectionTime: '1 Jan 2026, 6:00 pm',
          evidenceCount: 0,
          hasEvidence: false,
          vehicle: {
            id: 'veh-2',
            plateNumber: 'XYZ7788',
            ownerName: null,
            status: 'normal',
            source: 'auto_detected',
            isAutoDetected: true
          }
        }}
      />
    );

    expect(screen.getByText(/auto-detected vehicle record/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open vehicle record/i })).not.toBeInTheDocument();
  });
});

describe('AnprEvidenceGallery', () => {
  it('handles missing images safely', () => {
    renderWithProviders(<AnprEvidenceGallery images={[]} imageMap={{}} />);
    expect(screen.getByText('Evidence gallery')).toBeInTheDocument();
    expect(screen.getAllByText(/preview unavailable|no .* image registered/i).length).toBeGreaterThan(0);
  });

  it('renders available evidence previews safely', () => {
    renderWithProviders(
      <AnprEvidenceGallery
        images={[
          {
            id: 'img-1',
            imageType: 'full',
            previewUrl: 'https://example.com/full.jpg',
            filePath: 'events/evt/full.jpg',
            fileSize: 1024,
            resolution: '640x480'
          }
        ]}
        imageMap={{
          full: {
            id: 'img-1',
            imageType: 'full',
            previewUrl: 'https://example.com/full.jpg',
            filePath: 'events/evt/full.jpg',
            fileSize: 1024,
            resolution: '640x480'
          }
        }}
      />
    );

    expect(screen.getByText('Full frame')).toBeInTheDocument();
    expect(screen.getByAltText('Full frame evidence')).toBeInTheDocument();
  });
});
