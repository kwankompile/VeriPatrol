import { afterEach, describe, expect, it } from 'vitest';

import {
  closeAllMockBroadcastChannels,
  getActiveMockBroadcastChannelCount,
  installMockBroadcastChannel,
  MockBroadcastChannel,
  uninstallMockBroadcastChannel
} from './mockBroadcastChannel';

describe('mockBroadcastChannel', () => {
  afterEach(() => {
    closeAllMockBroadcastChannels();
    installMockBroadcastChannel();
  });

  it('tracks active instances and closes them idempotently', () => {
    const a = new MockBroadcastChannel('test-a');
    const b = new MockBroadcastChannel('test-a');
    expect(getActiveMockBroadcastChannelCount()).toBe(2);

    a.close();
    a.close();
    expect(getActiveMockBroadcastChannelCount()).toBe(1);

    b.close();
    expect(getActiveMockBroadcastChannelCount()).toBe(0);
  });

  it('delivers postMessage to peer onmessage and addEventListener handlers', () => {
    const receiver = new MockBroadcastChannel('peers');
    const viaProperty = [];
    const viaListener = [];

    receiver.onmessage = (event) => {
      viaProperty.push(event.data);
    };
    receiver.addEventListener('message', (event) => {
      viaListener.push(event.data);
    });

    const sender = new MockBroadcastChannel('peers');
    sender.postMessage({ hello: 'world' });

    expect(viaProperty).toEqual([{ hello: 'world' }]);
    expect(viaListener).toEqual([{ hello: 'world' }]);

    sender.close();
    receiver.close();
  });

  it('does not deliver to a closed peer', () => {
    const receiver = new MockBroadcastChannel('closed-peer');
    const seen = [];
    receiver.onmessage = (event) => {
      seen.push(event.data);
    };
    receiver.close();

    const sender = new MockBroadcastChannel('closed-peer');
    sender.postMessage({ value: 1 });
    sender.close();

    expect(seen).toEqual([]);
  });

  it('closeAllMockBroadcastChannels clears every open channel', () => {
    new MockBroadcastChannel('x');
    new MockBroadcastChannel('y');
    expect(getActiveMockBroadcastChannelCount()).toBe(2);

    closeAllMockBroadcastChannels();
    expect(getActiveMockBroadcastChannelCount()).toBe(0);
  });

  it('uninstall restores the previous global constructor', () => {
    installMockBroadcastChannel();
    expect(globalThis.BroadcastChannel).toBe(MockBroadcastChannel);

    uninstallMockBroadcastChannel();
    expect(globalThis.BroadcastChannel).not.toBe(MockBroadcastChannel);

    installMockBroadcastChannel();
    expect(globalThis.BroadcastChannel).toBe(MockBroadcastChannel);
  });
});
