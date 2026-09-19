/**
 * In-memory BroadcastChannel for Vitest/jsdom.
 *
 * Node's native BroadcastChannel (injected into jsdom by Vitest) delivers
 * worker_threads MessageEvent instances that fail EventTarget type checks
 * (`ERR_INVALID_ARG_TYPE`), producing uncaught exceptions after tests pass.
 *
 * This mock is standards-shaped, uses no worker threads, and tracks open
 * instances so tests can assert cleanup.
 */

/** @type {Map<string, Set<MockBroadcastChannel>>} */
const channelsByName = new Map();

let activeInstanceCount = 0;
let installed = false;
/** @type {typeof BroadcastChannel | undefined} */
let previousGlobal = undefined;
/** @type {typeof BroadcastChannel | undefined} */
let previousWindow = undefined;

/**
 * @returns {number}
 */
export function getActiveMockBroadcastChannelCount() {
  return activeInstanceCount;
}

export function closeAllMockBroadcastChannels() {
  for (const group of channelsByName.values()) {
    for (const channel of [...group]) {
      channel.close();
    }
  }
  channelsByName.clear();
  activeInstanceCount = 0;
}

export class MockBroadcastChannel {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = String(name);
    /** @type {((event: { data: unknown; type: string }) => void) | null} */
    this.onmessage = null;
    /** @type {((event: { data: unknown; type: string }) => void) | null} */
    this.onmessageerror = null;
    this._closed = false;
    /** @type {Map<string, Set<EventListenerOrEventListenerObject>>} */
    this._listeners = new Map();

    activeInstanceCount += 1;

    let group = channelsByName.get(this.name);
    if (!group) {
      group = new Set();
      channelsByName.set(this.name, group);
    }
    group.add(this);
  }

  /**
   * @param {unknown} data
   */
  postMessage(data) {
    if (this._closed) {
      return;
    }

    const group = channelsByName.get(this.name);
    if (!group) {
      return;
    }

    // Structured-clone approximation: JSON round-trip keeps tests deterministic
    // without depending on Node/jsdom structuredClone quirks.
    let payload = data;
    try {
      payload = JSON.parse(JSON.stringify(data));
    } catch {
      payload = data;
    }

    for (const peer of group) {
      if (peer === this || peer._closed) {
        continue;
      }

      const event = {
        type: 'message',
        data: payload,
        origin: '',
        lastEventId: '',
        source: null,
        ports: []
      };

      // Synchronous delivery avoids pending MessagePort callbacks after teardown
      // (the failure mode of Node's native BroadcastChannel in jsdom).
      if (typeof peer.onmessage === 'function') {
        peer.onmessage(event);
      }

      const listeners = peer._listeners.get('message');
      if (listeners) {
        for (const listener of listeners) {
          if (typeof listener === 'function') {
            listener(event);
          } else if (listener && typeof listener.handleEvent === 'function') {
            listener.handleEvent(event);
          }
        }
      }
    }
  }

  /**
   * @param {string} type
   * @param {EventListenerOrEventListenerObject} listener
   */
  addEventListener(type, listener) {
    if (this._closed || typeof type !== 'string' || !listener) {
      return;
    }

    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(listener);
  }

  /**
   * @param {string} type
   * @param {EventListenerOrEventListenerObject} listener
   */
  removeEventListener(type, listener) {
    const set = this._listeners.get(type);
    if (!set) {
      return;
    }
    set.delete(listener);
    if (set.size === 0) {
      this._listeners.delete(type);
    }
  }

  close() {
    if (this._closed) {
      return;
    }

    this._closed = true;
    this.onmessage = null;
    this.onmessageerror = null;
    this._listeners.clear();

    const group = channelsByName.get(this.name);
    if (group) {
      group.delete(this);
      if (group.size === 0) {
        channelsByName.delete(this.name);
      }
    }

    activeInstanceCount = Math.max(0, activeInstanceCount - 1);
  }
}

/**
 * Install the mock on globalThis and window (when present).
 * Idempotent: repeated calls keep the same mock installed.
 */
export function installMockBroadcastChannel() {
  if (installed) {
    return;
  }

  previousGlobal = globalThis.BroadcastChannel;
  if (typeof window !== 'undefined') {
    previousWindow = window.BroadcastChannel;
  }

  globalThis.BroadcastChannel = MockBroadcastChannel;
  if (typeof window !== 'undefined') {
    window.BroadcastChannel = MockBroadcastChannel;
  }

  installed = true;
}

/**
 * Restore whatever BroadcastChannel was present before install.
 */
export function uninstallMockBroadcastChannel() {
  if (!installed) {
    return;
  }

  closeAllMockBroadcastChannels();

  if (previousGlobal === undefined) {
    delete globalThis.BroadcastChannel;
  } else {
    globalThis.BroadcastChannel = previousGlobal;
  }

  if (typeof window !== 'undefined') {
    if (previousWindow === undefined) {
      delete window.BroadcastChannel;
    } else {
      window.BroadcastChannel = previousWindow;
    }
  }

  previousGlobal = undefined;
  previousWindow = undefined;
  installed = false;
}
