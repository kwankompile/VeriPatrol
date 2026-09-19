import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithProviders } from 'test/testUtils';
import { VehicleManagementRepository } from './repositories/VehicleManagementRepository';
import VehicleEditDrawer from './components/VehicleEditDrawer';

describe('VehicleManagementRepository', () => {
  it('normalizes vehicle payloads', () => {
    const repo = new VehicleManagementRepository({});
    const normalized = repo.normalizeVehicle({
      id: 'veh-1',
      plate_number: 'ABC1234',
      owner_name: 'Owner',
      vehicle_type: 'car',
      status: 'normal',
      source: 'manual',
      notes: 'Short note'
    });
    expect(normalized.plateNumber).toBe('ABC1234');
    expect(normalized.isAutoDetected).toBe(false);
  });

  it('builds update payload with only allowed fields', () => {
    const repo = new VehicleManagementRepository({});
    const payload = repo.buildUpdatePayload({
      ownerName: ' Updated ',
      vehicleType: ' van ',
      status: 'flagged',
      notes: '  Watch  ',
      plateNumber: 'SHOULD-NOT-SEND',
      source: 'manual'
    });
    expect(payload).toEqual({
      owner_name: 'Updated',
      vehicle_type: 'van',
      status: 'flagged',
      notes: 'Watch'
    });
  });

  it('handles paginated list envelope', async () => {
    const dataSource = {
      getVehicles: vi.fn().mockResolvedValue({
        success: true,
        data: {
          data: [{ id: 'veh-1', plate_number: 'ABC1234', status: 'normal', source: 'manual' }],
          total: 1,
          current_page: 1,
          last_page: 1,
          per_page: 10
        }
      })
    };
    const repo = new VehicleManagementRepository(dataSource);
    const result = await repo.getVehicles({});
    expect(result.vehicles).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });
});

describe('VehicleEditDrawer', () => {
  const vehicle = {
    plateNumber: 'ABC1234',
    sourceLabel: 'Manual',
    ownerName: 'Owner',
    vehicleType: 'car',
    status: 'normal',
    notes: 'Note'
  };

  it('keeps plate and source read-only and submits allowed fields only', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderWithProviders(<VehicleEditDrawer open vehicle={vehicle} saving={false} onClose={() => {}} onSave={onSave} />);

    const plateField = screen.getByLabelText(/plate number/i);
    const sourceField = screen.getByLabelText(/source/i);
    expect(plateField).toBeDisabled();
    expect(sourceField).toBeDisabled();

    await user.clear(screen.getByLabelText(/owner name/i));
    await user.type(screen.getByLabelText(/owner name/i), 'New Owner');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(onSave).toHaveBeenCalledWith({
      ownerName: 'New Owner',
      vehicleType: 'car',
      status: 'normal',
      notes: 'Note'
    });
  });
});
