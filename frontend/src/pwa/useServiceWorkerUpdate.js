import { useCallback, useEffect, useRef, useState } from 'react';

import { PWA_SKIP_WAITING_MESSAGE_TYPE } from './serviceWorkerUpdateConstants';
import { reloadApplication } from './reloadApplication';

function isServiceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * @param {ServiceWorkerRegistration} registration
 * @returns {ServiceWorker | null}
 */
export function getWaitingWorker(registration) {
  return registration?.waiting ?? null;
}

/**
 * Returns true when an installed worker is waiting while a controller is active.
 * @param {ServiceWorkerRegistration} registration
 */
export function isUpdateWaiting(registration) {
  if (!registration?.waiting) {
    return false;
  }
  return Boolean(navigator.serviceWorker.controller);
}

/**
 * @param {ServiceWorker} worker
 */
export function postSkipWaitingMessage(worker) {
  worker?.postMessage({ type: PWA_SKIP_WAITING_MESSAGE_TYPE });
}

/**
 * Listens for service worker updates and exposes a user-triggered reload flow.
 * @returns {{ updateAvailable: boolean, reloadUpdate: () => void, isSupported: boolean }}
 */
export default function useServiceWorkerUpdate() {
  const registrationRef = useRef(null);
  const reloadRequestedRef = useRef(false);
  const hasReloadedRef = useRef(false);

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const isSupported = isServiceWorkerSupported();

  const markUpdateAvailable = useCallback((registration) => {
    if (isUpdateWaiting(registration)) {
      setUpdateAvailable(true);
    }
  }, []);

  const reloadUpdate = useCallback(() => {
    if (!isServiceWorkerSupported() || reloadRequestedRef.current || hasReloadedRef.current) {
      return;
    }

    const registration = registrationRef.current;
    const waiting = getWaitingWorker(registration);
    if (!waiting) {
      return;
    }

    reloadRequestedRef.current = true;

    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      if (hasReloadedRef.current) {
        return;
      }
      hasReloadedRef.current = true;
      reloadApplication();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    postSkipWaitingMessage(waiting);
  }, []);

  useEffect(() => {
    if (!isServiceWorkerSupported()) {
      return undefined;
    }

    let registration;
    let mounted = true;

    const handleUpdateFound = () => {
      const installing = registration?.installing;
      if (!installing) {
        return;
      }

      installing.addEventListener('statechange', () => {
        if (!mounted) {
          return;
        }
        if (installing.state === 'installed') {
          markUpdateAvailable(registration);
        }
      });
    };

    navigator.serviceWorker.ready
      .then((reg) => {
        if (!mounted) {
          return;
        }
        registration = reg;
        registrationRef.current = reg;
        markUpdateAvailable(reg);
        reg.addEventListener('updatefound', handleUpdateFound);
      })
      .catch(() => {});

    return () => {
      mounted = false;
      registration?.removeEventListener('updatefound', handleUpdateFound);
    };
  }, [markUpdateAvailable]);

  return {
    updateAvailable,
    reloadUpdate,
    isSupported
  };
}
