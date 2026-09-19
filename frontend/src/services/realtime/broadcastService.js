import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

import { getAuthToken, hasAuthToken } from 'utils/auth';

const PATROL_EVENTS = [
  'PatrolSessionStarted',
  'PatrolSessionCompleted',
  'PatrolCheckpointVerified',
  'PatrolCheckpointSuspicious',
  'PatrolRouteUpdated',
  'PatrolValidationCompleted'
];

let echoInstance = null;
let monitoringChannel = null;
const sessionChannels = new Map();
const stateListeners = new Set();
let connectionState = 'idle';
let monitoringHandlers = 0;
const sessionHandlerCounts = new Map();

function isRealtimeConfigured() {
  const enabled = import.meta.env.VITE_REVERB_ENABLED;
  if (enabled === 'false' || enabled === '0') {
    return false;
  }
  return Boolean(import.meta.env.VITE_REVERB_APP_KEY);
}

function apiBaseUrl() {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
}

function setConnectionState(next) {
  if (connectionState === next) {
    return;
  }
  connectionState = next;
  stateListeners.forEach((listener) => {
    try {
      listener(next);
    } catch (err) {
      console.warn('[broadcast] state listener failed', err);
    }
  });
}

function buildEcho() {
  if (typeof window !== 'undefined') {
    window.Pusher = Pusher;
  }

  const scheme = import.meta.env.VITE_REVERB_SCHEME || 'http';
  const host = import.meta.env.VITE_REVERB_HOST || 'localhost';
  const port = Number(import.meta.env.VITE_REVERB_PORT || 8080);
  const forceTLS = scheme === 'https';

  return new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS,
    enabledTransports: ['ws', 'wss'],
    authEndpoint: `${apiBaseUrl()}/broadcasting/auth`,
    auth: {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${getAuthToken()}`
      }
    }
  });
}

function bindPatrolListeners(channel, handler) {
  const cleanups = PATROL_EVENTS.map((eventName) => {
    const listener = (payload) => {
      try {
        handler(eventName, payload ?? {});
      } catch (err) {
        console.warn(`[broadcast] handler failed for ${eventName}`, err);
      }
    };

    channel.listen(`.${eventName}`, listener);

    return () => channel.stopListening(`.${eventName}`, listener);
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

function attachConnectionHandlers(echo) {
  const connector = echo?.connector?.pusher;
  if (!connector?.connection) {
    return () => {};
  }

  const connection = connector.connection;

  const onConnecting = () => setConnectionState('connecting');
  const onConnected = () => setConnectionState('connected');
  const onUnavailable = () => setConnectionState('unavailable');
  const onFailed = () => setConnectionState('failed');
  const onDisconnected = () => setConnectionState('disconnected');

  connection.bind('connecting', onConnecting);
  connection.bind('connected', onConnected);
  connection.bind('unavailable', onUnavailable);
  connection.bind('failed', onFailed);
  connection.bind('disconnected', onDisconnected);

  if (connection.state === 'connected') {
    setConnectionState('connected');
  }

  return () => {
    connection.unbind('connecting', onConnecting);
    connection.unbind('connected', onConnected);
    connection.unbind('unavailable', onUnavailable);
    connection.unbind('failed', onFailed);
    connection.unbind('disconnected', onDisconnected);
  };
}

function ensureMonitoringChannel() {
  if (!echoInstance || monitoringChannel) {
    return monitoringChannel;
  }

  monitoringChannel = echoInstance.private('patrol.monitoring');
  return monitoringChannel;
}

function ensureSessionChannel(patrolSessionId) {
  if (!echoInstance) {
    return null;
  }

  const key = String(patrolSessionId);
  if (sessionChannels.has(key)) {
    return sessionChannels.get(key);
  }

  const channel = echoInstance.private(`patrol.session.${key}`);
  sessionChannels.set(key, channel);
  return channel;
}

const broadcastService = {
  isConfigured: isRealtimeConfigured,

  getConnectionState() {
    return connectionState;
  },

  onStateChange(listener) {
    stateListeners.add(listener);
    listener(connectionState);
    return () => stateListeners.delete(listener);
  },

  async connect() {
    if (!isRealtimeConfigured() || !hasAuthToken()) {
      setConnectionState('disabled');
      return null;
    }

    if (echoInstance) {
      return echoInstance;
    }

    setConnectionState('connecting');

    try {
      echoInstance = buildEcho();
      attachConnectionHandlers(echoInstance);
      return echoInstance;
    } catch (err) {
      console.warn('[broadcast] failed to initialize Echo', err);
      setConnectionState('unavailable');
      echoInstance = null;
      throw err;
    }
  },

  /**
   * @param {(eventName: string, payload: object) => void} handler
   */
  subscribeMonitoring(handler) {
    monitoringHandlers += 1;

    let unbind = () => {};

    void this.connect()
      .then(() => {
        const channel = ensureMonitoringChannel();
        if (!channel) {
          return;
        }
        unbind = bindPatrolListeners(channel, handler);
      })
      .catch(() => {
        setConnectionState('unavailable');
      });

    return () => {
      monitoringHandlers = Math.max(0, monitoringHandlers - 1);
      unbind();
      this._maybeDisconnect();
    };
  },

  /**
   * @param {string} patrolSessionId
   * @param {(eventName: string, payload: object) => void} handler
   */
  subscribeSession(patrolSessionId, handler) {
    const key = String(patrolSessionId);
    const nextCount = (sessionHandlerCounts.get(key) ?? 0) + 1;
    sessionHandlerCounts.set(key, nextCount);

    let unbind = () => {};

    void this.connect()
      .then(() => {
        const channel = ensureSessionChannel(key);
        if (!channel) {
          return;
        }
        unbind = bindPatrolListeners(channel, handler);
      })
      .catch(() => {
        setConnectionState('unavailable');
      });

    return () => {
      const remaining = Math.max(0, (sessionHandlerCounts.get(key) ?? 1) - 1);
      if (remaining === 0) {
        sessionHandlerCounts.delete(key);
        const channel = sessionChannels.get(key);
        if (channel && echoInstance) {
          echoInstance.leave(`patrol.session.${key}`);
        }
        sessionChannels.delete(key);
      } else {
        sessionHandlerCounts.set(key, remaining);
      }

      unbind();
      this._maybeDisconnect();
    };
  },

  _maybeDisconnect() {
    const hasSessionSubs = sessionHandlerCounts.size > 0;
    if (monitoringHandlers > 0 || hasSessionSubs) {
      return;
    }

    if (monitoringChannel && echoInstance) {
      echoInstance.leave('patrol.monitoring');
      monitoringChannel = null;
    }

    if (echoInstance) {
      echoInstance.disconnect();
      echoInstance = null;
    }

    setConnectionState('idle');
  },

  disconnect() {
    monitoringHandlers = 0;
    sessionHandlerCounts.clear();
    sessionChannels.clear();
    monitoringChannel = null;

    if (echoInstance) {
      echoInstance.disconnect();
      echoInstance = null;
    }

    setConnectionState('idle');
  }
};

export default broadcastService;
