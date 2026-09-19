import { Stack, Typography } from '@mui/material';

import { formatRoleName, formatTwoFactorStatus } from '../utils/profileFormatters';

/**
 * @param {{ profile: import('../repositories/ProfileRepository').NormalizedProfileUser | null }} props
 */
export default function ProfileFoundationCard({ profile }) {
  if (!profile) {
    return null;
  }

  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        <strong>Name:</strong> {profile.name}
      </Typography>
      <Typography variant="body2">
        <strong>Email:</strong> {profile.email}
      </Typography>
      <Typography variant="body2">
        <strong>Role:</strong> {formatRoleName(profile.roleName)}
      </Typography>
      <Typography variant="body2">
        <strong>2FA:</strong> {formatTwoFactorStatus(profile.twoFactorEnabled)}
      </Typography>
      <Typography variant="body2">
        <strong>Profile version:</strong> {profile.profileVersion}
      </Typography>
    </Stack>
  );
}
