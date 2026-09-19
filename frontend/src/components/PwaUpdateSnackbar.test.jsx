import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PwaUpdateSnackbar from './PwaUpdateSnackbar';

const mockReloadUpdate = vi.fn();

vi.mock('pwa/useServiceWorkerUpdate', () => ({
  default: vi.fn()
}));

import useServiceWorkerUpdate from 'pwa/useServiceWorkerUpdate';

describe('PwaUpdateSnackbar', () => {
  beforeEach(() => {
    mockReloadUpdate.mockClear();
  });

  it('does not show when no update is available', () => {
    useServiceWorkerUpdate.mockReturnValue({
      updateAvailable: false,
      reloadUpdate: mockReloadUpdate
    });

    render(<PwaUpdateSnackbar />);

    expect(screen.queryByText('New update available')).not.toBeInTheDocument();
  });

  it('shows update snackbar when a waiting service worker exists', () => {
    useServiceWorkerUpdate.mockReturnValue({
      updateAvailable: true,
      reloadUpdate: mockReloadUpdate
    });

    render(<PwaUpdateSnackbar />);

    expect(screen.getByTestId('pwa-update-snackbar')).toBeVisible();
    expect(screen.getByText('New update available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload now' })).toBeInTheDocument();
  });

  it('calls reloadUpdate when Reload now is clicked', () => {
    useServiceWorkerUpdate.mockReturnValue({
      updateAvailable: true,
      reloadUpdate: mockReloadUpdate
    });

    render(<PwaUpdateSnackbar />);

    fireEvent.click(screen.getByTestId('pwa-update-reload'));

    expect(mockReloadUpdate).toHaveBeenCalledTimes(1);
  });
});
