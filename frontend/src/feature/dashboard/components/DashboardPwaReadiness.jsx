import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import { IconCircleCheck, IconAlertTriangle, IconMapPin, IconWifi, IconWifiOff } from '@tabler/icons-react';

import { db } from 'pwa/db';
import { SYNC_QUEUE_STATUS_FAILED, SYNC_QUEUE_STATUS_PENDING } from 'pwa/syncService';
import { useNetworkStatus } from 'pwa/useNetworkStatus';

export default function DashboardPwaReadiness({ readinessMessage = null }) {
  const isOnline = useNetworkStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [gpsState, setGpsState] = useState('unknown');

  const refreshQueueCounts = useCallback(async () => {
    try {
      const [pending, failed] = await Promise.all([
        db.sync_queue.where('status').equals(SYNC_QUEUE_STATUS_PENDING).count(),
        db.sync_queue.where('status').equals(SYNC_QUEUE_STATUS_FAILED).count()
      ]);
      setPendingCount(pending);
      setFailedCount(failed);
    } catch {
      setPendingCount(0);
      setFailedCount(0);
    }
  }, []);

  useEffect(() => {
    void refreshQueueCounts();
    const intervalId = window.setInterval(() => {
      void refreshQueueCounts();
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [refreshQueueCounts]);

  useEffect(() => {
    let permission;
    const permissionsApi = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!permissionsApi?.query) {
      return undefined;
    }
    const handleChange = () => setGpsState(permission?.state ?? 'unknown');
    permissionsApi
      .query({ name: 'geolocation' })
      .then((status) => {
        permission = status;
        setGpsState(status.state);
        status.addEventListener?.('change', handleChange);
      })
      .catch(() => setGpsState('unknown'));
    return () => permission?.removeEventListener?.('change', handleChange);
  }, []);

  const gpsDenied = gpsState === 'denied';
  const hasSyncProblem = failedCount > 0;
  const isReady = isOnline && !hasSyncProblem && !gpsDenied;

  const gpsLabel =
    gpsState === 'granted'
      ? 'GPS allowed'
      : gpsState === 'denied'
        ? 'GPS blocked'
        : gpsState === 'prompt'
          ? 'GPS needs permission'
          : 'GPS status unknown';

  return (
    <Stack spacing={1.5} data-testid="dashboard-pwa-readiness">
      <Box
        data-testid="dashboard-pwa-status-banner"
        data-status={isReady ? 'ready' : 'attention'}
        sx={(theme) => {
          const tone = isReady ? theme.palette.success : theme.palette.error;
          return {
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: alpha(tone.main, 0.4),
            bgcolor: alpha(tone.main, 0.1),
            display: 'flex',
            alignItems: 'center',
            gap: 1.5
          };
        }}
      >
        <Box sx={(theme) => ({ color: (isReady ? theme.palette.success : theme.palette.error).main, display: 'inline-flex' })}>
          {isReady ? <IconCircleCheck size={32} /> : <IconAlertTriangle size={32} />}
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {isReady ? 'Ready for patrol' : 'Attention needed'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isReady ? 'Online and sync is healthy.' : 'Resolve offline, sync, or GPS issues below.'}
          </Typography>
        </Box>
      </Box>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          size="small"
          color={isOnline ? 'success' : 'error'}
          icon={isOnline ? <IconWifi size={14} /> : <IconWifiOff size={14} />}
          label={isOnline ? 'Online' : 'Offline'}
          data-testid="dashboard-pwa-network"
        />
        <Chip
          size="small"
          color={gpsDenied ? 'error' : gpsState === 'granted' ? 'success' : 'default'}
          variant={gpsState === 'granted' ? 'filled' : 'outlined'}
          icon={<IconMapPin size={14} />}
          label={gpsLabel}
          data-testid="dashboard-pwa-gps"
        />
        <Chip size="small" variant="outlined" label={`Pending sync: ${pendingCount}`} data-testid="dashboard-pwa-pending" />
        <Chip
          size="small"
          variant="outlined"
          color={failedCount > 0 ? 'error' : 'default'}
          label={`Failed sync: ${failedCount}`}
          data-testid="dashboard-pwa-failed"
        />
      </Stack>

      {readinessMessage ? (
        <Typography variant="body2" color="text.secondary">
          {readinessMessage}
        </Typography>
      ) : null}

      {!isOnline ? (
        <Alert severity="info" data-testid="dashboard-pwa-offline-alert">
          You are offline. Patrol data is saved locally and will sync when connectivity returns.
        </Alert>
      ) : null}

      {gpsDenied ? (
        <Alert severity="warning" data-testid="dashboard-pwa-gps-alert">
          Location permission is blocked. Enable GPS access so patrol tracking works correctly.
        </Alert>
      ) : null}

      {failedCount > 0 ? (
        <Alert severity="warning" data-testid="dashboard-pwa-failed-alert">
          Some patrol data failed to sync. Open Patrol to review and retry.
        </Alert>
      ) : null}
    </Stack>
  );
}

DashboardPwaReadiness.propTypes = {
  readinessMessage: PropTypes.string
};
