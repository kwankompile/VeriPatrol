import PropTypes from 'prop-types';
import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import PatrolStatusChip from './PatrolStatusChip';

function StatItem({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}

function formatGap(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 60) return `${Math.round(value)}s`;
  const mins = Math.floor(value / 60);
  const secs = Math.round(value % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function PatrolConfidenceCard({ summary, loading }) {
  if (loading) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Loading patrol summary…
        </Typography>
      </Paper>
    );
  }

  if (!summary) {
    return (
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Summary not available for this patrol session.
        </Typography>
      </Paper>
    );
  }

  const needsReview = summary.needs_review_checkpoints ?? summary.uncertain_checkpoints ?? 0;
  const missed = summary.missed_checkpoints ?? summary.rejected_checkpoints ?? 0;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="h6">Patrol summary</Typography>
          <PatrolStatusChip kind="confidence" value={summary.confidence_level} />
        </Stack>

        <Box>
          <Typography variant="caption" color="text.secondary">
            Confidence score
          </Typography>
          <Typography variant="h4" fontWeight={700}>
            {summary.confidence_score ?? '—'}
            <Typography component="span" variant="h6" color="text.secondary">
              {' '}
              / 100
            </Typography>
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Based on checkpoint evidence, GPS quality, and route review signals. Needs-review items are not proof of
            misconduct.
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="Completion" value={`${summary.completion_percentage ?? 0}%`} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="Location logs" value={summary.total_location_logs ?? 0} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="GPS gaps" value={summary.total_gaps ?? 0} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="Longest gap" value={formatGap(summary.longest_gap_seconds)} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="Verified" value={summary.verified_checkpoints ?? 0} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="Partial" value={summary.partial_checkpoints ?? 0} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="Needs review" value={needsReview} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="Suspicious" value={summary.suspicious_checkpoints ?? 0} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4, md: 3 }}>
            <StatItem label="Missed" value={missed} />
          </Grid>
        </Grid>
      </Stack>
    </Paper>
  );
}

PatrolConfidenceCard.propTypes = {
  summary: PropTypes.object,
  loading: PropTypes.bool
};
