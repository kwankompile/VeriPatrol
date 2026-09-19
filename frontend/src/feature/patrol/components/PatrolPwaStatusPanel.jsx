import { useCallback, useEffect, useMemo, useState } from 'react';
import { alpha } from '@mui/material/styles';
import { Alert, Box, Button, Chip, Link, Paper, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { IconCurrentLocation } from '@tabler/icons-react';

import { db } from 'pwa/db';
import {
  flushSyncQueue,
  resetTerminalSyncFailures,
  SYNC_QUEUE_STATUS_FAILED,
  SYNC_QUEUE_STATUS_PENDING,
  SYNC_RESULT_STATUS_CONFLICT,
  SYNC_RESULT_STATUS_EXHAUSTED,
  SYNC_RESULT_STATUS_VALIDATION_FAILED
} from 'pwa/syncService';
import { useNetworkStatus } from 'pwa/useNetworkStatus';
import { gpsHealthLabel, gpsHealthSeverity } from '../utils/patrolGpsUtils';

const POLL_INTERVAL_MS = 3000;

function formatTimestamp(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

/**
 * PWA/GPS telemetry panel for the patrol page.
 * Read-only status surface: no GPS lifecycle or geolocation API calls.
 */
export default function PatrolPwaStatusPanel({
  patrolId,
  trackingActive,
  gpsHealthStatus = 'inactive',
  gpsAccuracyMeters = null,
  currentLocation = null
}) {
  const isOnline = useNetworkStatus();
  const [locationLogCount, setLocationLogCount] = useState(0);
  const [lastSavedTimestamp, setLastSavedTimestamp] = useState(null);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [failedQueueCount, setFailedQueueCount] = useState(0);
  const [validationFailedCount, setValidationFailedCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [exhaustedCount, setExhaustedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [errorText, setErrorText] = useState('');

  const loadPanelStats = useCallback(async () => {
    try {
      const [pendingCount, failedRows] = await Promise.all([
        db.sync_queue.where('status').equals(SYNC_QUEUE_STATUS_PENDING).count(),
        db.sync_queue.where('status').equals(SYNC_QUEUE_STATUS_FAILED).toArray()
      ]);

      setPendingQueueCount(pendingCount);
      setFailedQueueCount(failedRows.length);
      setValidationFailedCount(failedRows.filter((row) => row.resultStatus === SYNC_RESULT_STATUS_VALIDATION_FAILED).length);
      setConflictCount(failedRows.filter((row) => row.resultStatus === SYNC_RESULT_STATUS_CONFLICT).length);
      setExhaustedCount(failedRows.filter((row) => row.resultStatus === SYNC_RESULT_STATUS_EXHAUSTED).length);

      if (!patrolId) {
        setLocationLogCount(0);
        setLastSavedTimestamp(null);
        setErrorText('');
        return;
      }

      const rows = await db.location_logs.where('patrolId').equals(patrolId).toArray();
      setLocationLogCount(rows.length);

      const latest = rows.reduce((maxTs, row) => {
        const ts = Number(row?.timestamp);
        return Number.isFinite(ts) && ts > maxTs ? ts : maxTs;
      }, 0);

      setLastSavedTimestamp(latest > 0 ? latest : null);
      setErrorText('');
    } catch (error) {
      setErrorText(error?.message || 'Failed to load PWA patrol stats');
    }
  }, [patrolId]);

  useEffect(() => {
    let active = true;

    const tick = async () => {
      if (!active) return;
      await loadPanelStats();
    };

    void tick();
    const timerId = setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(timerId);
    };
  }, [loadPanelStats]);

  const handleRetrySync = async () => {
    try {
      setSyncing(true);
      setErrorText('');
      await resetTerminalSyncFailures();
      await flushSyncQueue();
      await loadPanelStats();
    } catch (error) {
      setErrorText(error?.message || 'Retry sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const queueSummary = useMemo(() => pendingQueueCount + failedQueueCount, [pendingQueueCount, failedQueueCount]);

  const needsSyncAttention = failedQueueCount > 0 || validationFailedCount > 0 || conflictCount > 0 || exhaustedCount > 0;

  return (
    <Paper sx={{ p: 2 }} data-testid="patrol-pwa-status-panel">
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
        <Typography variant="h6">Device & sync health</Typography>
        <Button variant="outlined" size="small" onClick={handleRetrySync} disabled={syncing || queueSummary === 0}>
          {syncing ? 'Syncing...' : 'Retry Sync'}
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Chip label={isOnline ? 'Online' : 'Offline'} color={isOnline ? 'success' : 'warning'} size="small" data-testid="patrol-network-chip" />
        <Chip
          label={gpsHealthLabel(gpsHealthStatus)}
          color={gpsHealthSeverity(gpsHealthStatus)}
          size="small"
          data-testid="patrol-pwa-gps-chip"
        />
        {gpsAccuracyMeters != null ? (
          <Chip label={`±${Math.round(gpsAccuracyMeters)}m accuracy`} size="small" variant="outlined" color="secondary" />
        ) : null}
        <Chip
          label={patrolId ? 'Active patrol' : 'No active patrol'}
          color={patrolId ? 'secondary' : 'default'}
          size="small"
        />
      </Stack>

      {currentLocation ? (
        <Box
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 2,
            p: 1.5,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.secondary.main, 0.08),
            border: '1px solid',
            borderColor: alpha(theme.palette.secondary.main, 0.16)
          })}
          data-testid="patrol-current-location"
        >
          <IconCurrentLocation size={18} color="#673ab7" />
          <Typography variant="body2">
            <strong>Current Location:</strong> {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
            {Number.isFinite(currentLocation.accuracy) ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (Accuracy: ±{Math.round(currentLocation.accuracy)}m)
              </Typography>
            ) : null}
          </Typography>
        </Box>
      ) : null}

      {!isOnline ? (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="patrol-offline-warning">
          You are offline. Patrol logs are saved locally and will sync when connectivity returns.
        </Alert>
      ) : null}

      {needsSyncAttention ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Some patrol logs require attention. Backend validation may be incomplete.
        </Alert>
      ) : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        <Typography variant="body2">Last saved location:</Typography>
        <Typography variant="body2" color="text.secondary">
          {formatTimestamp(lastSavedTimestamp)}
        </Typography>

        <Typography variant="body2">Local location logs:</Typography>
        <Typography variant="body2" color="text.secondary">
          {locationLogCount}
        </Typography>

        <Typography variant="body2">Pending sync queue:</Typography>
        <Typography variant="body2" color="text.secondary">
          {pendingQueueCount}
        </Typography>

        <Typography variant="body2">Failed sync queue:</Typography>
        <Typography variant="body2" color="text.secondary">
          {failedQueueCount}
        </Typography>

        <Typography variant="body2">Validation failed:</Typography>
        <Typography variant="body2" color="text.secondary">
          {validationFailedCount}
        </Typography>

        <Typography variant="body2">Sync conflicts:</Typography>
        <Typography variant="body2" color="text.secondary">
          {conflictCount}
        </Typography>

        <Typography variant="body2">Retries exhausted:</Typography>
        <Typography variant="body2" color="text.secondary">
          {exhaustedCount}
        </Typography>
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Push notification settings are managed in{' '}
        <Link component={RouterLink} to="/account/profile?tab=profile" color="secondary">
          Account Settings
        </Link>
        .
      </Typography>

      {errorText ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {errorText}
        </Alert>
      ) : null}
    </Paper>
  );
}
