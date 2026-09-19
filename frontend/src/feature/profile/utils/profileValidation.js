export const PROFILE_PHONE_MAX_LENGTH = 30;
export const PROFILE_ADDRESS_MAX_LENGTH = 1000;
export const PROFILE_PICTURE_MAX_SIZE_BYTES = 2048 * 1024;
export const PROFILE_PICTURE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PROFILE_PASSWORD_MIN_LENGTH = 12;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string} otp
 * @returns {string[]}
 */
function validateOtpField(otp) {
  const normalized = String(otp ?? '').replace(/\D/g, '');

  if (!normalized) {
    return ['Authentication code is required.'];
  }

  if (normalized.length !== 6) {
    return ['Enter the 6-digit authentication code.'];
  }

  return [];
}

/**
 * @param {{ currentPassword?: string; otp?: string; password?: string; passwordConfirmation?: string }} values
 * @returns {Record<string, string[]>}
 */
export function validatePasswordChangeFields(values) {
  const errors = {};
  const currentPassword = values.currentPassword ?? '';
  const otp = values.otp ?? '';
  const password = values.password ?? '';
  const passwordConfirmation = values.passwordConfirmation ?? '';

  if (!currentPassword) {
    errors.current_password = ['Current password is required.'];
  }

  const otpErrors = validateOtpField(otp);
  if (otpErrors.length > 0) {
    errors.otp = otpErrors;
  }

  if (!password) {
    errors.password = ['New password is required.'];
  } else if (password.length < PROFILE_PASSWORD_MIN_LENGTH) {
    errors.password = [`Password must be at least ${PROFILE_PASSWORD_MIN_LENGTH} characters.`];
  }

  if (!passwordConfirmation) {
    errors.password_confirmation = ['Password confirmation is required.'];
  } else if (password && password !== passwordConfirmation) {
    errors.password_confirmation = ['Password confirmation does not match.'];
  }

  return errors;
}

/**
 * @param {{ newEmail?: string; currentPassword?: string; otp?: string }} values
 * @returns {Record<string, string[]>}
 */
export function validateEmailChangeStartFields(values) {
  const errors = {};
  const newEmail = String(values.newEmail ?? '').trim();
  const currentPassword = values.currentPassword ?? '';
  const otp = values.otp ?? '';

  if (!newEmail) {
    errors.new_email = ['New email is required.'];
  } else if (!EMAIL_PATTERN.test(newEmail)) {
    errors.new_email = ['Enter a valid email address.'];
  }

  if (!currentPassword) {
    errors.current_password = ['Current password is required.'];
  }

  const otpErrors = validateOtpField(otp);
  if (otpErrors.length > 0) {
    errors.otp = otpErrors;
  }

  return errors;
}

/**
 * @param {{ token?: string }} values
 * @returns {Record<string, string[]>}
 */
export function validateEmailConfirmFields(values) {
  const errors = {};
  const token = String(values.token ?? '').trim();

  if (!token) {
    errors.token = ['Confirmation token is required.'];
  }

  return errors;
}

/**
 * @param {{ currentPassword?: string; otp?: string }} values
 * @returns {Record<string, string[]>}
 */
export function validateTwoFactorReconfigureStartFields(values) {
  const errors = {};
  const currentPassword = values.currentPassword ?? '';
  const otp = values.otp ?? '';

  if (!currentPassword) {
    errors.current_password = ['Current password is required.'];
  }

  const otpErrors = validateOtpField(otp);
  if (otpErrors.length > 0) {
    errors.otp = otpErrors;
  }

  return errors;
}

/**
 * @param {{ otp?: string }} values
 * @returns {Record<string, string[]>}
 */
export function validateTwoFactorReconfigureVerifyFields(values) {
  const errors = {};
  const otpErrors = validateOtpField(values.otp ?? '');

  if (otpErrors.length > 0) {
    errors.otp = otpErrors;
  }

  return errors;
}

/**
 * @param {{ phone?: string | null; address?: string | null }} values
 * @returns {Record<string, string[]>}
 */
export function validateContactFields(values) {
  const errors = {};
  const phone = values.phone ?? '';
  const address = values.address ?? '';

  if (phone.length > PROFILE_PHONE_MAX_LENGTH) {
    errors.phone = [`Phone must be at most ${PROFILE_PHONE_MAX_LENGTH} characters.`];
  }

  if (address.length > PROFILE_ADDRESS_MAX_LENGTH) {
    errors.address = [`Address must be at most ${PROFILE_ADDRESS_MAX_LENGTH} characters.`];
  }

  return errors;
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function normalizeContactValue(value) {
  if (value == null) {
    return '';
  }

  return String(value);
}

/**
 * @param {string | null | undefined} left
 * @param {string | null | undefined} right
 * @returns {boolean}
 */
export function contactValuesEqual(left, right) {
  return normalizeContactValue(left) === normalizeContactValue(right);
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {File | null | undefined} file
 * @returns {string | null} Error message when invalid, otherwise null.
 */
export function validateProfilePictureFile(file) {
  if (!file) {
    return 'Please select an image file.';
  }

  if (!file.type || !PROFILE_PICTURE_ALLOWED_TYPES.includes(file.type)) {
    return 'Only JPG, PNG, or WebP images are allowed.';
  }

  if (file.size > PROFILE_PICTURE_MAX_SIZE_BYTES) {
    return `Image must be ${formatFileSize(PROFILE_PICTURE_MAX_SIZE_BYTES)} or smaller.`;
  }

  return null;
}
