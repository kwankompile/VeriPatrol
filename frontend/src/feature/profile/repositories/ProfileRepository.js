/**
 * @typedef {object} NormalizedProfileUser
 * @property {string} id
 * @property {string} name
 * @property {string} email
 * @property {string | null} phone
 * @property {string | null} address
 * @property {string | null} profilePictureUrl
 * @property {number} profileVersion
 * @property {boolean} twoFactorEnabled
 * @property {string | null} twoFactorConfirmedAt
 * @property {string | null} emailVerifiedAt
 * @property {string | null} lastPasswordChangedAt
 * @property {string | null} lastSecurityChangedAt
 * @property {object | null} role
 * @property {string | null} roleName
 * @property {string | null} createdAt
 * @property {string | null} updatedAt
 * @property {object} raw
 */

import { resolveProfilePictureUrl } from 'utils/getImageUrl';

export class ProfileRepository {
  constructor(service) {
    this.service = service;
  }

  /**
   * @param {unknown} envelope
   * @returns {NormalizedProfileUser}
   */
  normalizeUser(envelope) {
    const payload = envelope?.data?.user ?? envelope?.user ?? envelope;

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Profile response did not include a user.');
    }

    const role = payload.role ?? null;
    const roleName =
      typeof role === 'string'
        ? role
        : typeof role?.name === 'string'
          ? role.name
          : typeof payload.role_name === 'string'
            ? payload.role_name
            : null;

    return {
      id: payload.id,
      name: payload.name ?? '',
      email: payload.email ?? '',
      phone: payload.phone ?? null,
      address: payload.address ?? null,
      profilePictureUrl: resolveProfilePictureUrl(payload.profile_picture_url ?? null),
      profileVersion: Number(payload.profile_version ?? 0),
      twoFactorEnabled: payload.two_factor_enabled === true,
      twoFactorConfirmedAt: payload.two_factor_confirmed_at ?? null,
      emailVerifiedAt: payload.email_verified_at ?? null,
      lastPasswordChangedAt: payload.last_password_changed_at ?? null,
      lastSecurityChangedAt: payload.last_security_changed_at ?? null,
      role,
      roleName,
      createdAt: payload.created_at ?? null,
      updatedAt: payload.updated_at ?? null,
      raw: payload
    };
  }

  /**
   * @param {unknown} envelope
   * @returns {NormalizedProfileUser}
   */
  assertSuccessEnvelope(envelope, action) {
    if (envelope?.success === false) {
      const error = new Error(envelope?.message || `Failed to ${action}.`);
      error.data = envelope?.data ?? null;
      throw error;
    }

    return this.normalizeUser(envelope);
  }

  async getProfile() {
    const envelope = await this.service.getProfile();
    return this.assertSuccessEnvelope(envelope, 'load profile');
  }

  async updateProfile(payload) {
    try {
      const envelope = await this.service.updateProfile(payload);
      return this.assertSuccessEnvelope(envelope, 'update profile');
    } catch (error) {
      if (error?.status === 409 && error?.data?.data?.code === 'profile_version_conflict') {
        const conflictError = new Error(error.message || 'Profile has been modified. Please refresh and try again.');
        conflictError.status = 409;
        conflictError.code = 'profile_version_conflict';
        conflictError.data = error.data;
        conflictError.profile = this.normalizeUser(error.data.data.user ?? error.data.data);
        throw conflictError;
      }

      throw error;
    }
  }

  async uploadProfilePicture(formData) {
    const envelope = await this.service.uploadProfilePicture(formData);
    return this.assertSuccessEnvelope(envelope, 'upload profile picture');
  }

  async deleteProfilePicture() {
    const envelope = await this.service.deleteProfilePicture();
    return this.assertSuccessEnvelope(envelope, 'remove profile picture');
  }

  /**
   * @param {unknown} envelope
   * @param {string} action
   */
  assertSensitiveSuccessEnvelope(envelope, action) {
    if (envelope?.success === false) {
      const error = new Error(envelope?.message || `Failed to ${action}.`);
      error.data = envelope;
      throw error;
    }

    return {
      message: envelope?.message ?? '',
      data: envelope?.data ?? {}
    };
  }

  async changePassword(payload) {
    const envelope = await this.service.changePassword(payload);
    const { message, data } = this.assertSensitiveSuccessEnvelope(envelope, 'change password');

    return {
      message,
      requiresReauthentication: data.requires_reauthentication === true,
      revokedSessionsCount: Number(data.revoked_sessions_count ?? 0)
    };
  }

  async startEmailChange(payload) {
    const envelope = await this.service.startEmailChange(payload);
    const { message, data } = this.assertSensitiveSuccessEnvelope(envelope, 'start email change');

    return {
      message,
      expiresIn: Number(data.expires_in ?? 0),
      maskedEmail: data.masked_email ?? null,
      deliveryMode: data.delivery_mode ?? null
    };
  }

  async confirmEmailChange(payload) {
    const envelope = await this.service.confirmEmailChange(payload);
    const { message, data } = this.assertSensitiveSuccessEnvelope(envelope, 'confirm email change');

    return {
      message,
      requiresReauthentication: data.requires_reauthentication === true,
      revokedSessionsCount: Number(data.revoked_sessions_count ?? 0)
    };
  }

  async startTwoFactorReconfigure(payload) {
    const envelope = await this.service.startTwoFactorReconfigure(payload);
    const { message, data } = this.assertSensitiveSuccessEnvelope(envelope, 'start two-factor reconfiguration');

    return {
      message,
      twoFactorReconfigureToken: data.two_factor_reconfigure_token ?? '',
      manualKey: data.manual_key ?? '',
      otpauthUri: data.otpauth_uri ?? '',
      expiresIn: Number(data.expires_in ?? 0)
    };
  }

  async verifyTwoFactorReconfigure(payload) {
    const envelope = await this.service.verifyTwoFactorReconfigure(payload);
    const { message, data } = this.assertSensitiveSuccessEnvelope(envelope, 'verify two-factor reconfiguration');

    return {
      message,
      requiresReauthentication: data.requires_reauthentication === true,
      revokedSessionsCount: Number(data.revoked_sessions_count ?? 0)
    };
  }
}
