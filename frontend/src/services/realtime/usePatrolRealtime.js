import { useEffect, useRef, useState } from 'react';

import broadcastService from './broadcastService';

/**
 * Subscribe to patrol monitoring/session websocket events.
 *
 * @param {{
 *   patrolSessionId?: string,
 *   enabled?: boolean,
 *   onEvent?: (event: { scope: 'monitoring' | 'session', name: string, payload: object }) => void
 * }} options
 */
export function usePatrolRealtime({ patrolSessionId, enabled = true, onEvent } = {}) {
  const [connectionState, setConnectionState] = useState(broadcastService.getConnectionState());
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled || !broadcastService.isConfigured()) {
      setConnectionState('disabled');
      return undefined;
    }

    const unsubState = broadcastService.onStateChange(setConnectionState);
    const dispatch = (scope, name, payload) => {
      onEventRef.current?.({ scope, name, payload });
    };

    const unsubMonitoring = broadcastService.subscribeMonitoring((name, payload) => {
      dispatch('monitoring', name, payload);
    });

    const unsubSession = patrolSessionId
      ? broadcastService.subscribeSession(patrolSessionId, (name, payload) => {
          dispatch('session', name, payload);
        })
      : () => {};

    return () => {
      unsubMonitoring();
      unsubSession();
      unsubState();
    };
  }, [enabled, patrolSessionId]);

  const isConnected = connectionState === 'connected';

  return {
    connectionState,
    isConnected,
    isRealtimeEnabled: broadcastService.isConfigured()
  };
}

export default usePatrolRealtime;
