import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockCompletePasswordSetup = vi.fn();
const mockNavigate = vi.fn();

vi.mock('../datasources/authService', () => ({
  default: {
    completePasswordSetup: (...args) => mockCompletePasswordSetup(...args)
  }
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

import usePasswordSetupController from './usePasswordSetupController';

function SetupHarness() {
  const controller = usePasswordSetupController();

  return (
    <form onSubmit={controller.handleSubmit}>
      <input
        aria-label="password"
        value={controller.password}
        onChange={(event) => controller.setPassword(event.target.value)}
      />
      <input
        aria-label="confirm"
        value={controller.passwordConfirmation}
        onChange={(event) => controller.setPasswordConfirmation(event.target.value)}
      />
      <button type="submit">Submit</button>
      {controller.submitError ? <div role="alert">{controller.submitError}</div> : null}
    </form>
  );
}

describe('usePasswordSetupController', () => {
  beforeEach(() => {
    mockCompletePasswordSetup.mockReset();
    mockNavigate.mockReset();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('submits setup token and new password without persisting setup token', async () => {
    mockCompletePasswordSetup.mockResolvedValue({
      nextStep: 'two_factor_setup_required',
      twoFactorSetupToken: '2fa-setup-token',
      expiresIn: 600,
      user: { email: 'user@example.com', setup_required: false }
    });

    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/first-login/setup',
            state: { setupToken: 'plain-setup-token', email: 'user@example.com' }
          }
        ]}
      >
        <Routes>
          <Route path="/first-login/setup" element={<SetupHarness />} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText('password'), 'StrongPassword1!');
    await userEvent.type(screen.getByLabelText('confirm'), 'StrongPassword1!');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => {
      expect(mockCompletePasswordSetup).toHaveBeenCalledWith({
        setup_token: 'plain-setup-token',
        password: 'StrongPassword1!',
        password_confirmation: 'StrongPassword1!'
      });
    });

    expect(localStorage.getItem('setup_token')).toBeNull();
    expect(sessionStorage.getItem('setup_token')).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/first-login/2fa', {
      replace: true,
      state: {
        twoFactorSetupToken: '2fa-setup-token',
        email: 'user@example.com',
        expiresIn: 600
      }
    });
  });

  it('blocks submit when passwords mismatch', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/first-login/setup',
            state: { setupToken: 'plain-setup-token', email: 'user@example.com' }
          }
        ]}
      >
        <Routes>
          <Route path="/first-login/setup" element={<SetupHarness />} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText('password'), 'StrongPassword1!');
    await userEvent.type(screen.getByLabelText('confirm'), 'MismatchPassword1!');
    await userEvent.click(screen.getByRole('button', { name: /submit/i }));

    expect(mockCompletePasswordSetup).not.toHaveBeenCalled();
  });
});
