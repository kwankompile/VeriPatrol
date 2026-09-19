import { describe, expect, it, vi } from 'vitest';

import { ProfileRepository } from './ProfileRepository';

describe('ProfileRepository', () => {
  const sampleUser = {
    id: 'user-1',
    name: 'Guard User',
    email: 'guard@example.com',
    phone: '0123456789',
    address: 'HQ',
    profile_picture_url: 'https://cdn.example/avatar.png',
    profile_version: 4,
    two_factor_enabled: true,
    two_factor_confirmed_at: '2026-06-29T10:00:00Z',
    email_verified_at: '2026-06-29T10:00:00Z',
    last_password_changed_at: '2026-06-29T09:00:00Z',
    last_security_changed_at: '2026-06-29T10:00:00Z',
    role: { id: 'role-1', name: 'Guard' },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-06-29T10:00:00Z'
  };

  it('normalizes data.user from profile envelope', async () => {
    const service = {
      getProfile: vi.fn().mockResolvedValue({
        success: true,
        message: 'Profile retrieved successfully.',
        data: { user: sampleUser }
      })
    };

    const repository = new ProfileRepository(service);
    const profile = await repository.getProfile();

    expect(profile).toMatchObject({
      id: 'user-1',
      name: 'Guard User',
      email: 'guard@example.com',
      profilePictureUrl: 'https://cdn.example/avatar.png',
      profileVersion: 4,
      twoFactorEnabled: true,
      roleName: 'Guard'
    });
    expect(profile.raw).toEqual(sampleUser);
  });

  it('supports direct user payload fallback', () => {
    const repository = new ProfileRepository({});
    const profile = repository.normalizeUser(sampleUser);

    expect(profile.email).toBe('guard@example.com');
    expect(profile.roleName).toBe('Guard');
  });

  it('maps profile_picture_url to profilePictureUrl and profile_version to profileVersion', () => {
    const repository = new ProfileRepository({});
    const profile = repository.normalizeUser({ profile_picture_url: 'https://x', profile_version: 7, role: { name: 'Admin' } });

    expect(profile.profilePictureUrl).toBe('https://x');
    expect(profile.profileVersion).toBe(7);
  });

  it('derives roleName from string role', () => {
    const repository = new ProfileRepository({});
    const profile = repository.normalizeUser({ id: '1', role: 'Guard' });

    expect(profile.role).toBe('Guard');
    expect(profile.roleName).toBe('Guard');
  });

  it('derives roleName from role_name when role object is absent', () => {
    const repository = new ProfileRepository({});
    const profile = repository.normalizeUser({ id: '1', role_name: 'Security Operator' });

    expect(profile.role).toBeNull();
    expect(profile.roleName).toBe('Security Operator');
  });

  it('throws when success is false', async () => {
    const service = {
      getProfile: vi.fn().mockResolvedValue({
        success: false,
        message: 'Forbidden.',
        data: null
      })
    };

    const repository = new ProfileRepository(service);

    await expect(repository.getProfile()).rejects.toThrow('Forbidden.');
  });

  it('normalizes uploadProfilePicture data.user', async () => {
    const service = {
      uploadProfilePicture: vi.fn().mockResolvedValue({
        success: true,
        message: 'Profile picture uploaded successfully.',
        data: { user: sampleUser }
      })
    };

    const repository = new ProfileRepository(service);
    const profile = await repository.uploadProfilePicture(new FormData());

    expect(profile).toMatchObject({
      profilePictureUrl: 'https://cdn.example/avatar.png',
      profileVersion: 4
    });
  });

  it('normalizes deleteProfilePicture data.user', async () => {
    const service = {
      deleteProfilePicture: vi.fn().mockResolvedValue({
        success: true,
        message: 'Profile picture removed successfully.',
        data: {
          user: {
            ...sampleUser,
            profile_picture_url: null,
            profile_version: 4
          }
        }
      })
    };

    const repository = new ProfileRepository(service);
    const profile = await repository.deleteProfilePicture();

    expect(profile.profilePictureUrl).toBeNull();
    expect(profile.profileVersion).toBe(4);
  });

  it('normalizes changePassword sensitive response', async () => {
    const service = {
      changePassword: vi.fn().mockResolvedValue({
        success: true,
        message: 'Password changed successfully. Please sign in again.',
        data: { requires_reauthentication: true, revoked_sessions_count: 2 }
      })
    };

    const repository = new ProfileRepository(service);
    const result = await repository.changePassword({ current_password: 'x', otp: '123456', password: 'y', password_confirmation: 'y' });

    expect(result).toEqual({
      message: 'Password changed successfully. Please sign in again.',
      requiresReauthentication: true,
      revokedSessionsCount: 2
    });
  });

  it('normalizes startEmailChange sensitive response', async () => {
    const service = {
      startEmailChange: vi.fn().mockResolvedValue({
        success: true,
        message: 'Email change verification sent.',
        data: { expires_in: 600, masked_email: 'n***@example.com' }
      })
    };

    const repository = new ProfileRepository(service);
    const result = await repository.startEmailChange({ current_password: 'x', otp: '123456', new_email: 'new@example.com' });

    expect(result).toMatchObject({
      expiresIn: 600,
      maskedEmail: 'n***@example.com'
    });
  });

  it('normalizes startTwoFactorReconfigure sensitive response', async () => {
    const service = {
      startTwoFactorReconfigure: vi.fn().mockResolvedValue({
        success: true,
        message: 'Two-factor reconfiguration started.',
        data: {
          two_factor_reconfigure_token: 'token',
          manual_key: 'SECRET',
          otpauth_uri: 'otpauth://test',
          expires_in: 600
        }
      })
    };

    const repository = new ProfileRepository(service);
    const result = await repository.startTwoFactorReconfigure({ current_password: 'x', otp: '123456' });

    expect(result).toMatchObject({
      twoFactorReconfigureToken: 'token',
      manualKey: 'SECRET',
      otpauthUri: 'otpauth://test',
      expiresIn: 600
    });
  });

  it('preserves conflict data from a 409 service error', async () => {
    const conflictError = new Error('Profile has been modified. Please refresh and try again.');
    conflictError.status = 409;
    conflictError.data = {
      success: false,
      message: 'Profile has been modified. Please refresh and try again.',
      data: {
        code: 'profile_version_conflict',
        current_profile_version: 5,
        user: sampleUser
      }
    };

    const service = {
      updateProfile: vi.fn().mockRejectedValue(conflictError)
    };

    const repository = new ProfileRepository(service);

    await expect(repository.updateProfile({ phone: '0123000001', profile_version: 4 })).rejects.toMatchObject({
      status: 409,
      code: 'profile_version_conflict',
      profile: expect.objectContaining({
        profileVersion: 4,
        email: 'guard@example.com'
      })
    });
  });
});
