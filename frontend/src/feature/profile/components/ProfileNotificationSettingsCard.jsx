import { useCallback, useEffect, useState } from 'react';

import { Alert, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { IconBell, IconSend } from '@tabler/icons-react';

import {
  resolvePushNotificationStatus,
  sendTestNotification,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications
} from 'pwa/pushNotificationService';
import { useNetworkStatus } from 'pwa/useNetworkStatus';

import SettingsCard from './settings/SettingsCard';
import SettingsRow from './settings/SettingsRow';
import StatusPill from './settings/StatusPill';

const STATUS_TONE = {
  subscribed: 'active',
  permission_granted_not_subscribed: 'neutral',
  permission_default: 'neutral',
  unsupported_browser: 'warning',
  insecure_context: 'warning',
  permission_denied: 'warning',
  registration_failed: 'warning',
  push_service_error: 'warning',
  backend_subscription_failed: 'danger',
  vapid_key_error: 'danger',
  sw_unavailable_dev: 'neutral',
  sw_unavailable: 'warning'
};

function resolveStatusTone(status) {
  return STATUS_TONE[status] ?? 'neutral';
}

const STATUS_LABELS = {
  unsupported_browser: 'Unsupported browser',
  insecure_context: 'Insecure context (HTTPS required)',
  permission_denied: 'Permission denied',
  permission_default: 'Not requested',
  permission_granted_not_subscribed: 'Permission granted, not subscribed',
  subscribed: 'Subscribed',
  registration_failed: 'Registration failed',
  push_service_error: 'Push service error',
  vapid_key_error: 'VAPID key error',
  backend_subscription_failed: 'Backend subscription failed',
  sw_unavailable_dev: 'Not available in dev mode',
  sw_unavailable: 'Service worker unavailable'
};

function resolveStatusLabel(status) {
  return STATUS_LABELS[status] ?? 'Unknown';
}

export default function ProfileNotificationSettingsCard() {
  const isOnline = useNetworkStatus();

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('permission_default');
  const [subscribed, setSubscribed] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [message, setMessage] = useState(null);

  const refreshPushState = useCallback(async () => {
    const next = await resolvePushNotificationStatus();
    setStatus(next.status);
    setSubscribed(Boolean(next.subscribed));
    return next;
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        if (active) {
          await refreshPushState();
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [refreshPushState]);

  const runAction = async (action, handler) => {
    if (!isOnline) {
      setMessage({ severity: 'warning', text: 'Push notification changes require an active network connection.' });
      return;
    }

    try {
      setBusyAction(action);
      setMessage(null);
      await handler();
      await refreshPushState();
    } catch (error) {
      const text = error?.message || 'Notification action failed.';
      let errorStatus = null;
      if (text.startsWith('push_service_error:') || text.toLowerCase().includes('push service error')) {
        errorStatus = 'push_service_error';
      } else if (text.toLowerCase().includes('vapid') || text.toLowerCase().includes('vite_vapid_public_key')) {
        errorStatus = 'vapid_key_error';
      } else if (text.toLowerCase().includes('server') || text.toLowerCase().includes('subscription')) {
        errorStatus = 'backend_subscription_failed';
      } else if (text.toLowerCase().includes('service worker')) {
        errorStatus = 'registration_failed';
      }
      if (errorStatus) {
        setStatus(errorStatus);
      }
      setMessage({ severity: 'error', text: text.replace(/^push_service_error:\s*/i, 'Push service error: ') });
      // For browser-level errors (push_service_error, vapid_key_error), resolvePushNotificationStatus
      // cannot detect the error state, so re-fetching would overwrite the error status. Refresh only
      // when the error is server-side or status-resolvable.
      if (!errorStatus || errorStatus === 'backend_subscription_failed' || errorStatus === 'registration_failed') {
        await refreshPushState();
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggle = (event) => {
    const shouldEnable = event.target.checked;

    if (shouldEnable) {
      void runAction('subscribe', async () => {
        await subscribeToPushNotifications();
        setMessage({ severity: 'success', text: 'Push notifications enabled.' });
      });
      return;
    }

    void runAction('unsubscribe', async () => {
      await unsubscribeFromPushNotifications();
      setMessage({ severity: 'success', text: 'Push notifications disabled.' });
    });
  };

  const handleSendTest = () =>
    runAction('test', async () => {
      const result = await sendTestNotification();
      if (result?.success === false) {
        throw new Error(result?.message || 'Test notification failed.');
      }
      setMessage({ severity: 'success', text: 'Test notification sent. Check your device notifications.' });
    });

  const toggleDisabled =
    loading ||
    !isOnline ||
    Boolean(busyAction) ||
    status === 'unsupported_browser' ||
    status === 'insecure_context' ||
    status === 'permission_denied' ||
    status === 'registration_failed' ||
    status === 'sw_unavailable_dev' ||
    status === 'sw_unavailable';

  const switchChecked = subscribed && status === 'subscribed';
  const statusLabel = loading ? 'Checking status…' : resolveStatusLabel(status);

  return (
    <SettingsCard
      title="Notification Settings"
      subtitle="Browser & PWA alerts for patrol and system events"
      icon={<IconBell size={20} />}
    >
      <Stack spacing={2}>
        {!isOnline ? (
          <Alert severity="warning">Push notification changes require an active network connection.</Alert>
        ) : null}

        {status === 'unsupported_browser' ? (
          <Alert severity="info">Push notifications are not supported in this browser.</Alert>
        ) : null}

        {status === 'insecure_context' ? (
          <Alert severity="warning">Push notifications require HTTPS. Open the app over a secure connection.</Alert>
        ) : null}

        {status === 'permission_denied' ? (
          <Alert severity="warning">
            Notification permission was denied. Enable notifications in your browser or site settings, then return here to subscribe.
          </Alert>
        ) : null}

        {status === 'registration_failed' ? (
          <Alert severity="warning">
            The service worker is unavailable. Reload the installed PWA or ensure the app finished loading before enabling notifications.
          </Alert>
        ) : null}

        {status === 'sw_unavailable_dev' ? (
          <Alert severity="info">
            Push notifications require a production PWA service worker. Run{' '}
            <code>npm run build &amp;&amp; npm run preview</code> or install the deployed PWA to test push
            notifications.
          </Alert>
        ) : null}

        {status === 'sw_unavailable' ? (
          <Alert severity="warning">
            Service worker is unavailable. Reload the app or reinstall the PWA and try again.
          </Alert>
        ) : null}

        {status === 'vapid_key_error' ? (
          <Alert severity="error">
            <strong>VAPID key error.</strong> The frontend <code>VITE_VAPID_PUBLIC_KEY</code> is missing or invalid.
            Rebuild the app after updating <code>.env</code>:{' '}
            <code>npm run build &amp;&amp; npm run preview</code>. Confirm the key exactly matches{' '}
            <code>VAPID_PUBLIC_KEY</code> in the backend <code>.env</code>.
          </Alert>
        ) : null}

        {status === 'push_service_error' ? (
          <Alert severity="warning" data-testid="push-service-error-alert">
            <strong>Push service subscription failed.</strong> The browser could not reach the push service.
            Troubleshooting steps:
            <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
              <li>Clear site data and service workers: browser Settings → Privacy → Site Data → clear for this site.</li>
              <li>
                Confirm you are running from <code>localhost</code> or <code>127.0.0.1</code> (not a raw IP or
                file:// URL).
              </li>
              <li>
                Rebuild after any <code>.env</code> change:{' '}
                <code>npm run build &amp;&amp; npm run preview -- --host 127.0.0.1</code>
              </li>
              <li>
                Confirm <code>VITE_VAPID_PUBLIC_KEY</code> in <code>.env</code> exactly matches the backend{' '}
                <code>VAPID_PUBLIC_KEY</code>.
              </li>
              <li>Try Chrome or Edge with a fresh browser profile (incognito can block push).</li>
              <li>Check VPN, firewall, or network if the browser cannot reach the push service endpoint.</li>
            </ul>
          </Alert>
        ) : null}

        <SettingsRow
          icon={<IconBell size={18} />}
          label="Browser push notifications"
          description={switchChecked ? 'Push notifications enabled' : 'Push notifications disabled'}
          control={
            <FormControlLabel
              sx={{ m: 0 }}
              label=""
              control={
                <Switch
                  color="secondary"
                  checked={switchChecked}
                  onChange={handleToggle}
                  disabled={toggleDisabled}
                  inputProps={{ 'aria-label': 'Enable push notifications' }}
                  data-testid="push-notification-toggle"
                />
              }
            />
          }
        />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={1} alignItems="center" data-testid="push-status-label">
            <Typography variant="body2" color="text.secondary">
              Status:
            </Typography>
            <StatusPill label={statusLabel} tone={resolveStatusTone(status)} />
          </Stack>
          <Button
            variant="text"
            color="secondary"
            startIcon={<IconSend size={16} />}
            disabled={!subscribed || loading || !isOnline || Boolean(busyAction) || status !== 'subscribed'}
            onClick={() => void handleSendTest()}
          >
            {busyAction === 'test' ? 'Sending…' : 'Send test notification'}
          </Button>
        </Stack>

        {message ? <Alert severity={message.severity}>{message.text}</Alert> : null}
      </Stack>
    </SettingsCard>
  );
}
