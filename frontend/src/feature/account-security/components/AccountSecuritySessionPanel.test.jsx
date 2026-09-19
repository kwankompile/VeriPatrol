import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import AccountSecuritySessionPanel from './AccountSecuritySessionPanel';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from 'utils/auth';

const mockNavigate = vi.fn();
const mockRevokeSession = vi.fn();
const mockLogoutAllSessions = vi.fn();
const mockGetSessions = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('../../auth-monitoring/datasources/authMonitoringService', () => ({
  default: {
    getSessions: (...args) => mockGetSessions(...args),
    revokeSession: (...args) => mockRevokeSession(...args),
    logoutAllSessions: (...args) => mockLogoutAllSessions(...args)
  },
  unwrapPaginatedEnvelope: (envelope) => ({
    rows: envelope?.data ?? [],
    meta: { total: envelope?.data?.length ?? 0, current_page: 1, last_page: 1, per_page: 25 }
  })
}));

vi.mock('services/realtime/broadcastService', () => ({
  default: { disconnect: vi.fn() }
}));

let mockIsOnline = true;

vi.mock('pwa/useNetworkStatus', () => ({
  useNetworkStatus: () => mockIsOnline
}));

describe('AccountSecuritySessionPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockIsOnline = true;
    mockGetSessions.mockResolvedValue({
      data: [
        {
          id: 'session-current',
          ip_address: '127.0.0.1',
          user_agent: 'Vitest',
          created_at: '2026-07-02T10:00:00+00:00',
          last_used_at: '2026-07-02T10:05:00+00:00',
          expires_at: '2026-07-02T22:00:00+00:00',
          is_active: true,
          is_current: true
        }
      ]
    });
    mockRevokeSession.mockResolvedValue({ success: true });
    mockLogoutAllSessions.mockResolvedValue({ success: true });
  });

  it('loads and renders active sessions without raw tokens', async () => {
    render(
      <MemoryRouter>
        <AccountSecuritySessionPanel />
      </MemoryRouter>
    );

    expect(await screen.findByText('Active Sessions')).toBeInTheDocument();
    expect(await screen.findByText(/current/i)).toBeInTheDocument();
    expect(screen.queryByText(/refresh_token/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/jwt/i)).not.toBeInTheDocument();
    expect(mockGetSessions).toHaveBeenCalledWith(expect.objectContaining({ scope: 'mine' }));
  });

  it('hides pagination when there are no sessions', async () => {
    mockGetSessions.mockResolvedValue({ data: [] });

    render(
      <MemoryRouter>
        <AccountSecuritySessionPanel />
      </MemoryRouter>
    );

    expect(await screen.findByText('No active sessions found.')).toBeInTheDocument();
    expect(screen.queryByText(/of 0/)).not.toBeInTheDocument();
  });

  it('disables session revocation while offline', async () => {
    mockIsOnline = false;

    render(
      <MemoryRouter>
        <AccountSecuritySessionPanel />
      </MemoryRouter>
    );

    expect(await screen.findByText('Session revocation requires an active network connection.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke all sessions' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
  });

  it('revoking the current session clears auth state and navigates to login', async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, 'token');
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify({ id: '1', email: 'guard@example.com' }));

    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <AccountSecuritySessionPanel />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Revoke' });
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(mockRevokeSession).toHaveBeenCalledWith('session-current');
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    });
  });
});
