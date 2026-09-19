// CameraContactCard.jsx
import { Box, Typography, Divider, Stack } from '@mui/material';
import { IconPhone, IconMail, IconMapPin } from '@tabler/icons-react';
import InfoItem from './CameraInfoItem';
import { StyledPaper } from '../../styles/StyledPaper';

export default function CameraContactCard({ camera }) {
  return (
    <StyledPaper>
      <Typography variant="h3" sx={{ mb: 3, fontWeight: 600 }}>
        Contact Information
      </Typography>

      <Stack spacing={2.5}>
        <InfoItem icon={<IconPhone size={20} />} label="Phone Number" value={camera.phoneNum} />
        <InfoItem icon={<IconMail size={20} />} label="Email Address" value={camera.email} />
        <InfoItem icon={<IconMapPin size={20} />} label="Home Address" value={camera.homeAddress} />

        <Divider sx={{ my: 2 }} />

        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Last Modified:{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>
              {camera.lastModified}
            </Box>
          </Typography>
        </Box>
      </Stack>
    </StyledPaper>
  );
}
