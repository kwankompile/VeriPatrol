import { useEffect, useState } from 'react';

import { flushSyncQueue } from './syncService';

function getOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** Tracks `navigator.onLine` plus window `online` / `offline` events. */
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(getOnline);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      try {
        flushSyncQueue();
      } catch {
        /* flushSyncQueue is defensive; ignore */
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setIsOnline(getOnline());

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}
