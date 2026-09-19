/** True when explicit PWA debug logging is enabled in development. */
export function isPwaDebugEnabled() {
  try {
    return import.meta.env.DEV === true && import.meta.env.VITE_PWA_DEBUG === 'true';
  } catch {
    return false;
  }
}

/** PWA diagnostic log — only when `VITE_PWA_DEBUG=true` in dev. */
export function pwaDebug(...args) {
  if (isPwaDebugEnabled()) {
    console.info(...args);
  }
}

/** PWA diagnostic warning — only when `VITE_PWA_DEBUG=true` in dev. */
export function pwaDebugWarn(...args) {
  if (isPwaDebugEnabled()) {
    console.warn(...args);
  }
}

/** Whether a Background Sync registration error is an expected browser permission limitation. */
export function isExpectedBackgroundSyncDenial(error) {
  const name = error?.name ?? '';
  return name === 'NotAllowedError' || name === 'AbortError' || name === 'SecurityError';
}

/**
 * Log unexpected PWA warnings only in explicit debug mode.
 * Expected Background Sync permission denials are silent in normal mode.
 */
export function pwaWarn(message, error) {
  if (isExpectedBackgroundSyncDenial(error)) {
    pwaDebug(message, error?.name ?? String(error));
    return;
  }
  if (isPwaDebugEnabled()) {
    console.warn(message, error);
  }
}
