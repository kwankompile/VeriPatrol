import { useCallback, useEffect, useState } from 'react';

import { pwaDebugWarn } from 'pwa/pwaLogger';

const INSTALL_UNSUPPORTED_HINT_DELAY_MS = 8000;

function safeReadStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    const mqStandalone = window.matchMedia?.('(display-mode: standalone)');
    const mqFullscreen = window.matchMedia?.('(display-mode: fullscreen)');
    const standaloneMq = Boolean(mqStandalone?.matches);
    const fullscreenMq = Boolean(mqFullscreen?.matches);
    let iosStandalone = false;
    if (typeof navigator !== 'undefined' && navigator != null) {
      iosStandalone = Boolean(navigator.standalone);
    }
    return standaloneMq || fullscreenMq || iosStandalone;
  } catch (e) {
    pwaDebugWarn('[PWA] safeReadStandalone failed:', e);
    return false;
  }
}

/**
 * Safari < 14 / some WebViews only implement addListener on MediaQueryList, not addEventListener.
 * Calling the wrong API throws and can break the React tree on mobile.
 */
function subscribeMediaQueryChange(mql, handler) {
  if (!mql || typeof handler !== 'function') return () => {};
  try {
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', handler);
      return () => {
        try {
          mql.removeEventListener('change', handler);
        } catch (e) {
          pwaDebugWarn('[PWA] MediaQueryList removeEventListener failed:', e);
        }
      };
    }
    if (typeof mql.addListener === 'function') {
      mql.addListener(handler);
      return () => {
        try {
          mql.removeListener(handler);
        } catch (e) {
          pwaDebugWarn('[PWA] MediaQueryList removeListener failed:', e);
        }
      };
    }
  } catch (e) {
    pwaDebugWarn('[PWA] MediaQueryList subscribe failed:', e);
  }
  return () => {};
}

/**
 * Captures the PWA install prompt and exposes when the Install button should show.
 * All browser APIs are guarded so unsupported mobile browsers never crash the app.
 */
export default function usePwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isStandalone, setIsStandalone] = useState(() => safeReadStandalone());
  const [supportsPromptEvent, setSupportsPromptEvent] = useState(false);
  const [lastPromptOutcome, setLastPromptOutcome] = useState(null);
  const [showDelayedUnsupportedHint, setShowDelayedUnsupportedHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let unsubStandalone = () => {};
    let unsubFullscreen = () => {};

    const onBeforeInstallPrompt = (event) => {
      try {
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
        setSupportsPromptEvent(true);
        setDeferredPrompt(event);
      } catch (e) {
        pwaDebugWarn('[PWA] beforeinstallprompt handler failed:', e);
      }
    };

    const onAppInstalled = () => {
      try {
        setIsInstalled(true);
        setDeferredPrompt(null);
      } catch (e) {
        pwaDebugWarn('[PWA] appinstalled handler failed:', e);
      }
    };

    try {
      const mqStandalone = window.matchMedia?.('(display-mode: standalone)');
      const mqFullscreen = window.matchMedia?.('(display-mode: fullscreen)');

      const syncStandalone = () => {
        try {
          setIsStandalone(safeReadStandalone());
        } catch (e) {
          pwaDebugWarn('[PWA] syncStandalone failed:', e);
        }
      };

      syncStandalone();

      if (mqStandalone) {
        unsubStandalone = subscribeMediaQueryChange(mqStandalone, syncStandalone);
      }
      if (mqFullscreen) {
        unsubFullscreen = subscribeMediaQueryChange(mqFullscreen, syncStandalone);
      }
    } catch (e) {
      pwaDebugWarn('[PWA] matchMedia setup failed (install listeners still active):', e);
    }

    try {
      window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.addEventListener('appinstalled', onAppInstalled);
    } catch (e) {
      pwaDebugWarn('[PWA] window install event listeners failed:', e);
    }

    return () => {
      try {
        unsubStandalone();
        unsubFullscreen();
        window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
        window.removeEventListener('appinstalled', onAppInstalled);
      } catch (e) {
        pwaDebugWarn('[PWA] usePwaInstallPrompt cleanup failed:', e);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    if (isStandalone || isInstalled || deferredPrompt || supportsPromptEvent) {
      setShowDelayedUnsupportedHint(false);
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setShowDelayedUnsupportedHint(true);
    }, INSTALL_UNSUPPORTED_HINT_DELAY_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [deferredPrompt, isInstalled, isStandalone, supportsPromptEvent]);

  const showInstallButton = Boolean(deferredPrompt) && !isStandalone && !isInstalled;
  const isInstallPromptSupported = supportsPromptEvent;
  const showUnsupportedHint =
    showDelayedUnsupportedHint && !showInstallButton && !isStandalone && !isInstalled && !supportsPromptEvent;

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt || typeof deferredPrompt.prompt !== 'function') {
      pwaDebugWarn('[PWA] promptInstall: deferred prompt or prompt() unavailable');
      setLastPromptOutcome('unavailable');
      return;
    }
    try {
      await deferredPrompt.prompt();
      const choice = deferredPrompt.userChoice;
      if (choice && typeof choice.then === 'function') {
        const resolved = await choice;
        setLastPromptOutcome(resolved?.outcome ?? 'unknown');
      } else {
        setLastPromptOutcome('unknown');
      }
    } catch (e) {
      pwaDebugWarn('[PWA] promptInstall failed:', e);
      setLastPromptOutcome('error');
    } finally {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return {
    deferredPrompt,
    showInstallButton,
    promptInstall,
    isStandalone,
    isInstalled,
    isInstallPromptSupported,
    showUnsupportedHint,
    lastPromptOutcome
  };
}
