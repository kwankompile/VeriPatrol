import { useEffect, useState } from 'react';
import { Avatar, Box, Chip, Divider, Stack, Typography } from '@mui/material';
import { IconShieldCheck } from '@tabler/icons-react';

import { resolveProfilePictureUrl } from 'utils/getImageUrl';
import { StyledPaper } from '../../styles/StyledPaper';

const ROLE_CHIP_COLOR = {
  Admin: 'error',
  'Security Operator': 'warning',
  Guard: 'info'
};

function profileInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

export function UserProfileCard({ user, isMobile }) {
  const roleName = user.role?.name ?? 'Unknown role';
  const roleColor = ROLE_CHIP_COLOR[roleName] ?? 'default';
  const isDeleted = Boolean(user.deleted_at);
  const resolvedAvatarUrl = resolveProfilePictureUrl(user.profile_picture_url);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [resolvedAvatarUrl]);

  const avatarSrc = !avatarLoadFailed && resolvedAvatarUrl ? resolvedAvatarUrl : undefined;

  return (
    <StyledPaper>
      <Stack spacing={3} alignItems="center">
        <Avatar
          src={avatarSrc}
          alt={user.name}
          imgProps={{ onError: () => setAvatarLoadFailed(true) }}
          sx={{
            width: isMobile ? 96 : 128,
            height: isMobile ? 96 : 128,
            border: '4px solid',
            borderColor: 'secondary.main',
            fontSize: isMobile ? '2rem' : '2.5rem',
            fontWeight: 600
          }}
        >
          {profileInitials(user.name)}
        </Avatar>

        <Box sx={{ textAlign: 'center', width: '100%' }}>
          <Typography variant="h2" sx={{ fontWeight: 600, mb: 1 }}>
            {user.name}
          </Typography>

          <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
            <Chip label={roleName} icon={<IconShieldCheck size={18} />} color={roleColor} sx={{ fontWeight: 600 }} />
            <Chip
              label={isDeleted ? 'Deleted' : 'Active'}
              color={isDeleted ? 'default' : 'success'}
              variant={isDeleted ? 'outlined' : 'filled'}
              size="small"
            />
          </Stack>

          <Divider sx={{ my: 2.5 }} />

          <Typography variant="body2" color="text.secondary">
            User ID
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 500, wordBreak: 'break-all' }}>
            {user.id}
          </Typography>
        </Box>
      </Stack>
    </StyledPaper>
  );
}
