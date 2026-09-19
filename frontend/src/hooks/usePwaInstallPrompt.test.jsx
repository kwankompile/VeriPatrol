import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import usePwaInstallPrompt from './usePwaInstallPrompt';

function dispatchInstallPromptEvent({ outcome = 'accepted' } = {}) {
  const event = new Event('beforeinstallprompt');
  event.preventDefault = vi.fn();
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  window.dispatchEvent(event);
  return event;
}

describe('usePwaInstallPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures beforeinstallprompt and exposes install button', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());

    await act(async () => {
      dispatchInstallPromptEvent({ outcome: 'dismissed' });
    });

    expect(result.current.showInstallButton).toBe(true);
    expect(result.current.isInstallPromptSupported).toBe(true);
  });

  it('hides button after appinstalled event', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());

    await act(async () => {
      dispatchInstallPromptEvent();
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.showInstallButton).toBe(false);
    expect(result.current.isInstalled).toBe(true);
  });

  it('detects standalone mode and keeps install hidden', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes('standalone'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));

    const { result } = renderHook(() => usePwaInstallPrompt());
    expect(result.current.isStandalone).toBe(true);
    expect(result.current.showInstallButton).toBe(false);

    window.matchMedia = originalMatchMedia;
  });

  it('prompts install and clears deferred prompt after choice', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());

    let installEvent;
    await act(async () => {
      installEvent = dispatchInstallPromptEvent({ outcome: 'accepted' });
    });

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(installEvent.prompt).toHaveBeenCalledTimes(1);
    expect(result.current.showInstallButton).toBe(false);
    expect(result.current.lastPromptOutcome).toBe('accepted');
  });

  it('does not show unsupported hint immediately when prompt is unavailable', () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    expect(result.current.showInstallButton).toBe(false);
    expect(result.current.showUnsupportedHint).toBe(false);
  });

  it('shows unsupported hint only after a delay when prompt never arrives', async () => {
    const { result } = renderHook(() => usePwaInstallPrompt());
    expect(result.current.showUnsupportedHint).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    expect(result.current.showUnsupportedHint).toBe(true);
  });
});
