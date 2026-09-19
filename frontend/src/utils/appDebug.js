/** True when explicit app debug logging is enabled in development. */
export function isAppDebugEnabled() {
  try {
    return import.meta.env.DEV === true && import.meta.env.VITE_APP_DEBUG === 'true';
  } catch {
    return false;
  }
}

/** Development-only diagnostic log for non-fatal app issues. */
export function appDebugWarn(...args) {
  if (isAppDebugEnabled()) {
    console.warn(...args);
  }
}
