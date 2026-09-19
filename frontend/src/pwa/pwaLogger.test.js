import { afterEach, describe, expect, it, vi } from 'vitest';

import { isPwaDebugEnabled, pwaDebug, pwaWarn } from './pwaLogger';

describe('pwaLogger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('is silent by default in development', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PWA_DEBUG', 'false');

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(isPwaDebugEnabled()).toBe(false);
    pwaDebug('[PWA] Network status:', 'online');
    pwaWarn('[PWA] Service worker registered');

    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs when VITE_PWA_DEBUG is true in development', () => {
    vi.stubEnv('DEV', true);
    vi.stubEnv('VITE_PWA_DEBUG', 'true');

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    pwaDebug('[PWA] Service worker registered');

    expect(isPwaDebugEnabled()).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith('[PWA] Service worker registered');
  });
});
