/**
 * Workbox runtimeCaching rules for vite-plugin-pwa (generateSW).
 *
 * Design goals (M7):
 * - Cache static assets aggressively (CacheFirst).
 * - Do not runtime-cache protected API responses.
 * - Never cache JWT mutations — offline writes use IndexedDB + /pwa/sync.
 */

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;
const PROTECTED_PATH_PREFIXES = ['/api/', '/broadcasting/auth'];

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} apiBaseUrl e.g. http://localhost:8000/api
 */
export function buildRuntimeCaching(apiBaseUrl) {
  void apiBaseUrl;
  return [
    {
      // Hashed bundles + public icons/fonts/images (same origin as the SPA).
      urlPattern: /\.(?:js|css|woff2?|ttf|eot|png|gif|jpg|jpeg|svg|ico|webp)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: THIRTY_DAYS_SECONDS
        }
      }
    }
  ];
}

/**
 * Navigation requests that must not receive the SPA index.html fallback.
 * @param {string} apiBaseUrl
 */
export function buildNavigateFallbackDenylist(apiBaseUrl) {
  const denylist = [/\.[^/]+$/];

  for (const protectedPrefix of PROTECTED_PATH_PREFIXES) {
    denylist.push(new RegExp(`^${escapeRegExp(protectedPrefix)}`, 'i'));
  }

  try {
    const apiUrl = new URL(apiBaseUrl);
    const apiBasePath = apiUrl.pathname.replace(/\/$/, '');
    if (apiBasePath && apiBasePath !== '/') {
      denylist.push(new RegExp(`^${escapeRegExp(apiBasePath)}(?:/|$)`));
    }
  } catch {
    /* invalid VITE_API_BASE_URL at build time — skip API denylist */
  }

  return denylist;
}

/**
 * Restrict navigateFallback to SPA routes when Vite `base` is not `/`.
 * @param {string} appBaseName VITE_APP_BASE_NAME
 */
export function buildNavigateFallbackAllowlist(appBaseName) {
  const base = (appBaseName || '/').replace(/\/$/, '') || '';
  if (!base) {
    return undefined;
  }
  const escaped = escapeRegExp(base);
  return [new RegExp(`^${escaped}/`), new RegExp(`^${escaped}$`)];
}
