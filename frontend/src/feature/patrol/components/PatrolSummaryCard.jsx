import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Grid,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import { resolveCheckpointStatus, getCheckpointStatusTooltip } from 'feature/patrol-monitoring/utils/patrolStatusUtils';
import {
  buildCheckpointCounts,
  buildOutcomeExplanation,
  buildOutcomeHeadline,
  countMovementReviewItems,
  derivePatrolOutcome,
  outcomeChipProps
} from '../utils/patrolSummaryUtils';

function formatDurationSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 60) return `${Math.round(value)}s`;
  const mins = Math.floor(value / 60);
  const secs = Math.round(value % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function confidenceChipProps(level) {
  const normalized = String(level ?? '').toLowerCase();
  if (normalized === 'high') return { label: 'High confidence', color: 'success' };
  if (normalized === 'medium') return { label: 'Medium confidence', color: 'warning' };
  return { label: 'Low confidence', color: 'error' };
}

function FinalizingProgress({ finalizingStep }) {
  if (!finalizingStep || finalizingStep === 'idle' || finalizingStep === 'completed') return null;

  const messages = {
    syncing: 'Syncing logs…',
    validating: 'Validating patrol…',
    loading_summary: 'Loading summary…',
    failed: 'Patrol finalization failed'
  };

  return (
    <Stack direction="row" spacing={1.5} alignItems="center" data-testid="patrol-finalizing-progress">
      {finalizingStep !== 'failed' ? <CircularProgress size={22} /> : null}
      <Typography variant="body2">{messages[finalizingStep] ?? 'Finalizing patrol…'}</Typography>
    </Stack>
  );
}

function CheckpointCountRow({ counts }) {
  const items = [
    { key: 'verified', label: 'Verified' },
    { key: 'partial', label: 'Partial' },
    { key: 'needs_review', label: 'Needs review' },
    { key: 'suspicious', label: 'Suspicious' },
    { key: 'missed', label: 'Missed' }
  ];

  return (
    <Stack direction="row" flexWrap="wrap" gap={1} data-testid="patrol-summary-checkpoint-counts">
      {items.map(({ key, label }) => {
        const chip = resolveCheckpointStatus(key);
        return (
          <Tooltip key={key} title={getCheckpointStatusTooltip(key)} arrow describeChild>
            <Chip size="small" label={`${label}: ${counts[key] ?? 0}`} color={chip.color} variant="outlined" />
          </Tooltip>
        );
      })}
      <Chip size="small" label={`Total: ${counts.total}`} variant="outlined" />
    </Stack>
  );
}

function TechnicalDetails({ summary, validationResult, counts }) {
  const [open, setOpen] = useState(false);
  const results = validationResult?.checkpoint_results ?? [];

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Typography variant="body2" color="text.secondary">
          Technical details
        </Typography>
        <IconButton size="small" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Toggle technical details">
          <ExpandMoreIcon sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Location logs
            </Typography>
            <Typography variant="body2">{summary?.total_location_logs ?? validationResult?.total_location_logs ?? '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="caption" color="text.secondary">
              GPS gaps
            </Typography>
            <Typography variant="body2">{summary?.total_gaps ?? validationResult?.total_gaps ?? '—'}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Longest gap
            </Typography>
            <Typography variant="body2">{formatDurationSeconds(summary?.longest_gap_seconds)}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Completion %
            </Typography>
            <Typography variant="body2">{summary?.completion_percentage ?? '—'}%</Typography>
          </Grid>
        </Grid>
        {results.length > 0 ? (
          <Stack spacing={1} sx={{ mt: 2 }}>
            {results.map((row) => {
              const chip = resolveCheckpointStatus(row.status);
              return (
                <Stack
                  key={row.checkpoint_id}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                  flexWrap="wrap"
                  gap={1}
                  sx={{ py: 0.75, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}
                >
                  <Typography variant="body2">{row.checkpoint_name ?? row.checkpoint_id}</Typography>
                  <Tooltip title={getCheckpointStatusTooltip(row.status)} arrow describeChild>
                    <Chip label={chip.label} color={chip.color} size="small" />
                  </Tooltip>
                </Stack>
              );
            })}
          </Stack>
        ) : null}
      </Collapse>
    </Box>
  );
}

export default function PatrolSummaryCard({
  summary,
  loading,
  error,
  summaryMayBeIncomplete = false,
  finalizingStep = 'idle',
  validatingPatrol = false,
  validationError = null,
  validationWarning = null,
  validationResult = null,
  offlineFinalizationPending = false,
  onFinalizeOnline = null,
  finalizeOnlineDisabled = false
}) {
  const showFinalizing = finalizingStep && finalizingStep !== 'idle' && finalizingStep !== 'completed';

  const counts = useMemo(() => buildCheckpointCounts(summary, validationResult), [summary, validationResult]);
  const outcome = useMemo(() => derivePatrolOutcome(summary, validationResult), [summary, validationResult]);
  const outcomeChip = outcomeChipProps(outcome);
  const headline = buildOutcomeHeadline(outcome);
  const explanation = buildOutcomeExplanation({ outcome, counts, summary, validationResult });
  const movementReview = countMovementReviewItems(validationResult);
  const routeGaps = Number(validationResult?.total_gaps ?? summary?.total_gaps ?? 0);
  const confidenceChip = confidenceChipProps(summary?.confidence_level);
  const isPositiveOutcome = outcome === 'verified';

  if (showFinalizing && !summary && !loading) {
    return (
      <Paper sx={{ p: 2 }} data-testid="patrol-summary-card">
        <FinalizingProgress finalizingStep={finalizingStep} />
        {validationWarning ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {validationWarning}
          </Alert>
        ) : null}
        {validationError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {validationError}
          </Alert>
        ) : null}
      </Paper>
    );
  }

  if (loading) {
    return (
      <Paper sx={{ p: 2 }} data-testid="patrol-summary-card">
        <Stack spacing={2}>
          {summaryMayBeIncomplete ? (
            <Alert severity="warning">Some offline logs may not have synced yet. Summary may be incomplete.</Alert>
          ) : null}
          <FinalizingProgress finalizingStep={finalizingStep} />
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={22} />
            <Typography variant="body2">Loading patrol summary…</Typography>
          </Stack>
        </Stack>
      </Paper>
    );
  }

  if (error) {
    return (
      <Stack spacing={2} data-testid="patrol-summary-card">
        {validationWarning ? <Alert severity="warning">{validationWarning}</Alert> : null}
        {validationError ? <Alert severity="error">{validationError}</Alert> : null}
        <Alert severity="error">{error}</Alert>
      </Stack>
    );
  }

  if (!summary && !validationResult) {
    if (!validationWarning && !validationError && !offlineFinalizationPending) return null;

    return (
      <Paper sx={{ p: 2 }} data-testid="patrol-summary-card">
        <Stack spacing={2}>
          {validationWarning ? <Alert severity="warning">{validationWarning}</Alert> : null}
          {validationError ? <Alert severity="error">{validationError}</Alert> : null}
          {offlineFinalizationPending ? (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Server validation is pending. When you are back online, finalize this patrol to sync logs and load the summary.
              </Typography>
              <Button
                variant="contained"
                color="secondary"
                onClick={onFinalizeOnline}
                disabled={finalizeOnlineDisabled}
                data-testid="patrol-finalize-online-button"
              >
                Finalize patrol online
              </Button>
            </Box>
          ) : null}
        </Stack>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }} data-testid="patrol-summary-card">
      <Stack spacing={2}>
        {summaryMayBeIncomplete ? (
          <Alert severity="warning">Some offline logs may not have synced yet. Summary may be incomplete.</Alert>
        ) : null}

        {validationWarning ? <Alert severity="warning">{validationWarning}</Alert> : null}
        {validationError ? <Alert severity="error">{validationError}</Alert> : null}

        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Patrol result
            </Typography>
            <Typography variant="h5" data-testid="patrol-summary-headline">
              {headline}
            </Typography>
          </Box>
          <Chip label={outcomeChip.label} color={outcomeChip.color} data-testid="patrol-summary-outcome-chip" />
        </Stack>

        {isPositiveOutcome ? (
          <Alert severity="success" icon={<CheckCircleOutlineIcon />} data-testid="patrol-summary-positive-feedback">
            Great work — checkpoint evidence and route quality look strong for this session.
          </Alert>
        ) : null}

        <Typography variant="body1" color="text.secondary" data-testid="patrol-summary-explanation">
          {explanation}
        </Typography>

        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Checkpoint completion
          </Typography>
          <CheckpointCountRow counts={counts} />
        </Box>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Route quality
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {summary?.confidence_level ? <Chip size="small" label={confidenceChip.label} color={confidenceChip.color} /> : null}
              {summary?.confidence_score != null ? (
                <Chip size="small" variant="outlined" label={`Score: ${summary.confidence_score}/100`} />
              ) : null}
              {routeGaps > 0 ? <Chip size="small" variant="outlined" color="warning" label={`${routeGaps} GPS gap(s)`} /> : null}
              {movementReview > 0 ? (
                <Chip size="small" variant="outlined" color="warning" label={`${movementReview} movement review item(s)`} />
              ) : null}
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="subtitle2" gutterBottom>
              Sync result
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {summaryMayBeIncomplete || validationWarning
                ? 'Summary may be incomplete until all logs sync and validation completes.'
                : validationError
                  ? 'Validation reported errors — review details below.'
                  : 'Logs synced and validation processed.'}
            </Typography>
          </Grid>
        </Grid>

        {(validatingPatrol || finalizingStep === 'validating') && !validationResult ? (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Running server-side validation…
            </Typography>
          </Stack>
        ) : null}

        <TechnicalDetails summary={summary} validationResult={validationResult} counts={counts} />
      </Stack>
    </Paper>
  );
}
