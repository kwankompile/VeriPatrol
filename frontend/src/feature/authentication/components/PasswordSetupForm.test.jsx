import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PasswordSetupForm from './PasswordSetupForm';

describe('PasswordSetupForm', () => {
  const baseProps = {
    email: 'user@example.com',
    password: '',
    setPassword: vi.fn(),
    passwordConfirmation: '',
    setPasswordConfirmation: vi.fn(),
    errors: {},
    setErrors: vi.fn(),
    submitError: '',
    isSubmitting: false,
    missingSetupContext: false,
    passwordMinLength: 12,
    onSubmit: vi.fn((event) => event.preventDefault())
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows restart login message when setup context is missing', () => {
    render(<PasswordSetupForm {...baseProps} missingSetupContext />);

    expect(screen.getByText(/session expired or was interrupted/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in again with your temporary password/i)).toBeInTheDocument();
  });

  it('validates password mismatch via controller errors', async () => {
    const onSubmit = vi.fn((event) => event.preventDefault());

    render(
      <PasswordSetupForm
        {...baseProps}
        password="StrongPassword1!"
        setPassword={vi.fn()}
        passwordConfirmation="DifferentPassword1!"
        setPasswordConfirmation={vi.fn()}
        errors={{ passwordConfirmation: 'Passwords do not match.' }}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('submits setup form when user clicks set password', async () => {
    const onSubmit = vi.fn((event) => event.preventDefault());

    render(
      <PasswordSetupForm
        {...baseProps}
        password="StrongPassword1!"
        passwordConfirmation="StrongPassword1!"
        onSubmit={onSubmit}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /set password/i }));
    expect(onSubmit).toHaveBeenCalled();
  });
});
