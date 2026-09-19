import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeAllMockBroadcastChannels,
  getActiveMockBroadcastChannelCount,
  installMockBroadcastChannel,
  MockBroadcastChannel,
  uninstallMockBroadcastChannel
} from '../../../test/mockBroadcastChannel';
import { PROFILE_UPDATED_EVENT, publishProfileUpdated, subscribeToProfileUpdates } from './profileSyncEvents';

describe('profileSyncEvents', () => {
  beforeEach(() => {
    localStorage.clear();
    closeAllMockBroadcastChannels();
    installMockBroadcastChannel();
  });

  afterEach(() => {
    closeAllMockBroadcastChannels();
    vi.restoreAllMocks();
  });

  it('publishes same-tab custom events', () => {
    const handler = vi.fn();

    window.addEventListener(PROFILE_UPDATED_EVENT, handler);
    publishProfileUpdated({ profile: { id: 'user-1', profileVersion: 2 } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toMatchObject({
      profile: { id: 'user-1', profileVersion: 2 }
    });
    expect(handler.mock.calls[0][0].detail.eventId).toEqual(expect.any(String));

    window.removeEventListener(PROFILE_UPDATED_EVENT, handler);
  });

  it('subscribes and unsubscribes without leaking listeners', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToProfileUpdates(callback);

    publishProfileUpdated({ profile: { id: 'user-1' } });
    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
    publishProfileUpdated({ profile: { id: 'user-2' } });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('closes BroadcastChannel when the subscription is unsubscribed', () => {
    expect(getActiveMockBroadcastChannelCount()).toBe(0);

    const unsubscribe = subscribeToProfileUpdates(vi.fn());
    expect(getActiveMockBroadcastChannelCount()).toBe(1);

    unsubscribe();
    expect(getActiveMockBroadcastChannelCount()).toBe(0);
  });

  it('does not create duplicate active channels when re-subscribing after unsubscribe', () => {
    const first = subscribeToProfileUpdates(vi.fn());
    expect(getActiveMockBroadcastChannelCount()).toBe(1);
    first();

    const second = subscribeToProfileUpdates(vi.fn());
    expect(getActiveMockBroadcastChannelCount()).toBe(1);
    second();

    expect(getActiveMockBroadcastChannelCount()).toBe(0);
  });

  it('leaves no active channel after repeated subscribe/unsubscribe cycles', () => {
    for (let i = 0; i < 5; i += 1) {
      const unsubscribe = subscribeToProfileUpdates(vi.fn());
      publishProfileUpdated({ profile: { id: `user-${i}` } });
      unsubscribe();
    }

    expect(getActiveMockBroadcastChannelCount()).toBe(0);
  });

  it('publish closes its ephemeral channel after posting', () => {
    const unsubscribe = subscribeToProfileUpdates(vi.fn());
    expect(getActiveMockBroadcastChannelCount()).toBe(1);

    publishProfileUpdated({ profile: { id: 'user-1' } });
    // Subscriber channel remains; publisher channel is closed.
    expect(getActiveMockBroadcastChannelCount()).toBe(1);

    unsubscribe();
    expect(getActiveMockBroadcastChannelCount()).toBe(0);
  });

  it('deduplicates deliveries that share the same eventId', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToProfileUpdates(callback);

    const detail = {
      eventId: 'duplicate-event-id',
      profile: { id: 'user-1' }
    };

    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail }));
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail }));

    expect(callback).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('delivers cross-channel BroadcastChannel messages to subscribers', () => {
    const callback = vi.fn();
    const unsubscribe = subscribeToProfileUpdates(callback);

    const publisher = new MockBroadcastChannel('profile-sync');
    publisher.postMessage({
      eventId: 'from-other-tab',
      profile: { id: 'user-other' }
    });
    publisher.close();

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'from-other-tab',
        profile: { id: 'user-other' }
      })
    );

    unsubscribe();
  });

  it('uses localStorage fallback only when BroadcastChannel is unavailable', () => {
    uninstallMockBroadcastChannel();
    const originalBroadcastChannel = globalThis.BroadcastChannel;
    // @ts-expect-error test override
    delete globalThis.BroadcastChannel;
    if (typeof window !== 'undefined') {
      // @ts-expect-error test override
      delete window.BroadcastChannel;
    }

    try {
      publishProfileUpdated({ profile: { id: 'user-1' } });
      expect(localStorage.getItem('profile:last-updated')).toContain('user-1');
    } finally {
      if (originalBroadcastChannel) {
        globalThis.BroadcastChannel = originalBroadcastChannel;
      }
      installMockBroadcastChannel();
    }
  });

  it('does not write localStorage when BroadcastChannel is available', () => {
    publishProfileUpdated({ profile: { id: 'user-1' } });

    expect(localStorage.getItem('profile:last-updated')).toBeNull();
  });

  it('restores the global BroadcastChannel mock after uninstall/reinstall', () => {
    expect(globalThis.BroadcastChannel).toBe(MockBroadcastChannel);

    uninstallMockBroadcastChannel();
    expect(globalThis.BroadcastChannel).not.toBe(MockBroadcastChannel);

    installMockBroadcastChannel();
    expect(globalThis.BroadcastChannel).toBe(MockBroadcastChannel);
    expect(getActiveMockBroadcastChannelCount()).toBe(0);
  });
});
