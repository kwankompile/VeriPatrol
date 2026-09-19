import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import useTwoFactorSetupController from './useTwoFactorSetupController';
import { AUTH_TOKEN_KEY } from 'utils/auth';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({
      state: {
        twoFactorSetupToken: 'setup-token',
        email: 'user@example.com',
        expiresIn: 600
      }
    })
  };
});

vi.mock('../repositories/authRepository', () => ({
  AuthRepository: vi.fn().mockImplementation(() => ({
    startTwoFactorSetup: vi.fn(),
    verifyTwoFactorSetup: vi.fn()
  }))
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: () => null
}));

import { AuthRepository } from '../repositories/authRepository';

function SetupHarness() {
  const controller = useTwoFactorSetupController();

  if (controller.missingSetupContext) {
    return <div>Missing setup context</div>;
  }

  return (
    <div>
      <div>{controller.manualKey}</div>
      <div>{controller.otpauthUri}</div>
      <form onSubmit={controller.handleSubmit}>
        <input
          aria-label="otp"
          value={controller.otp}
          onChange={(event) => controller.setOtp(event.target.value)}
        />
        <button type="submit">Verify</button>
      </form>
    </div>
  );
}

describe('useTwoFactorSetupController', () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    vi.mocked(AuthRepository).mockClear();
  });

  it('starts setup and displays manual key and otpauth uri', async () => {
    const startTwoFactorSetup = vi.fn().mockResolvedValue({
      manualKey: 'BASE32SECRET',
      otpauthUri: 'otpauth://totp/Example:user@example.com?secret=BASE32SECRET&issuer=Example',
      expiresIn: 600
    });
    const verifyTwoFactorSetup = vi.fn();

    vi.mocked(AuthRepository).mockImplementation(() => ({
      startTwoFactorSetup,
      verifyTwoFactorSetup
    }));

    render(
      <MemoryRouter>
        <SetupHarness />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('BASE32SECRET')).toBeInTheDocument();
    });

    expect(startTwoFactorSetup).toHaveBeenCalledWith({
      two_factor_setup_token: 'setup-token'
    });
    expect(screen.getByText(/otpauth:\/\/totp/i)).toBeInTheDocument();
  });

  it('stores access token and navigates after successful setup verify', async () => {
    const startTwoFactorSetup = vi.fn().mockResolvedValue({
      manualKey: 'BASE32SECRET',
      otpauthUri: 'otpauth://totp/test',
      expiresIn: 600
    });
    const verifyTwoFactorSetup = vi.fn().mockResolvedValue({
      accessToken: 'jwt-token',
      user: { id: '1', email: 'user@example.com', two_factor_enabled: true },
      role: 'Admin'
    });

    vi.mocked(AuthRepository).mockImplementation(() => ({
      startTwoFactorSetup,
      verifyTwoFactorSetup
    }));

    render(
      <MemoryRouter>
        <SetupHarness />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('BASE32SECRET')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByLabelText('otp'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe('jwt-token');
    });

    expect(verifyTwoFactorSetup).toHaveBeenCalledWith({
      two_factor_setup_token: 'setup-token',
      otp: '123456'
    });
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});

describe('useTwoFactorSetupController missing route state', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reports missing setup context when route state is absent', async () => {
    vi.doMock('react-router-dom', async () => {
      const actual = await vi.importActual('react-router-dom');
      return {
        ...actual,
        useNavigate: () => mockNavigate,
        useLocation: () => ({ state: null })
      };
    });

    const { default: controllerHook } = await import('./useTwoFactorSetupController');

    function MissingHarness() {
      const controller = controllerHook();
      return controller.missingSetupContext ? <div>Missing setup context</div> : null;
    }

    render(
      <MemoryRouter>
        <MissingHarness />
      </MemoryRouter>
    );

    expect(screen.getByText('Missing setup context')).toBeInTheDocument();
  });
});
