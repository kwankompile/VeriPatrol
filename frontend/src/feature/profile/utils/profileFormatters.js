/**
 * @param {boolean | null | undefined} enabled
 * @returns {string}
 */
export function formatTwoFactorStatus(enabled) {
  if (enabled === true) {
    return 'Enabled';
  }

  if (enabled === false) {
    return 'Disabled';
  }

  return 'Unknown';
}

/**
 * @param {string | null | undefined} roleName
 * @returns {string}
 */
export function formatRoleName(roleName) {
  if (!roleName) {
    return 'Unknown role';
  }

  return roleName;
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleString();
}

/**
 * @param {string | null | undefined} emailVerifiedAt
 * @returns {string}
 */
export function formatEmailVerificationStatus(emailVerifiedAt) {
  return emailVerifiedAt ? 'Verified' : 'Not verified';
}

/**
 * Returns a trimmed value or a graceful fallback string when missing/blank.
 * @param {string | null | undefined} value
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatOrFallback(value, fallback = 'Not provided') {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : fallback;
}

/**
 * Derives a high-level account status from verification + 2FA signals.
 * Uses real profile fields only (no fabricated status).
 * @param {{ emailVerifiedAt?: string | null, twoFactorEnabled?: boolean | null }} profile
 * @returns {{ label: string, tone: 'active' | 'warning' }}
 */
export function resolveAccountStatus(profile) {
  const emailVerified = Boolean(profile?.emailVerifiedAt);
  const twoFactor = profile?.twoFactorEnabled === true;

  if (emailVerified && twoFactor) {
    return { label: 'Active & secured', tone: 'active' };
  }

  if (emailVerified) {
    return { label: 'Active', tone: 'active' };
  }

  return { label: 'Verification pending', tone: 'warning' };
}

/**
 * Relative-friendly short date (e.g. "Joined") when a full timestamp is noisy.
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function formatDateOnly(value) {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
export function getProfileInitials(name) {
  if (!name) {
    return '?';
  }

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}
