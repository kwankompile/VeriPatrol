import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AuthLogin from './AuthLogin';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, getDefaultRouteForRole, setAuthToken } from 'utils/auth';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('api/api', () => ({
  default: {
    post: vi.fn()
  }
}));

import api from 'api/api';

describe('AuthLogin auth routing', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('routes setup-required login to first-login setup without storing access token', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          next_step: 'password_setup_required',
          setup_token: 'setup-token-abc',
          expires_in: 3600,
          user: { email: 'new@example.com', setup_required: true }
        }
      }
    });

    render(
      <MemoryRouter>
        <AuthLogin />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email address/i), 'new@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'TempPassword1!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/first-login/setup', {
        replace: true,
        state: {
          setupToken: 'setup-token-abc',
          email: 'new@example.com',
          expiresIn: 3600
        }
      });
    });

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('routes two_factor_setup_required login to first-login 2FA without storing access token', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          next_step: 'two_factor_setup_required',
          two_factor_setup_token: '2fa-token-abc',
          expires_in: 600,
          user: { email: 'user@example.com', setup_required: false, two_factor_enabled: false }
        }
      }
    });

    render(
      <MemoryRouter>
        <AuthLogin />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/first-login/2fa', {
        replace: true,
        state: {
          twoFactorSetupToken: '2fa-token-abc',
          email: 'user@example.com',
          expiresIn: 600
        }
      });
    });

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('routes otp_required login to login OTP without storing access token', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          next_step: 'otp_required',
          login_challenge_id: 'challenge-123',
          expires_in: 300,
          user: { email: 'user@example.com' }
        }
      }
    });

    render(
      <MemoryRouter>
        <AuthLogin />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login/otp', {
        replace: true,
        state: {
          loginChallengeId: 'challenge-123',
          email: 'user@example.com',
          expiresIn: 300
        }
      });
    });

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('stores access token and navigates on direct login success', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          access_token: 'jwt-token',
          token_type: 'bearer',
          expires_in: 1800,
          role: 'Guard',
          user: { id: '1', email: 'guard@example.com', two_factor_enabled: true }
        }
      }
    });

    render(
      <MemoryRouter>
        <AuthLogin />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email address/i), 'guard@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('jwt-token');
    });

    expect(mockNavigate).toHaveBeenCalledWith(getDefaultRouteForRole('Guard'), { replace: true });
    expect(getDefaultRouteForRole('Guard')).toBe('/dashboard');
  });

  it('calls login with skipAuthRefresh', async () => {
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          next_step: 'otp_required',
          login_challenge_id: 'challenge-123',
          expires_in: 300,
          user: { email: 'user@example.com' }
        }
      }
    });

    render(
      <MemoryRouter>
        <AuthLogin />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/auth/login',
        { email: 'user@example.com', password: 'Password123!' },
        { skipAuthRefresh: true }
      );
    });
  });

  it('displays backend lockout message on 429', async () => {
    vi.mocked(api.post).mockRejectedValue({
      status: 429,
      data: {
        success: false,
        message: 'Too many unsuccessful sign-in attempts. Please try again later.',
        data: { retry_after: 900 }
      }
    });

    render(
      <MemoryRouter>
        <AuthLogin />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Too many unsuccessful sign-in attempts. Please try again later.')
      ).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
  });

  it('clears password on 429 lockout', async () => {
    vi.mocked(api.post).mockRejectedValue({
      status: 429,
      data: {
        success: false,
        message: 'Too many unsuccessful sign-in attempts. Please try again later.'
      }
    });

    render(
      <MemoryRouter>
        <AuthLogin />
      </MemoryRouter>
    );

    const passwordInput = screen.getByLabelText(/^password$/i);
    await userEvent.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await userEvent.type(passwordInput, 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(passwordInput).toHaveValue('');
    });
  });
});
