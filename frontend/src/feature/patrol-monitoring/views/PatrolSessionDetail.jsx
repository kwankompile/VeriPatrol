import { useCallback, useRef, useState } from 'react';

import { usePatrolReplayController } from '../controllers/usePatrolReplayController';
import PatrolReplayControls from '../components/PatrolReplayControls';
import { isReplaySessionAllowed } from '../utils/patrolReplayUtils';
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
  Grid,
  IconButton,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

import MainCard from 'ui-component/cards/MainCard';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';

import patrolMonitoringService from '../datasources/patrolMonitoringService';
import { PatrolMonitoringRepository } from '../repositories/patrolMonitoringRepository';
import { usePatrolSessionDetailController } from '../controllers/usePatrolSessionDetailController';
import PatrolStatusChip from '../components/PatrolStatusChip';
import PatrolConfidenceCard from '../components/PatrolConfidenceCard';
import PatrolRouteMap from '../components/PatrolRouteMap';
import PatrolAnomalyList from '../components/PatrolAnomalyList';
import MapLegend, { MAP_LEGEND_HELP_TOOLTIP } from '../components/MapLegend';
import PatrolRealtimeSnackbar from '../components/PatrolRealtimeSnackbar';

function SessionSummaryStrip({ session, summary, patrolSessionId }) {
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Guard
        </Typography>
        <Typography variant="body2" fontWeight={600}>
          {session?.user?.name ?? '—'}
        </Typography>
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Zone
        </Typography>
        <Typography variant="body2" fontWeight={600}>
          {session?.zone?.name ?? '—'}
        </Typography>
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Status
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          <PatrolStatusChip kind="patrol" value={session?.status} />
        </Box>
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Started
        </Typography>
        <Typography variant="body2">
          <MalaysiaTime time={session?.started_at} />
        </Typography>
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Ended
        </Typography>
        <Typography variant="body2">
          <MalaysiaTime time={session?.ended_at} />
        </Typography>
      </Grid>
      <Grid size={{ xs: 12, sm: 4, md: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Session
        </Typography>
        <Typography variant="caption" sx={{ wordBreak: 'break-all', display: 'block' }}>
          {patrolSessionId}
        </Typography>
      </Grid>
      {summary?.confidence_level ? (
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Confidence
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <PatrolStatusChip kind="confidence" value={summary.confidence_level} />
          </Box>
        </Grid>
      ) : null}
      {summary?.completion_percentage != null ? (
        <Grid size={{ xs: 6, sm: 4, md: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Completion
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {summary.completion_percentage}%
          </Typography>
        </Grid>
      ) : null}
    </Grid>
  );
}

export default function PatrolSessionDetail() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new PatrolMonitoringRepository(patrolMonitoringService);
  }
  const controller = usePatrolSessionDetailController(repositoryRef.current);
  const replayEnabled = isReplaySessionAllowed(controller.session?.status);
  const replay = usePatrolReplayController({
    patrolRoutes: controller.patrolRoutes,
    anomalies: controller.anomalies,
    checkpointEvents: controller.checkpointEvents,
    replayEnabled
  });

  const [mapLegendOpen, setMapLegendOpen] = useState(false);
  const [movementReviewOpen, setMovementReviewOpen] = useState(false);
  const [legendStats, setLegendStats] = useState({ gapCount: 0, anomalyCount: 0 });

  const handleLegendStatsChange = useCallback((stats) => {
    setLegendStats(stats);
  }, []);

  const showMovementReviewLink = controller.anomalies.length > 0 || Boolean(controller.validationResult);

  if (controller.loading) {
    return (
      <MainCard title="Patrol session review">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      </MainCard>
    );
  }

  if (controller.error) {
    return (
      <MainCard title="Patrol session review">
        <Alert severity="error" sx={{ mb: 2 }}>
          {controller.error}
        </Alert>
        <Button variant="outlined" onClick={controller.handleBack}>
          Back to list
        </Button>
      </MainCard>
    );
  }

  const session = controller.session;

  return (
    <MainCard
      title="Patrol session review"
      secondary={
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={controller.handleBack}>
            Back
          </Button>
          <Button variant="contained" onClick={controller.handleReRunValidation} disabled={controller.validating}>
            {controller.validating ? 'Validating…' : 'Re-run Validation'}
          </Button>
        </Stack>
      }
    >
      <PatrolRealtimeSnackbar />
      <Stack spacing={2} data-testid="patrol-session-detail">
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip
            size="small"
            label={
              controller.isConnected
                ? 'Live updates'
                : controller.isRealtimeEnabled
                  ? `Polling (${controller.connectionState})`
                  : 'Polling only'
            }
            color={controller.isConnected ? 'success' : 'default'}
            variant="outlined"
          />
        </Stack>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <SessionSummaryStrip session={session} summary={controller.summary} patrolSessionId={controller.patrolSessionId} />
        </Paper>

        {controller.validationMessage ? <Alert severity="success">{controller.validationMessage}</Alert> : null}
        {controller.validationError ? <Alert severity="error">{controller.validationError}</Alert> : null}

        <PatrolReplayControls
          replayEnabled={replayEnabled}
          canReplay={replay.canReplay}
          hasEnoughPoints={replay.hasEnoughPoints}
          routeCount={replay.routeCount}
          currentIndex={replay.currentIndex}
          isPlaying={replay.isPlaying}
          replayProgress={replay.replayProgress}
          replayTime={replay.replayTime}
          currentRoutePoint={replay.currentRoutePoint}
          speedMultiplier={replay.speedMultiplier}
          replayFinished={replay.replayFinished}
          currentSegmentAnomaly={replay.currentSegmentAnomaly}
          onPlay={replay.play}
          onPause={replay.pause}
          onStop={replay.stop}
          onSeek={replay.seek}
          onSpeedChange={replay.setSpeedMultiplier}
        />

        <Box>
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
            <Typography variant="h6">Patrol route</Typography>
            <Tooltip title={MAP_LEGEND_HELP_TOOLTIP} arrow describeChild>
              <IconButton
                size="small"
                aria-label="Open map legend"
                onClick={() => setMapLegendOpen(true)}
                data-testid="map-legend-info-button"
              >
                <InfoOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={MAP_LEGEND_HELP_TOOLTIP} arrow describeChild>
              <Link
                component="button"
                type="button"
                variant="body2"
                onClick={() => setMapLegendOpen(true)}
                sx={{ ml: 0.5 }}
                data-testid="map-legend-more-details-link"
              >
                Map legend
              </Link>
            </Tooltip>
          </Stack>
          <PatrolRouteMap
            routes={controller.patrolRoutes}
            checkpointEvents={controller.checkpointEvents}
            anomalies={controller.anomalies}
            selectedAnomaly={controller.selectedAnomaly}
            showAnomalies={controller.showAnomalies}
            replayPoint={replay.currentRoutePoint}
            replayActive={replay.replayActive}
            replayProgressIndex={replay.currentIndex}
            highlightedCheckpointIds={replay.passedCheckpointIds}
            loading={controller.routesLoading}
            error={controller.routesError}
            onLargeGapDetected={controller.handleLargeGapDetected}
            onLegendStatsChange={handleLegendStatsChange}
          />
        </Box>

        {showMovementReviewLink ? (
          <Box>
            <Link
              component="button"
              type="button"
              variant="body2"
              onClick={() => setMovementReviewOpen(true)}
              data-testid="movement-review-link"
            >
              Movement review
            </Link>
          </Box>
        ) : null}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}>
            <PatrolConfidenceCard summary={controller.summary} loading={controller.summaryLoading} />
            {controller.summaryError ? <Alert severity="warning" sx={{ mt: 1 }}>{controller.summaryError}</Alert> : null}
            {controller.validationResult ? (
              <Alert severity="info" sx={{ mt: 1 }}>
                Validation: {controller.validationResult.total_segments ?? 0} segments, {controller.validationResult.total_gaps ?? 0} route
                gaps, {controller.validationResult.checkpoint_results?.length ?? 0} checkpoint results.
              </Alert>
            ) : null}
          </Grid>
        </Grid>

        <Box>
          <Typography variant="h6" gutterBottom>
            Checkpoint events
          </Typography>
          {controller.eventsLoading ? (
            <Box sx={{ py: 2, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Checkpoint</TableCell>
                    <TableCell>Detection</TableCell>
                    <TableCell align="center">Confidence</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Detected</TableCell>
                    <TableCell>Processed</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {controller.checkpointEvents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                          No checkpoint events for this patrol.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    controller.checkpointEvents.map((event) => (
                      <TableRow key={event.id} hover>
                        <TableCell>{event.checkpoint?.name ?? event.checkpoint_id}</TableCell>
                        <TableCell>{event.detection_type ?? '—'}</TableCell>
                        <TableCell align="center">{event.confidence_score != null ? `${event.confidence_score}%` : '—'}</TableCell>
                        <TableCell>
                          <PatrolStatusChip kind="checkpoint" value={event.status} />
                        </TableCell>
                        <TableCell>
                          <MalaysiaTime time={event.detected_at} />
                        </TableCell>
                        <TableCell>
                          <MalaysiaTime time={event.processed_at} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Stack>

      <Dialog
        open={mapLegendOpen}
        onClose={() => setMapLegendOpen(false)}
        aria-labelledby="map-legend-dialog-title"
        fullWidth
        maxWidth="sm"
        data-testid="map-legend-dialog"
      >
        <DialogTitle id="map-legend-dialog-title">Map legend</DialogTitle>
        <DialogContent>
          <MapLegend gapCount={legendStats.gapCount} anomalyCount={legendStats.anomalyCount} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMapLegendOpen(false)} data-testid="map-legend-dialog-close">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={movementReviewOpen}
        onClose={() => setMovementReviewOpen(false)}
        aria-labelledby="movement-review-dialog-title"
        fullWidth
        maxWidth="sm"
        data-testid="movement-review-dialog"
      >
        <DialogTitle id="movement-review-dialog-title">Movement review</DialogTitle>
        <DialogContent>
          <PatrolAnomalyList
            anomalies={controller.anomalies}
            selectedAnomalyId={controller.selectedAnomaly?.id ?? null}
            showAnomalies={controller.showAnomalies}
            onSelectAnomaly={controller.setSelectedAnomaly}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMovementReviewOpen(false)} data-testid="movement-review-dialog-close">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </MainCard>
  );
}
