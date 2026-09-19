/**
 * @param {Error & { status?: number; data?: unknown }} error
 * @param {string} action
 * @returns {Error & { status?: number; data?: unknown; originalError?: unknown }}
 */
export function buildProfileServiceError(error, action) {
  const status = error?.status;
  const details = error?.data;
  const messageFromApi = details?.message;

  let message = messageFromApi || `Failed to ${action}.`;

  if (status === 401) {
    message = 'Unauthorized. Please log in again.';
  } else if (status === 403) {
    message = 'You do not have permission to perform this action.';
  } else if (status === 409) {
    message = messageFromApi || 'Profile has been modified. Please refresh and try again.';
  } else if (status >= 500) {
    message = messageFromApi || 'Server error. Please try again later.';
  }

  const serviceError = new Error(message);
  serviceError.status = status;
  serviceError.data = details;
  serviceError.originalError = error;

  return serviceError;
}

/**
 * @param {Error & { status?: number; data?: unknown }} error
 * @returns {Record<string, string[]>}
 */
export function extractValidationErrors(error) {
  const payload = error?.data;

  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const nestedErrors = payload.data?.errors;
  const topLevelErrors = payload.errors;

  if (nestedErrors && typeof nestedErrors === 'object' && !Array.isArray(nestedErrors)) {
    return nestedErrors;
  }

  if (topLevelErrors && typeof topLevelErrors === 'object' && !Array.isArray(topLevelErrors)) {
    return topLevelErrors;
  }

  return {};
}

/**
 * @param {Error & { status?: number; data?: unknown; code?: string }} error
 * @returns {boolean}
 */
export function isProfileVersionConflict(error) {
  if (error?.status !== 409) {
    return false;
  }

  if (error?.code === 'profile_version_conflict') {
    return true;
  }

  const payload = error?.data;

  return payload?.data?.code === 'profile_version_conflict';
}

export const PROFILE_VERSION_CONFLICT_MESSAGE =
  'This profile was updated elsewhere. The latest profile has been loaded. Review and save again.';

/**
 * @param {Error & { status?: number; data?: unknown }} error
 * @returns {number | null}
 */
export function extractRetryAfterSeconds(error) {
  const payload = error?.data;

  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const seconds = payload.data?.retry_after_seconds ?? payload.retry_after_seconds;

  return typeof seconds === 'number' ? seconds : null;
}

/**
 * @param {number} seconds
 * @returns {string}
 */
export function formatRetryAfterMessage(seconds) {
  return `Too many attempts. Try again in ${seconds} seconds.`;
}

/**
 * @param {Error & { status?: number; data?: unknown }} error
 * @param {{
 *   setFieldErrors: (errors: Record<string, string[]>) => void;
 *   setError: (message: string) => void;
 *   setRetryAfterSeconds?: (seconds: number | null) => void;
 *   fallbackMessage?: string;
 * }} handlers
 */
export function applyProfileActionError(error, handlers) {
  const { setFieldErrors, setError, setRetryAfterSeconds, fallbackMessage = 'Request failed.' } = handlers;

  if (error?.status === 422) {
    setFieldErrors(extractValidationErrors(error));
  }

  if (error?.status === 429) {
    const retryAfterSeconds = extractRetryAfterSeconds(error);

    if (retryAfterSeconds != null) {
      setRetryAfterSeconds?.(retryAfterSeconds);
      setError(formatRetryAfterMessage(retryAfterSeconds));
      return;
    }
  }

  setError(error?.message || fallbackMessage);
}
