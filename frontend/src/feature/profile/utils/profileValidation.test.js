import { describe, expect, it } from 'vitest';

import {
  formatFileSize,
  PROFILE_PASSWORD_MIN_LENGTH,
  PROFILE_PICTURE_MAX_SIZE_BYTES,
  validateEmailChangeStartFields,
  validateEmailConfirmFields,
  validatePasswordChangeFields,
  validateProfilePictureFile,
  validateTwoFactorReconfigureStartFields,
  validateTwoFactorReconfigureVerifyFields
} from './profileValidation';

describe('validateProfilePictureFile', () => {
  it('accepts valid JPG, PNG, and WebP files', () => {
    const jpg = new File(['a'], 'photo.jpg', { type: 'image/jpeg' });
    const png = new File(['a'], 'photo.png', { type: 'image/png' });
    const webp = new File(['a'], 'photo.webp', { type: 'image/webp' });

    expect(validateProfilePictureFile(jpg)).toBeNull();
    expect(validateProfilePictureFile(png)).toBeNull();
    expect(validateProfilePictureFile(webp)).toBeNull();
  });

  it('rejects unsupported MIME types', () => {
    const gif = new File(['a'], 'photo.gif', { type: 'image/gif' });

    expect(validateProfilePictureFile(gif)).toBe('Only JPG, PNG, or WebP images are allowed.');
  });

  it('rejects oversized files', () => {
    const oversized = new File([new ArrayBuffer(PROFILE_PICTURE_MAX_SIZE_BYTES + 1)], 'big.png', {
      type: 'image/png'
    });

    expect(validateProfilePictureFile(oversized)).toMatch(/2\.0 MB or smaller/);
  });

  it('rejects missing files', () => {
    expect(validateProfilePictureFile(null)).toBe('Please select an image file.');
    expect(validateProfilePictureFile(undefined)).toBe('Please select an image file.');
  });
});

describe('formatFileSize', () => {
  it('formats bytes, kilobytes, and megabytes', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('validatePasswordChangeFields', () => {
  it('requires all fields and matching passwords', () => {
    expect(validatePasswordChangeFields({})).toMatchObject({
      current_password: expect.any(Array),
      otp: expect.any(Array),
      password: expect.any(Array),
      password_confirmation: expect.any(Array)
    });

    const mismatch = validatePasswordChangeFields({
      currentPassword: 'OldPassword123',
      otp: '123456',
      password: 'NewPassword12345',
      passwordConfirmation: 'DifferentPassword1'
    });
    expect(mismatch.password_confirmation).toBeDefined();
  });

  it('enforces minimum password length', () => {
    const errors = validatePasswordChangeFields({
      currentPassword: 'OldPassword123',
      otp: '123456',
      password: 'short',
      passwordConfirmation: 'short'
    });

    expect(errors.password?.[0]).toContain(String(PROFILE_PASSWORD_MIN_LENGTH));
  });
});

describe('validateEmailChangeStartFields', () => {
  it('requires valid email shape', () => {
    const errors = validateEmailChangeStartFields({
      newEmail: 'not-an-email',
      currentPassword: 'password',
      otp: '123456'
    });

    expect(errors.new_email?.[0]).toMatch(/valid email/i);
  });
});

describe('validateEmailConfirmFields', () => {
  it('requires confirmation token', () => {
    expect(validateEmailConfirmFields({ token: '' }).token).toBeDefined();
  });
});

describe('validateTwoFactorReconfigureFields', () => {
  it('requires step-up credentials and verify OTP', () => {
    expect(validateTwoFactorReconfigureStartFields({})).toMatchObject({
      current_password: expect.any(Array),
      otp: expect.any(Array)
    });
    expect(validateTwoFactorReconfigureVerifyFields({ otp: '12' }).otp).toBeDefined();
  });
});
