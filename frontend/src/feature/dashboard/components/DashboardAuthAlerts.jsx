import PropTypes from 'prop-types';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { IconShieldLock } from '@tabler/icons-react';

import ContentEmptyState from 'ui-component/state/ContentEmptyState';
import { authSeverityMeta, formatAuthEventLabel, formatDashboardTimestamp } from '../utils/dashboardFormatters';

function maskEmail(email) {
  if (!email || email === '—') return 'Unknown account';
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${name.length > 2 ? '•••' : ''}@${domain}`;
}

export default function DashboardAuthAlerts({ alerts, timezone }) {
  if (!alerts?.length) {
    return (
      <ContentEmptyState
        title="No recent auth alerts"
        message="Failed login and OTP attempts from the last 24 hours appear here."
        testId="dashboard-auth-alerts-empty"
      />
    );
  }

  return (
    <Stack spacing={1} data-testid="dashboard-auth-alerts">
      {alerts.map((alert) => {
        const severity = authSeverityMeta(alert.severity);
        return (
          <Stack
            key={alert.id}
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
          >
            <Box sx={(theme) => ({ color: theme.palette[severity.color]?.main ?? theme.palette.text.secondary, display: 'inline-flex' })}>
              <IconShieldLock size={20} />
            </Box>
            <Box sx={{ minWidth: 0, flexGrow: 1 }}>
              <Typography variant="subtitle2" noWrap>
                {formatAuthEventLabel(alert.eventType)}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {maskEmail(alert.email)} · {formatDashboardTimestamp(alert.occurredAt, timezone)}
              </Typography>
            </Box>
            <Chip size="small" color={severity.color} label={severity.label} />
          </Stack>
        );
      })}
    </Stack>
  );
}

DashboardAuthAlerts.propTypes = {
  alerts: PropTypes.array,
  timezone: PropTypes.string
};
