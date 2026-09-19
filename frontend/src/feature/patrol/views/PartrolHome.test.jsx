import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'test/testUtils';
import PatrolHome from '../views/PartrolHome';

const mockCompletePatrol = vi.fn();
const mockHandleStartPatrol = vi.fn();
const mockWarmUpCurrentLocation = vi.fn();
const mockStopPrePatrolLocationDetection = vi.fn();

let mockController = {};

vi.mock('../controllers/usePatrolController', () => ({
  usePatrolController: () => mockController
}));

vi.mock('../datasources/patrolService', () => ({ default: {} }));

vi.mock('../components/PatrolPwaStatusPanel', () => ({
  default: () => <div data-testid="patrol-pwa-status-panel" />
}));

vi.mock('../components/PatrolTracking', () => ({
  PatrolTracking: () => <div data-testid="patrol-tracking" />
}));

function baseController(overrides = {}) {
  return {
    formData: { zone_id: '' },
    errors: {},
    zoneOptions: [{ value: 'z1', label: 'Zone A' }],
    patrolLoading: false,
    cpNumber: 0,
    progress: 0,
    completedCount: 0,
    totalCount: 0,
    checkpointLogs: [],
    currentPosition: null,
    gpsHealthStatus: 'inactive',
    gpsAccuracyMeters: null,
    patrolTrackingActive: false,
    patrols: { data: null },
    patrolSummary: null,
    patrolSummaryLoading: false,
    patrolSummaryError: null,
    summaryMayBeIncomplete: false,
    validatingPatrol: false,
    validationError: null,
    validationResult: null,
    validationWarning: null,
    finalizingStep: 'idle',
    isFinalizingPatrol: false,
    distanceCalc: null,
    handleChange: () => () => {},
    handleStartPatrol: mockHandleStartPatrol,
    completePatrol: mockCompletePatrol,
    warmUpCurrentLocation: mockWarmUpCurrentLocation,
    stopPrePatrolLocationDetection: mockStopPrePatrolLocationDetection,
    ...overrides
  };
}

describe('PatrolHome', () => {
  beforeEach(() => {
    mockCompletePatrol.mockReset();
    mockHandleStartPatrol.mockReset();
    mockWarmUpCurrentLocation.mockReset();
    mockStopPrePatrolLocationDetection.mockReset();
    mockController = baseController();
  });

  it('shows clear start panel when patrol is inactive', () => {
    renderWithProviders(<PatrolHome />);
    expect(screen.getByTestId('patrol-start-panel')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-start-button')).toBeInTheDocument();
    expect(screen.queryByTestId('patrol-active-panel')).not.toBeInTheDocument();
  });

  it('triggers auto location detection when patrol page loads', () => {
    renderWithProviders(<PatrolHome />);
    expect(mockWarmUpCurrentLocation).toHaveBeenCalled();
  });

  it('shows active patrol progress and health surfaces', () => {
    mockController = baseController({
      cpNumber: 3,
      totalCount: 3,
      completedCount: 1,
      progress: 33,
      patrolTrackingActive: true,
      gpsHealthStatus: 'active',
      gpsAccuracyMeters: 14,
      currentPosition: { coords: { latitude: 1, longitude: 2, accuracy: 14 } },
      patrols: { data: { id: 'p1' } }
    });

    renderWithProviders(<PatrolHome />);
    expect(screen.getByTestId('patrol-active-panel')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-tracking')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-gps-health-chip')).toBeInTheDocument();
    expect(screen.getByTestId('patrol-pwa-status-panel')).toBeInTheDocument();
  });

  it('opens poor GPS dialog when Start Patrol is clicked with accuracy over 75m', async () => {
    const user = userEvent.setup();
    mockController = baseController({
      formData: { zone_id: 'z1' },
      gpsAccuracyMeters: 120
    });

    renderWithProviders(<PatrolHome />);
    await user.click(screen.getByTestId('patrol-start-button'));

    expect(screen.getByTestId('poor-gps-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Current GPS accuracy is 120m/)).toBeInTheDocument();
    expect(mockHandleStartPatrol).not.toHaveBeenCalled();
  });

  it('does not start patrol when Wait for better GPS is clicked', async () => {
    const user = userEvent.setup();
    mockController = baseController({
      formData: { zone_id: 'z1' },
      gpsAccuracyMeters: 120
    });

    renderWithProviders(<PatrolHome />);
    await user.click(screen.getByTestId('patrol-start-button'));
    await user.click(screen.getByTestId('poor-gps-wait-button'));

    expect(mockHandleStartPatrol).not.toHaveBeenCalled();
  });

  it('starts patrol when Start anyway is clicked from poor GPS dialog', async () => {
    const user = userEvent.setup();
    mockController = baseController({
      formData: { zone_id: 'z1' },
      gpsAccuracyMeters: 120
    });

    renderWithProviders(<PatrolHome />);
    await user.click(screen.getByTestId('patrol-start-button'));
    await user.click(screen.getByTestId('poor-gps-start-anyway-button'));

    expect(mockHandleStartPatrol).toHaveBeenCalledTimes(1);
  });

  it('starts patrol without warning when GPS accuracy is 14m', async () => {
    const user = userEvent.setup();
    mockController = baseController({
      formData: { zone_id: 'z1' },
      gpsAccuracyMeters: 14
    });

    renderWithProviders(<PatrolHome />);
    await user.click(screen.getByTestId('patrol-start-button'));

    expect(screen.queryByTestId('poor-gps-dialog')).not.toBeInTheDocument();
    expect(mockHandleStartPatrol).toHaveBeenCalledTimes(1);
  });

  it('opens stop confirmation before finalization', async () => {
    const user = userEvent.setup();
    mockController = baseController({
      cpNumber: 2,
      totalCount: 2,
      patrolTrackingActive: true,
      patrols: { data: { id: 'p1' } }
    });

    renderWithProviders(<PatrolHome />);
    await user.click(screen.getByTestId('patrol-stop-button'));
    expect(screen.getByTestId('patrol-stop-confirm-dialog')).toBeInTheDocument();
    expect(mockCompletePatrol).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('patrol-stop-confirm-button'));
    expect(mockCompletePatrol).toHaveBeenCalledTimes(1);
  });
});
