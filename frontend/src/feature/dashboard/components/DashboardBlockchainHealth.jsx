import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Chip, Grid, Stack, Typography } from '@mui/material';
import { IconCircleCheck, IconClockPause, IconAlertTriangle } from '@tabler/icons-react';

const STAT_META = [
  { key: 'confirmed', label: 'Confirmed', tone: 'success', icon: IconCircleCheck },
  { key: 'inFlight', label: 'In flight', tone: 'secondary', icon: IconClockPause },
  { key: 'failed', label: 'Failed', tone: 'error', icon: IconAlertTriangle }
];

function StatTile({ label, value, tone, Icon }) {
  return (
    <Box
      sx={(theme) => ({
        p: 1.5,
        borderRadius: 2,
        height: '100%',
        border: '1px solid',
        borderColor: alpha(theme.palette[tone].main, 0.25),
        bgcolor: alpha(theme.palette[tone].main, 0.08)
      })}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={(theme) => ({ color: theme.palette[tone].main, display: 'inline-flex' })}>
          <Icon size={18} />
        </Box>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Stack>
      <Typography variant="h3" sx={{ mt: 0.5, fontWeight: 700 }}>
        {value}
      </Typography>
    </Box>
  );
}

StatTile.propTypes = {
  label: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  tone: PropTypes.string,
  Icon: PropTypes.elementType
};

export default function DashboardBlockchainHealth({ blockchain }) {
  const data = blockchain ?? {};

  return (
    <Stack spacing={2} data-testid="dashboard-blockchain-health">
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          size="small"
          color={data.enabled ? 'success' : 'default'}
          variant={data.enabled ? 'filled' : 'outlined'}
          label={data.enabled ? 'Anchoring enabled' : 'Anchoring disabled'}
        />
        {data.network ? <Chip size="small" variant="outlined" label={`Network: ${data.network}`} /> : null}
      </Stack>

      <Grid container spacing={1.5}>
        {STAT_META.map((meta) => (
          <Grid key={meta.key} size={4}>
            <StatTile label={meta.label} value={data[meta.key] ?? 0} tone={meta.tone} Icon={meta.icon} />
          </Grid>
        ))}
      </Grid>
    </Stack>
  );
}

DashboardBlockchainHealth.propTypes = {
  blockchain: PropTypes.object
};
