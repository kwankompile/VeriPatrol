import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import OtpInput from './OtpInput';

describe('OtpInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts only digits up to six characters', () => {
    const handleChange = vi.fn();

    render(<OtpInput value="" onChange={handleChange} />);

    const input = screen.getByLabelText(/authentication code/i);
    fireEvent.change(input, { target: { value: '12ab345678' } });

    expect(handleChange).toHaveBeenCalledWith('123456');
  });

  it('shows helper text when provided', () => {
    render(<OtpInput value="" onChange={() => {}} helperText="Invalid code" error />);
    expect(screen.getByText('Invalid code')).toBeInTheDocument();
  });
});
