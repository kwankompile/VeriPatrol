import { beforeEach, describe, expect, it, vi } from 'vitest';

import profileService from './profileService';

vi.mock('api/api', () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}));

import api from 'api/api';

describe('profileService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getProfile calls api.get with /profile', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: { user: { id: '1' } } } });

    const result = await profileService.getProfile();

    expect(api.get).toHaveBeenCalledWith('/profile');
    expect(result.success).toBe(true);
  });

  it('updateProfile calls api.patch with /profile and payload', async () => {
    const payload = { phone: '0123456789', profile_version: 2 };
    api.patch.mockResolvedValue({ data: { success: true } });

    await profileService.updateProfile(payload);

    expect(api.patch).toHaveBeenCalledWith('/profile', payload);
  });

  it('uploadProfilePicture calls api.post with FormData', async () => {
    const formData = new FormData();
    formData.append('image', new Blob(['x']), 'avatar.png');
    api.post.mockResolvedValue({ data: { success: true } });

    await profileService.uploadProfilePicture(formData);

    expect(api.post).toHaveBeenCalledWith('/profile/picture', formData);
  });

  it('wires sensitive profile endpoints', async () => {
    api.delete.mockResolvedValue({ data: { success: true } });
    api.post.mockResolvedValue({ data: { success: true } });

    await profileService.deleteProfilePicture();
    await profileService.changePassword({
      current_password: 'a',
      otp: '123456',
      password: 'newpassword12',
      password_confirmation: 'newpassword12'
    });
    await profileService.startEmailChange({ current_password: 'a', otp: '123456', new_email: 'new@example.com' });
    await profileService.confirmEmailChange({ token: 'token' });
    await profileService.startTwoFactorReconfigure({ current_password: 'a', otp: '123456' });
    await profileService.verifyTwoFactorReconfigure({ two_factor_reconfigure_token: 'token', otp: '123456' });

    expect(api.delete).toHaveBeenCalledWith('/profile/picture');
    expect(api.post).toHaveBeenCalledWith('/profile/password/change', expect.any(Object));
    expect(api.post).toHaveBeenCalledWith('/profile/email/start', expect.any(Object));
    expect(api.post).toHaveBeenCalledWith('/profile/email/confirm', expect.any(Object));
    expect(api.post).toHaveBeenCalledWith('/profile/2fa/reconfigure/start', expect.any(Object));
    expect(api.post).toHaveBeenCalledWith('/profile/2fa/reconfigure/verify', expect.any(Object));
  });

  it('preserves status and data on errors', async () => {
    api.get.mockRejectedValue({
      status: 422,
      data: {
        message: 'Validation failed.',
        data: { errors: { phone: ['Invalid phone.'] } }
      }
    });

    await expect(profileService.getProfile()).rejects.toMatchObject({
      status: 422,
      data: {
        message: 'Validation failed.',
        data: { errors: { phone: ['Invalid phone.'] } }
      }
    });
  });
});
