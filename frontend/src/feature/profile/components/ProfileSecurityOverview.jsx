import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Grid, Stack, Typography } from '@mui/material';
import { IconClockShield, IconKey, IconShieldCheck, IconShieldLock } from '@tabler/icons-react';

import SettingsCard from './settings/SettingsCard';
import StatusPill from './settings/StatusPill';
import { formatDateTime, formatTwoFactorStatus } from '../utils/profileFormatters';

function OverviewTile({ icon, label, value, pill }) {
  return (
    <Box
      sx={(theme) => ({
        height: '100%',
        p: 2,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.secondary.main, 0.14),
        bgcolor: alpha(theme.palette.secondary.main, 0.03)
      })}
    >
      <Stack spacing={1.25} sx={{ height: '100%' }}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Box
            aria-hidden
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 2,
              color: theme.palette.secondary.main,
              bgcolor: alpha(theme.palette.secondary.main, 0.12)
            })}
          >
            {icon}
          </Box>
          {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
        </Stack>
        <Stack spacing={0.25}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
            {value}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}

OverviewTile.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string,
  value: PropTypes.node,
  pill: PropTypes.shape({ label: PropTypes.string, tone: PropTypes.string })
};

/**
 * @param {{ profile: import('../repositories/ProfileRepository').NormalizedProfileUser | null }} props
 */
export default function ProfileSecurityOverview({ profile }) {
  const twoFactorEnabled = profile?.twoFactorEnabled === true;
  const passwordChanged = profile?.lastPasswordChangedAt ?? null;
  const securityChanged = profile?.lastSecurityChangedAt ?? null;

  return (
    <SettingsCard
      title="Security Overview"
      subtitle="A snapshot of your account protection"
      icon={<IconShieldCheck size={20} />}
    >
      <Grid container spacing={2} data-testid="profile-security-overview">
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <OverviewTile
            icon={<IconShieldLock size={18} />}
            label="Two-factor authentication"
            value={formatTwoFactorStatus(profile?.twoFactorEnabled)}
            pill={
              twoFactorEnabled ? { label: 'Enabled', tone: 'active' } : { label: 'Disabled', tone: 'warning' }
            }
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <OverviewTile
            icon={<IconKey size={18} />}
            label="Password last changed"
            value={formatDateTime(passwordChanged)}
            pill={passwordChanged ? { label: 'Set', tone: 'active' } : { label: 'Unknown', tone: 'neutral' }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <OverviewTile
            icon={<IconClockShield size={18} />}
            label="Recent security activity"
            value={formatDateTime(securityChanged)}
            pill={securityChanged ? { label: 'Tracked', tone: 'active' } : { label: 'None', tone: 'neutral' }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <OverviewTile
            icon={<IconShieldCheck size={18} />}
            label="Active sessions"
            value="Reviewed below"
            pill={{ label: 'Managed', tone: 'active' }}
          />
        </Grid>
      </Grid>
    </SettingsCard>
  );
}

ProfileSecurityOverview.propTypes = {
  profile: PropTypes.object
};
