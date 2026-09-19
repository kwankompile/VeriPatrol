import PropTypes from 'prop-types';
import { Grid, Paper, Typography } from '@mui/material';

function CountBox({ label, value }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700}>
        {value ?? 0}
      </Typography>
    </Paper>
  );
}

export default function CheckpointStatusSummary({ summary }) {
  if (!summary) {
    return null;
  }

  const total =
    (summary.verified_checkpoints ?? 0) +
    (summary.partial_checkpoints ?? 0) +
    (summary.needs_review_checkpoints ?? summary.uncertain_checkpoints ?? 0) +
    (summary.suspicious_checkpoints ?? 0) +
    (summary.missed_checkpoints ?? summary.rejected_checkpoints ?? 0) +
    (summary.pending_checkpoints ?? 0);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <CountBox label="Total" value={total} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <CountBox label="Verified" value={summary.verified_checkpoints} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <CountBox label="Partial" value={summary.partial_checkpoints} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <CountBox label="Needs review" value={summary.needs_review_checkpoints ?? summary.uncertain_checkpoints} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <CountBox label="Suspicious" value={summary.suspicious_checkpoints} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <CountBox label="Missed" value={summary.missed_checkpoints ?? summary.rejected_checkpoints} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <CountBox label="Pending" value={summary.pending_checkpoints} />
      </Grid>
    </Grid>
  );
}

CheckpointStatusSummary.propTypes = {
  summary: PropTypes.object
};
