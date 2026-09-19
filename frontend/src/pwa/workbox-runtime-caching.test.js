import { describe, expect, it } from 'vitest';

import {
  buildNavigateFallbackAllowlist,
  buildNavigateFallbackDenylist,
  buildRuntimeCaching
} from '../../pwa/workbox-runtime-caching.mjs';

describe('workbox runtime caching helpers', () => {
  it('only registers static asset runtime caching', () => {
    const runtimeCaching = buildRuntimeCaching('http://localhost:8000/api');
    expect(runtimeCaching).toHaveLength(1);
    expect(runtimeCaching[0].handler).toBe('CacheFirst');
    expect(runtimeCaching[0].urlPattern.test('/assets/app.abc123.js')).toBe(true);
    expect(runtimeCaching.some((entry) => entry.method === 'POST')).toBe(false);
    expect(runtimeCaching.some((entry) => entry.method === 'PUT')).toBe(false);
    expect(runtimeCaching.some((entry) => entry.method === 'PATCH')).toBe(false);
    expect(runtimeCaching.some((entry) => entry.method === 'DELETE')).toBe(false);
  });

  it('denies protected API paths from SPA navigation fallback', () => {
    const denylist = buildNavigateFallbackDenylist('http://localhost:8000/backend-api');
    const deniedApi = denylist.some((regex) => regex.test('/api/dashboard/summary'));
    const deniedCustomApiBase = denylist.some((regex) => regex.test('/backend-api/anpr-events'));
    const deniedAsset = denylist.some((regex) => regex.test('/assets/main.js'));
    expect(deniedApi).toBe(true);
    expect(deniedCustomApiBase).toBe(true);
    expect(deniedAsset).toBe(true);
  });

  it('builds allowlist correctly for root and subdirectory base paths', () => {
    expect(buildNavigateFallbackAllowlist('/')).toBeUndefined();

    const allowlist = buildNavigateFallbackAllowlist('/veripatrol');
    expect(allowlist).toHaveLength(2);
    expect(allowlist.some((regex) => regex.test('/veripatrol'))).toBe(true);
    expect(allowlist.some((regex) => regex.test('/veripatrol/dashboard'))).toBe(true);
    expect(allowlist.some((regex) => regex.test('/dashboard'))).toBe(false);
  });
});
