import { Box, Divider, Stack, Typography } from '@mui/material';
import { IconPhone, IconMail, IconMapPin } from '@tabler/icons-react';

import InfoItem from './UserInfoItem';
import { StyledPaper } from '../../styles/StyledPaper';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';

export function UserContactCard({ user, isMobile }) {
  return (
    <StyledPaper>
      <Typography variant="h3" sx={{ mb: 3, fontWeight: 600 }}>
        Contact Information
      </Typography>

      <Stack spacing={2.5}>
        <InfoItem icon={<IconPhone size={20} />} label="Phone Number" value={user.phone || '—'} isMobile={isMobile} />
        <InfoItem icon={<IconMail size={20} />} label="Email Address" value={user.email || '—'} isMobile={isMobile} />
        <InfoItem icon={<IconMapPin size={20} />} label="Home Address" value={user.address || '—'} isMobile={isMobile} />
      </Stack>

      <Divider sx={{ my: 3 }} />

      <Typography variant="h4" sx={{ mb: 2, fontWeight: 600 }}>
        Account Activity
      </Typography>

      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem' }}>
            Created
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            <MalaysiaTime time={user.created_at} fallback="—" />
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem' }}>
            Last Modified
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            <MalaysiaTime time={user.updated_at} fallback="—" />
          </Typography>
        </Box>
        <Box>
          <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.75rem' }}>
            Email Verified
          </Typography>
          <Typography variant="body1" sx={{ fontWeight: 500 }}>
            {user.email_verified_at ? <MalaysiaTime time={user.email_verified_at} /> : 'Not verified'}
          </Typography>
        </Box>
      </Stack>
    </StyledPaper>
  );
}
