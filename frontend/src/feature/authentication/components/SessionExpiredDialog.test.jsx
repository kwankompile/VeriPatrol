import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AUTH_SESSION_EXPIRED_EVENT, SESSION_EXPIRED_FLAG_KEY, markSessionExpired } from 'utils/auth';

import SessionExpiredDialog from './SessionExpiredDialog';

describe('SessionExpiredDialog', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('shows when session expired flag is present on mount', async () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG_KEY, '1');

    render(<SessionExpiredDialog />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText('Your session has expired. Please sign in again to continue.')).toBeInTheDocument();
  });

  it('opens when auth:session-expired event fires', async () => {
    render(<SessionExpiredDialog />);

    act(() => {
      markSessionExpired();
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('is dismissible', async () => {
    sessionStorage.setItem(SESSION_EXPIRED_FLAG_KEY, '1');
    const user = userEvent.setup();

    render(<SessionExpiredDialog />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('does not store sensitive data in sessionStorage', () => {
    markSessionExpired();
    render(<SessionExpiredDialog />);

    expect(sessionStorage.getItem(SESSION_EXPIRED_FLAG_KEY)).toBeNull();
    expect(Object.keys(sessionStorage)).toEqual([]);
  });
});

describe('SessionExpiredDialog event listener', () => {
  it('responds to custom event name', async () => {
    render(<SessionExpiredDialog />);

    act(() => {
      window.dispatchEvent(new CustomEvent(AUTH_SESSION_EXPIRED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});
