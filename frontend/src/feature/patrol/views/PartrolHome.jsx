import { useEffect, useMemo, useRef, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import { IconPlayerPlay, IconPlayerStop, IconShieldCheck } from '@tabler/icons-react';

import { PatrolRepository } from '../repositories/patrolRepository';
import { usePatrolController } from '../controllers/usePatrolController';
import patrolService from '../datasources/patrolService';
import { PatrolTracking } from '../components/PatrolTracking';
import PatrolPwaStatusPanel from '../components/PatrolPwaStatusPanel';
import PatrolSummaryCard from '../components/PatrolSummaryCard';
import PatrolStopConfirmDialog from '../components/PatrolStopConfirmDialog';
import { SelectFieldContainer } from 'ui-component/SelectFieldContainer';
import {
  gpsHealthLabel,
  gpsHealthSeverity,
  isPoorGpsAccuracy,
  POOR_GPS_ACCURACY_THRESHOLD_METERS
} from '../utils/patrolGpsUtils';
import { useNetworkStatus } from 'pwa/useNetworkStatus';

const FINALIZING_LABELS = {
  syncing: 'Syncing logs…',
  validating: 'Validating patrol…',
  loading_summary: 'Loading summary…',
  failed: 'Finalization failed'
};

export default function PatrolHome() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new PatrolRepository(patrolService);
  }
  const controller = usePatrolController(repositoryRef.current);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [poorGpsDialogOpen, setPoorGpsDialogOpen] = useState(false);
  const isOnline = useNetworkStatus();

  const isPatrolActive = controller.cpNumber > 0;

  useEffect(() => {
    if (isPatrolActive) {
      controller.stopPrePatrolLocationDetection?.();
      return undefined;
    }
    controller.warmUpCurrentLocation?.();
    return () => controller.stopPrePatrolLocationDetection?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- warm-up tied to patrol active state only
  }, [isPatrolActive]);

  const patrolCurrentLocation = useMemo(() => {
    const pos = controller.currentPosition;
    if (!pos?.coords) return null;
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy
    };
  }, [controller.currentPosition]);

  const patrolId = controller.patrols?.data?.id ?? null;
  const showPatrolSummary =
    controller.offlineFinalizationPending ||
    controller.patrolSummaryLoading ||
    controller.patrolSummary ||
    controller.patrolSummaryError ||
    controller.validationResult ||
    controller.validationError ||
    controller.validationWarning ||
    (controller.finalizingStep && controller.finalizingStep !== 'idle');

  const stopPatrolDisabled = controller.isFinalizingPatrol || controller.patrolLoading || controller.offlineFinalizationPending;
  const finalizeOnlineDisabled = controller.patrolLoading || controller.isFinalizingPatrol || !isOnline;
  const finalizingLabel = FINALIZING_LABELS[controller.finalizingStep];

  const handleConfirmStop = async () => {
    setStopDialogOpen(false);
    await controller.completePatrol();
  };

  const handleStartPatrolClick = () => {
    if (isPoorGpsAccuracy(controller.gpsAccuracyMeters)) {
      setPoorGpsDialogOpen(true);
      return;
    }
    controller.handleStartPatrol();
  };

  const handleStartAnyway = () => {
    setPoorGpsDialogOpen(false);
    controller.handleStartPatrol();
  };

  const poorGpsAccuracyRounded =
    controller.gpsAccuracyMeters != null ? Math.round(controller.gpsAccuracyMeters) : null;

  return (
    <Stack spacing={2} data-testid="patrol-home">
      {!isPatrolActive ? (
        <Paper
          elevation={0}
          sx={(theme) => ({
            p: { xs: 2, sm: 3 },
            borderRadius: 3,
            border: '1px solid',
            borderColor: alpha(theme.palette.secondary.main, 0.16),
            background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.light, 0.5)} 0%, ${theme.palette.background.paper} 60%)`
          })}
          data-testid="patrol-start-panel"
        >
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={(theme) => ({
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  color: theme.palette.secondary.contrastText,
                  bgcolor: theme.palette.secondary.main,
                  boxShadow: `0 6px 16px ${alpha(theme.palette.secondary.main, 0.4)}`
                })}
              >
                <IconShieldCheck size={24} />
              </Box>
              <Box>
                <Typography variant="h5">Start patrol</Typography>
                <Typography variant="body2" color="text.secondary">
                  Select your zone and begin recording your route.
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={1} data-testid="patrol-pre-start-gps">
              <Chip
                label={gpsHealthLabel(controller.gpsHealthStatus)}
                color={gpsHealthSeverity(controller.gpsHealthStatus)}
                size="small"
                data-testid="patrol-pre-start-gps-chip"
              />
              {controller.gpsAccuracyMeters != null ? (
                <Chip
                  label={`±${Math.round(controller.gpsAccuracyMeters)}m accuracy`}
                  size="small"
                  variant="outlined"
                  color={isPoorGpsAccuracy(controller.gpsAccuracyMeters) ? 'warning' : 'secondary'}
                  data-testid="patrol-pre-start-accuracy-chip"
                />
              ) : null}
            </Stack>

            <SelectFieldContainer
              label="Patrol zone"
              name="zone"
              value={controller.formData.zone_id}
              onChange={controller.handleChange('zone_id')}
              error={!!controller.errors.zone_id}
              helperText={controller.errors.zone_id || 'Choose the zone you are covering for this shift.'}
              options={controller.zoneOptions}
              placeholder="Select a zone"
            />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                color="secondary"
                onClick={handleStartPatrolClick}
                disabled={controller.patrolLoading || !controller.formData.zone_id || controller.offlineFinalizationPending}
                startIcon={controller.patrolLoading ? <CircularProgress size={18} /> : <IconPlayerPlay size={18} />}
                data-testid="patrol-start-button"
              >
                {controller.patrolLoading ? 'Starting…' : 'Start patrol'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      ) : (
        <Paper
          elevation={0}
          sx={(theme) => ({
            p: { xs: 2, sm: 3 },
            borderRadius: 3,
            border: '1px solid',
            borderColor: alpha(theme.palette.secondary.main, 0.16),
            background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.light, 0.5)} 0%, ${theme.palette.background.paper} 60%)`
          })}
          data-testid="patrol-active-panel"
        >
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
              <Box>
                <Typography variant="h5">Patrol recording</Typography>
                <Typography variant="body2" color="text.secondary">
                  Your route and checkpoints are being recorded. Keep the app open for best GPS continuity.
                </Typography>
              </Box>
              <Chip label="Recording" color="secondary" size="small" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, fontWeight: 600 }} />
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" rowGap={1}>
              <Chip
                label={gpsHealthLabel(controller.gpsHealthStatus)}
                color={gpsHealthSeverity(controller.gpsHealthStatus)}
                size="small"
                data-testid="patrol-gps-health-chip"
              />
              {controller.gpsAccuracyMeters != null ? (
                <Chip
                  label={`±${Math.round(controller.gpsAccuracyMeters)}m accuracy`}
                  size="small"
                  variant="outlined"
                  color="secondary"
                />
              ) : null}
            </Stack>

            <PatrolTracking
              checkpointLogs={controller.checkpointLogs}
              progress={controller.progress}
              completedCount={controller.completedCount}
              totalCount={controller.totalCount}
              currentLocation={patrolCurrentLocation}
              trackingActive={controller.patrolTrackingActive && Boolean(patrolCurrentLocation)}
            />

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setStopDialogOpen(true)}
                disabled={stopPatrolDisabled}
                startIcon={stopPatrolDisabled ? <CircularProgress size={18} color="inherit" /> : <IconPlayerStop size={18} />}
                data-testid="patrol-stop-button"
              >
                {finalizingLabel ?? 'Stop patrol'}
              </Button>
            </Box>
          </Stack>
        </Paper>
      )}

      <PatrolPwaStatusPanel
        patrolId={patrolId}
        trackingActive={controller.patrolTrackingActive}
        gpsHealthStatus={controller.gpsHealthStatus}
        gpsAccuracyMeters={controller.gpsAccuracyMeters}
        currentLocation={patrolCurrentLocation}
      />

      {showPatrolSummary ? (
        <PatrolSummaryCard
          summary={controller.patrolSummary}
          loading={controller.patrolSummaryLoading}
          error={controller.patrolSummaryError}
          summaryMayBeIncomplete={controller.summaryMayBeIncomplete}
          finalizingStep={controller.finalizingStep}
          validatingPatrol={controller.validatingPatrol}
          validationError={controller.validationError}
          validationWarning={controller.validationWarning}
          validationResult={controller.validationResult}
          offlineFinalizationPending={controller.offlineFinalizationPending}
          onFinalizeOnline={controller.finalizePatrolOnline}
          finalizeOnlineDisabled={finalizeOnlineDisabled}
        />
      ) : null}

      <PatrolStopConfirmDialog
        open={stopDialogOpen}
        onClose={() => setStopDialogOpen(false)}
        onConfirm={handleConfirmStop}
        disabled={stopPatrolDisabled}
      />

      <Dialog
        open={poorGpsDialogOpen}
        onClose={() => setPoorGpsDialogOpen(false)}
        aria-labelledby="poor-gps-dialog-title"
        data-testid="poor-gps-dialog"
      >
        <DialogTitle id="poor-gps-dialog-title">Poor GPS accuracy</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {poorGpsAccuracyRounded != null
              ? `Current GPS accuracy is ${poorGpsAccuracyRounded}m. For reliable checkpoint validation, move to an open area and wait for a better GPS signal.`
              : 'GPS accuracy is currently poor. For reliable checkpoint validation, move to an open area and wait for a better GPS signal.'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Accuracy above {POOR_GPS_ACCURACY_THRESHOLD_METERS}m may reduce checkpoint validation confidence.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPoorGpsDialogOpen(false)} data-testid="poor-gps-wait-button">
            Wait for better GPS
          </Button>
          <Button variant="contained" color="warning" onClick={handleStartAnyway} data-testid="poor-gps-start-anyway-button">
            Start anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
