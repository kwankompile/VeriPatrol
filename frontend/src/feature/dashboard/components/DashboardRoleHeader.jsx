import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { IconClockHour4, IconRefresh } from '@tabler/icons-react';

import { formatLastUpdated, roleWelcomeSubtitle, roleWelcomeTitle } from '../utils/dashboardFormatters';

export default function DashboardRoleHeader({ role, lastUpdatedAt, timezone, onRefresh, refreshing = false }) {
  const lastUpdatedLabel = formatLastUpdated(lastUpdatedAt, timezone);

  return (
    <Box
      data-testid="dashboard-role-header"
      sx={(theme) => ({
        p: { xs: 2.5, sm: 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(theme.palette.secondary.main, 0.22),
        background: `linear-gradient(120deg, ${alpha(theme.palette.secondary.main, 0.18)} 0%, ${alpha(
          theme.palette.secondary.dark,
          0.1
        )} 55%, ${alpha(theme.palette.background.paper, 0)} 100%)`,
        backgroundColor: 'background.paper'
      })}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
      >
        <Stack spacing={0.75} sx={{ minWidth: 0 }}>
          <Typography variant="h2" sx={{ fontWeight: 700 }}>
            {roleWelcomeTitle(role)}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {roleWelcomeSubtitle(role)}
          </Typography>
        </Stack>

        <Stack spacing={1} alignItems={{ xs: 'flex-start', md: 'flex-end' }}>
          {lastUpdatedLabel ? (
            <Chip
              size="small"
              variant="outlined"
              color="secondary"
              icon={<IconClockHour4 size={15} />}
              label={`Last updated ${lastUpdatedLabel}`}
              data-testid="dashboard-last-updated"
            />
          ) : null}
          {onRefresh ? (
            <Button
              size="small"
              variant="outlined"
              color="secondary"
              startIcon={<IconRefresh size={16} />}
              onClick={onRefresh}
              disabled={refreshing}
              data-testid="dashboard-refresh-button"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  );
}

DashboardRoleHeader.propTypes = {
  role: PropTypes.string,
  lastUpdatedAt: PropTypes.string,
  timezone: PropTypes.string,
  onRefresh: PropTypes.func,
  refreshing: PropTypes.bool
};
