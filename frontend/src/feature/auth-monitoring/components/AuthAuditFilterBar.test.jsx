import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import AuthAuditFilterBar, { ACTION_OPTIONS } from './AuthAuditFilterBar';

describe('AuthAuditFilterBar', () => {
  const defaultFilters = {
    action: 'all',
    status: 'all',
    email: '',
    dateFrom: '',
    dateTo: ''
  };

  it('renders profile audit action options', () => {
    const profileActions = [
      'profile_updated',
      'profile_update_failed',
      'profile_picture_uploaded',
      'profile_picture_removed',
      'password_changed',
      'password_change_failed',
      'email_change_started',
      'email_changed',
      'email_change_failed',
      'two_factor_reconfigure_started',
      'two_factor_reconfigured',
      'two_factor_reconfigure_failed'
    ];

    profileActions.forEach((action) => {
      expect(ACTION_OPTIONS.some((option) => option.value === action)).toBe(true);
    });
  });

  it('passes selected profile action to onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<AuthAuditFilterBar filters={defaultFilters} onChange={onChange} />);

    const actionField = screen.getByLabelText('Action');
    await user.click(actionField);
    await user.click(screen.getByRole('option', { name: 'Password change failed' }));

    expect(onChange).toHaveBeenCalledWith({
      ...defaultFilters,
      action: 'password_change_failed'
    });
  });
});
