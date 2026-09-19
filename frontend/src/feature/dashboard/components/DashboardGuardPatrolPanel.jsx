import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { IconPlayerPlay, IconArrowRight, IconClipboardCheck } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

import { guardTodayStatusColor, guardTodayStatusLabel } from '../utils/dashboardFormatters';

function resolveCta(hasActivePatrol, todayStatus) {
  if (hasActivePatrol) {
    return { label: 'Resume Patrol', icon: <IconArrowRight size={18} />, variant: 'contained' };
  }
  if (todayStatus === 'completed') {
    return { label: 'View Summary', icon: <IconClipboardCheck size={18} />, variant: 'outlined' };
  }
  return { label: 'Start Patrol', icon: <IconPlayerPlay size={18} />, variant: 'contained' };
}

export default function DashboardGuardPatrolPanel({ hasActivePatrol, todayStatus, todayCount = 0, readinessMessage = null }) {
  const navigate = useNavigate();
  const cta = resolveCta(hasActivePatrol, todayStatus);

  return (
    <Stack spacing={2} data-testid="dashboard-guard-patrol-panel">
      <Box
        sx={(theme) => {
          const tone = theme.palette[guardTodayStatusColor(todayStatus)] ?? theme.palette.grey;
          const main = tone.main ?? theme.palette.grey[500];
          return {
            p: 2,
            borderRadius: 2,
            border: '1px solid',
            borderColor: alpha(main, 0.35),
            bgcolor: alpha(main, 0.08)
          };
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Today&apos;s patrol status
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700 }}>
              {guardTodayStatusLabel(todayStatus)}
            </Typography>
          </Stack>
          <Chip
            size="small"
            color={guardTodayStatusColor(todayStatus)}
            label={`${todayCount} session${todayCount === 1 ? '' : 's'} today`}
          />
        </Stack>
      </Box>

      <Button
        fullWidth
        size="large"
        color="secondary"
        variant={cta.variant}
        startIcon={cta.icon}
        onClick={() => navigate('/patrol')}
        data-testid="dashboard-guard-patrol-cta"
      >
        {cta.label}
      </Button>

      {readinessMessage ? (
        <Typography variant="body2" color="text.secondary">
          {readinessMessage}
        </Typography>
      ) : null}
    </Stack>
  );
}

DashboardGuardPatrolPanel.propTypes = {
  hasActivePatrol: PropTypes.bool,
  todayStatus: PropTypes.string,
  todayCount: PropTypes.number,
  readinessMessage: PropTypes.string
};
