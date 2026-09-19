import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PWA_SKIP_WAITING_MESSAGE_TYPE } from './serviceWorkerUpdateConstants';
import useServiceWorkerUpdate, {
  getWaitingWorker,
  isUpdateWaiting,
  postSkipWaitingMessage
} from './useServiceWorkerUpdate';

vi.mock('./reloadApplication', () => ({
  reloadApplication: vi.fn()
}));

import { reloadApplication } from './reloadApplication';

function createWaitingWorker() {
  return {
    state: 'installed',
    postMessage: vi.fn()
  };
}

function createMockRegistration({ waiting = null, installing = null } = {}) {
  const listeners = {};

  return {
    waiting,
    installing,
    addEventListener: vi.fn((event, handler) => {
      listeners[event] = handler;
    }),
    removeEventListener: vi.fn((event, handler) => {
      if (listeners[event] === handler) {
        delete listeners[event];
      }
    }),
    emitUpdateFound: () => {
      listeners.updatefound?.();
    }
  };
}

function installServiceWorkerMocks({ registration, controller = {} } = {}) {
  const controllerChangeListeners = new Set();

  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller,
      ready: Promise.resolve(registration),
      addEventListener: vi.fn((event, handler) => {
        if (event === 'controllerchange') {
          controllerChangeListeners.add(handler);
        }
      }),
      removeEventListener: vi.fn((event, handler) => {
        if (event === 'controllerchange') {
          controllerChangeListeners.delete(handler);
        }
      }),
      emitControllerChange: () => {
        controllerChangeListeners.forEach((handler) => handler());
      }
    }
  });

  return {
    emitControllerChange: () => {
      controllerChangeListeners.forEach((handler) => handler());
    }
  };
}

describe('service worker update helpers', () => {
  it('detects waiting worker only when a controller is active', () => {
    const waiting = createWaitingWorker();
    const registration = createMockRegistration({ waiting });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: {} }
    });

    expect(isUpdateWaiting(registration)).toBe(true);
    expect(getWaitingWorker(registration)).toBe(waiting);
  });

  it('posts SKIP_WAITING to the waiting worker', () => {
    const waiting = createWaitingWorker();
    postSkipWaitingMessage(waiting);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: PWA_SKIP_WAITING_MESSAGE_TYPE });
  });
});

describe('useServiceWorkerUpdate', () => {
  const originalServiceWorker = navigator.serviceWorker;

  afterEach(() => {
    if (originalServiceWorker === undefined) {
      delete navigator.serviceWorker;
    } else {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: originalServiceWorker
      });
    }
    vi.clearAllMocks();
  });

  it('does not report an update when service workers are unsupported', () => {
    delete navigator.serviceWorker;

    const { result } = renderHook(() => useServiceWorkerUpdate());

    expect(result.current.isSupported).toBe(false);
    expect(result.current.updateAvailable).toBe(false);
  });

  it('reports updateAvailable when a waiting service worker exists', async () => {
    const waiting = createWaitingWorker();
    const registration = createMockRegistration({ waiting });
    installServiceWorkerMocks({ registration, controller: {} });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  it('detects updatefound when installing worker reaches installed state', async () => {
    const installingListeners = [];
    const installing = {
      state: 'installing',
      addEventListener: vi.fn((event, handler) => {
        if (event === 'statechange') {
          installingListeners.push(handler);
        }
      })
    };
    const registration = createMockRegistration({ installing });
    installServiceWorkerMocks({ registration, controller: {} });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      await Promise.resolve();
      registration.emitUpdateFound();
      registration.waiting = createWaitingWorker();
      installing.state = 'installed';
      installingListeners.forEach((handler) => handler());
      await Promise.resolve();
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  it('posts SKIP_WAITING and reloads once on controllerchange', async () => {
    const waiting = createWaitingWorker();
    const registration = createMockRegistration({ waiting });
    const sw = installServiceWorkerMocks({ registration, controller: {} });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.reloadUpdate();
    });

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: PWA_SKIP_WAITING_MESSAGE_TYPE });

    act(() => {
      sw.emitControllerChange();
      sw.emitControllerChange();
    });

    expect(reloadApplication).toHaveBeenCalledTimes(1);
  });

  it('does not reload when no waiting worker is present', async () => {
    const registration = createMockRegistration();
    installServiceWorkerMocks({ registration, controller: {} });

    const { result } = renderHook(() => useServiceWorkerUpdate());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.reloadUpdate();
    });

    expect(reloadApplication).not.toHaveBeenCalled();
  });
});
