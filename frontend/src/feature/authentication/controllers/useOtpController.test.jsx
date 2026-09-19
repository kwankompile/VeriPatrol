import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import useOtpController from './useOtpController';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, getDefaultRouteForRole } from 'utils/auth';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      state: {
        loginChallengeId: 'challenge-123',
        email: 'user@example.com',
        expiresIn: 300
      }
    })
  };
});

vi.mock('../repositories/authRepository', () => ({
  AuthRepository: vi.fn().mockImplementation(() => ({
    verifyOtp: vi.fn()
  }))
}));

import { AuthRepository } from '../repositories/authRepository';

function OtpHarness() {
  const controller = useOtpController();

  return (
    <form onSubmit={controller.handleSubmit}>
      <input
        aria-label="otp"
        value={controller.otp}
        onChange={(event) => controller.setOtp(event.target.value)}
      />
      {controller.submitError ? <div>{controller.submitError}</div> : null}
      <button type="submit">Verify</button>
    </form>
  );
}

describe('useOtpController', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    vi.mocked(AuthRepository).mockClear();
  });

  it('stores access token and navigates on successful OTP verification', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      accessToken: 'jwt-token',
      user: { id: '1', email: 'user@example.com', two_factor_enabled: true },
      role: 'Guard'
    });

    vi.mocked(AuthRepository).mockImplementation(() => ({
      verifyOtp
    }));

    render(
      <MemoryRouter>
        <OtpHarness />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText('otp'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('jwt-token');
    });

    expect(verifyOtp).toHaveBeenCalledWith({
      login_challenge_id: 'challenge-123',
      otp: '123456'
    });
    expect(mockNavigate).toHaveBeenCalledWith(getDefaultRouteForRole('Guard'), { replace: true });
    expect(getDefaultRouteForRole('Guard')).toBe('/dashboard');
  });

  it('shows safe error on OTP verification failure', async () => {
    const verifyOtp = vi.fn().mockRejectedValue({
      data: { message: 'The authentication code is invalid or expired.' }
    });

    vi.mocked(AuthRepository).mockImplementation(() => ({
      verifyOtp
    }));

    render(
      <MemoryRouter>
        <OtpHarness />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText('otp'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(screen.getByText('The authentication code is invalid or expired.')).toBeInTheDocument();
    });

    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });
});
