import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Grid, Paper, Skeleton, Stack, Typography } from '@mui/material';

const TONE_PALETTE = {
  primary: 'primary',
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'info',
  secondary: 'secondary'
};

function resolveTone(tone, highlight) {
  if (highlight) return 'warning';
  return TONE_PALETTE[tone] ? tone : 'secondary';
}

export default function DashboardMetricCard({ label, value, hint = null, icon = null, tone = 'secondary', highlight = false, testId }) {
  const paletteKey = resolveTone(tone, highlight);

  return (
    <Paper
      data-testid={testId}
      elevation={0}
      sx={(theme) => ({
        position: 'relative',
        overflow: 'hidden',
        p: 2.5,
        height: '100%',
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(theme.palette[paletteKey].main, 0.22),
        background: `linear-gradient(135deg, ${alpha(theme.palette[paletteKey].main, 0.1)} 0%, ${alpha(
          theme.palette.background.paper,
          0
        )} 60%)`,
        backgroundColor: 'background.paper',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: `0 12px 28px ${alpha(theme.palette[paletteKey].main, 0.18)}`
        }
      })}
    >
      <Box
        aria-hidden
        sx={(theme) => ({
          position: 'absolute',
          insetInlineStart: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: theme.palette[paletteKey].main
        })}
      />
      <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
        <Stack spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
          <Typography variant="h2" sx={{ fontWeight: 700, lineHeight: 1.1 }}>
            {value}
          </Typography>
          {hint ? (
            <Typography variant="caption" color="text.secondary">
              {hint}
            </Typography>
          ) : null}
        </Stack>
        {icon ? (
          <Box
            sx={(theme) => ({
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 2,
              color: theme.palette[paletteKey].main,
              bgcolor: alpha(theme.palette[paletteKey].main, 0.14)
            })}
          >
            {icon}
          </Box>
        ) : null}
      </Stack>
    </Paper>
  );
}

DashboardMetricCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  hint: PropTypes.string,
  icon: PropTypes.node,
  tone: PropTypes.string,
  highlight: PropTypes.bool,
  testId: PropTypes.string
};

export function DashboardMetricsSkeleton({ count = 4 }) {
  return (
    <Box data-testid="dashboard-metrics-skeleton">
      <Grid container spacing={2}>
        {Array.from({ length: count }).map((_, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
              <Stack spacing={1}>
                <Skeleton variant="text" width="60%" />
                <Skeleton variant="rectangular" height={34} sx={{ borderRadius: 1 }} />
                <Skeleton variant="text" width="40%" />
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}

DashboardMetricsSkeleton.propTypes = {
  count: PropTypes.number
};
