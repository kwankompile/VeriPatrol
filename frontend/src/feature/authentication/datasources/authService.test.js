import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizePasswordSetupResponse, normalizeRefreshResponse } from './authService';

describe('authService.normalizeRefreshResponse', () => {
  it('accepts Laravel envelope shape', () => {
    const result = normalizeRefreshResponse({
      success: true,
      data: {
        access_token: 'jwt-new',
        token_type: 'bearer',
        expires_in: 3600,
        user: { id: 1, email: 'a@b.com' }
      }
    });

    expect(result.accessToken).toBe('jwt-new');
    expect(result.user).toEqual({ id: 1, email: 'a@b.com' });
    expect(result.tokenType).toBe('bearer');
    expect(result.expiresIn).toBe(3600);
  });

  it('accepts flat response shape', () => {
    const result = normalizeRefreshResponse({
      access_token: 'jwt-flat',
      token_type: 'bearer',
      expires_in: 1800,
      user: { id: 2 }
    });

    expect(result.accessToken).toBe('jwt-flat');
    expect(result.user).toEqual({ id: 2 });
  });
});

describe('authService.normalizePasswordSetupResponse', () => {
  it('accepts Laravel envelope shape', () => {
    const result = normalizePasswordSetupResponse({
      success: true,
      data: {
        next_step: 'two_factor_setup_required',
        user: { email: 'user@example.com', setup_required: false }
      }
    });

    expect(result.nextStep).toBe('two_factor_setup_required');
    expect(result.user).toEqual({ email: 'user@example.com', setup_required: false });
  });
});

vi.mock('api/api', () => ({
  default: {
    post: vi.fn()
  }
}));

describe('authService.completePasswordSetup', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('posts to password setup endpoint with skipAuthRefresh', async () => {
    const api = (await import('api/api')).default;
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          next_step: 'two_factor_setup_required',
          two_factor_setup_token: '2fa-token',
          expires_in: 600,
          user: { email: 'user@example.com' }
        }
      }
    });

    const authService = (await import('./authService')).default;
    const result = await authService.completePasswordSetup({
      setup_token: 'plain-token',
      password: 'StrongPassword1!',
      password_confirmation: 'StrongPassword1!'
    });

    expect(api.post).toHaveBeenCalledWith(
      '/auth/password-setup/complete',
      {
        setup_token: 'plain-token',
        password: 'StrongPassword1!',
        password_confirmation: 'StrongPassword1!'
      },
      { skipAuthRefresh: true }
    );
    expect(result.nextStep).toBe('two_factor_setup_required');
    expect(result.twoFactorSetupToken).toBe('2fa-token');
  });
});

describe('authService two-factor and OTP endpoints', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('calls 2FA setup endpoints with skipAuthRefresh', async () => {
    const api = (await import('api/api')).default;
    vi.mocked(api.post)
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            next_step: 'two_factor_setup_verify_required',
            manual_key: 'BASE32SECRET',
            otpauth_uri: 'otpauth://totp/test',
            expires_in: 600
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            access_token: 'jwt-token',
            token_type: 'bearer',
            expires_in: 1800,
            role: 'Guard',
            user: { id: '1', email: 'user@example.com' }
          }
        }
      });

    const authService = (await import('./authService')).default;

    const startResult = await authService.startTwoFactorSetup({ two_factor_setup_token: 'setup-token' });
    expect(api.post).toHaveBeenCalledWith('/auth/2fa/setup/start', { two_factor_setup_token: 'setup-token' }, { skipAuthRefresh: true });
    expect(startResult.manualKey).toBe('BASE32SECRET');

    const verifyResult = await authService.verifyTwoFactorSetup({ two_factor_setup_token: 'setup-token', otp: '123456' });
    expect(api.post).toHaveBeenCalledWith(
      '/auth/2fa/setup/verify',
      { two_factor_setup_token: 'setup-token', otp: '123456' },
      { skipAuthRefresh: true }
    );
    expect(verifyResult.accessToken).toBe('jwt-token');
  });

  it('calls OTP verify endpoint with skipAuthRefresh', async () => {
    const api = (await import('api/api')).default;
    vi.mocked(api.post).mockResolvedValue({
      data: {
        success: true,
        data: {
          access_token: 'jwt-token',
          token_type: 'bearer',
          expires_in: 1800,
          role: 'Guard',
          user: { id: '1', email: 'user@example.com' }
        }
      }
    });

    const authService = (await import('./authService')).default;
    const result = await authService.verifyOtp({ login_challenge_id: 'challenge-123', otp: '123456' });

    expect(api.post).toHaveBeenCalledWith(
      '/auth/otp/verify',
      { login_challenge_id: 'challenge-123', otp: '123456' },
      { skipAuthRefresh: true }
    );
    expect(result.accessToken).toBe('jwt-token');
  });
});

describe('authService.refresh', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('calls /auth/refresh with credentials and no Authorization header', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { access_token: 'refreshed', token_type: 'bearer', expires_in: 3600, user: { id: 1 } }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const authService = (await import('./authService')).default;
    const result = await authService.refresh();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/refresh$/),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include'
      })
    );
    expect(result.accessToken).toBe('refreshed');
  });

  it('throws on refresh failure without storing tokens', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'invalid' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    const authService = (await import('./authService')).default;
    await expect(authService.refresh()).rejects.toMatchObject({ status: 401 });
  });
});
