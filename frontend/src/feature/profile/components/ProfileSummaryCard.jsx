import { useState } from 'react';

import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Avatar, Box, Chip, Grid, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { IconBriefcase, IconClockEdit, IconMail, IconPencil, IconShieldCheck, IconUserCircle } from '@tabler/icons-react';

import SettingsCard from './settings/SettingsCard';
import StatusPill from './settings/StatusPill';
import {
  formatDateTime,
  formatEmailVerificationStatus,
  formatOrFallback,
  formatRoleName,
  formatTwoFactorStatus,
  getProfileInitials,
  resolveAccountStatus
} from '../utils/profileFormatters';

function MetaItem({ icon, label, value }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start">
      <Box
        aria-hidden
        sx={(theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          borderRadius: 2,
          flexShrink: 0,
          color: theme.palette.secondary.main,
          bgcolor: alpha(theme.palette.secondary.main, 0.1)
        })}
      >
        {icon}
      </Box>
      <Stack spacing={0.1} sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
          {value}
        </Typography>
      </Stack>
    </Stack>
  );
}

MetaItem.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.string,
  value: PropTypes.node
};

/**
 * @param {{ profile: import('../repositories/ProfileRepository').NormalizedProfileUser, onEditPicture?: () => void }} props
 */
export default function ProfileSummaryCard({ profile, onEditPicture }) {
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const emailVerified = Boolean(profile.emailVerifiedAt);
  const emailVerificationLabel = formatEmailVerificationStatus(profile.emailVerifiedAt);
  const avatarSrc = avatarLoadFailed || !profile.profilePictureUrl ? undefined : profile.profilePictureUrl;
  const accountStatus = resolveAccountStatus(profile);
  const roleLabel = formatRoleName(profile.roleName);

  return (
    <SettingsCard title="Profile Summary" subtitle="Your identity and account context" icon={<IconUserCircle size={20} />}>
      <Stack spacing={3}>
        <Box
          sx={(theme) => ({
            p: { xs: 2, sm: 2.5 },
            borderRadius: 3,
            border: '1px solid',
            borderColor: alpha(theme.palette.secondary.main, 0.16),
            background: `linear-gradient(120deg, ${alpha(theme.palette.secondary.main, 0.16)} 0%, ${alpha(
              theme.palette.secondary.main,
              0.04
            )} 60%, ${alpha(theme.palette.background.paper, 0)} 100%)`
          })}
        >
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 'auto' }}>
              <Box sx={{ position: 'relative', width: 84, height: 84 }}>
                <Avatar
                  src={avatarSrc}
                  alt={profile.name}
                  sx={(theme) => ({
                    width: 84,
                    height: 84,
                    fontSize: '1.6rem',
                    fontWeight: 600,
                    color: theme.palette.secondary.main,
                    bgcolor: alpha(theme.palette.secondary.main, 0.16),
                    border: '3px solid',
                    borderColor: theme.palette.background.paper,
                    boxShadow: `0 4px 16px ${alpha(theme.palette.secondary.main, 0.28)}`
                  })}
                  imgProps={{
                    onError: () => {
                      setAvatarLoadFailed(true);
                    }
                  }}
                >
                  {getProfileInitials(profile.name)}
                </Avatar>
                {onEditPicture ? (
                  <Tooltip title="Change profile picture">
                    <IconButton
                      onClick={onEditPicture}
                      aria-label="Edit profile picture"
                      data-testid="profile-avatar-edit"
                      size="small"
                      sx={(theme) => ({
                        position: 'absolute',
                        right: -4,
                        bottom: -4,
                        width: 30,
                        height: 30,
                        color: theme.palette.secondary.contrastText,
                        bgcolor: theme.palette.secondary.main,
                        border: '2px solid',
                        borderColor: theme.palette.background.paper,
                        boxShadow: `0 2px 8px ${alpha(theme.palette.secondary.main, 0.4)}`,
                        ':hover': { bgcolor: theme.palette.secondary.dark }
                      })}
                    >
                      <IconPencil size={15} />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </Box>
            </Grid>
            <Grid size={{ xs: 12, sm: true }}>
              <Stack spacing={1}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="h3" sx={{ fontWeight: 700 }}>
                    {formatOrFallback(profile.name, 'Unnamed user')}
                  </Typography>
                  <StatusPill label={accountStatus.label} tone={accountStatus.tone} testId="profile-account-status" />
                </Stack>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: 'text.secondary', minWidth: 0 }}>
                  <IconMail size={16} />
                  <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                    {profile.email}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Chip
                    size="small"
                    icon={<IconBriefcase size={15} />}
                    label={roleLabel}
                    color="secondary"
                    variant="filled"
                    sx={{ fontWeight: 600 }}
                  />
                  <Chip
                    size="small"
                    icon={<IconShieldCheck size={15} />}
                    label={`2FA: ${formatTwoFactorStatus(profile.twoFactorEnabled)}`}
                    color={profile.twoFactorEnabled ? 'secondary' : 'warning'}
                    variant="outlined"
                  />
                  <Chip
                    size="small"
                    label={`Email: ${emailVerificationLabel}`}
                    color={emailVerified ? 'secondary' : 'warning'}
                    variant="outlined"
                  />
                  <Chip size="small" label={`Version ${profile.profileVersion}`} variant="outlined" />
                </Stack>
              </Stack>
            </Grid>
          </Grid>
        </Box>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <MetaItem icon={<IconBriefcase size={18} />} label="Role / department" value={roleLabel} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <MetaItem icon={<IconClockEdit size={18} />} label="Last profile update" value={formatDateTime(profile.updatedAt)} />
          </Grid>
        </Grid>
      </Stack>
    </SettingsCard>
  );
}
