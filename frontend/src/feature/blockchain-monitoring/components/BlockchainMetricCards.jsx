import PropTypes from 'prop-types';
import { Grid, Paper, Typography } from '@mui/material';

function MetricCard({ label, value, highlight }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} color={highlight ? 'error.main' : 'text.primary'}>
        {value}
      </Typography>
    </Paper>
  );
}

MetricCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  highlight: PropTypes.bool
};

export default function BlockchainMetricCards({ summary }) {
  const data = summary ?? {
    total: 0,
    inFlight: 0,
    submitted: 0,
    confirmed: 0,
    failed: 0
  };

  const networkLabel = data.primaryNetwork
    ? `${data.primaryNetwork}${data.primaryEnvironment ? ` (${data.primaryEnvironment})` : ''}`
    : '—';

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <MetricCard label="Total records" value={data.total} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <MetricCard label="Pending / queued / processing" value={data.inFlight ?? 0} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <MetricCard label="Submitted" value={data.submitted} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <MetricCard label="Confirmed" value={data.confirmed} />
      </Grid>
      <Grid size={{ xs: 6, sm: 4, md: 2 }}>
        <MetricCard label="Failed" value={data.failed} highlight={data.failed > 0} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 2 }}>
        <MetricCard label="Primary network" value={networkLabel} />
      </Grid>
    </Grid>
  );
}

BlockchainMetricCards.propTypes = {
  summary: PropTypes.shape({
    total: PropTypes.number,
    inFlight: PropTypes.number,
    submitted: PropTypes.number,
    confirmed: PropTypes.number,
    failed: PropTypes.number,
    primaryNetwork: PropTypes.string,
    primaryEnvironment: PropTypes.string
  })
};
