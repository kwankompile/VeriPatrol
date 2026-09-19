import { Box, Avatar, Divider, Chip, Typography, Stack } from '@mui/material';
import { IconShieldCheck } from '@tabler/icons-react';
import { StyledPaper } from '../../styles/StyledPaper';

export default function CameraProfileCard({ camera }) {
  return (
    <StyledPaper>
      <Stack spacing={3} alignItems="center">
        <Avatar
          src={camera.profilePicture}
          alt={camera.name}
          sx={{
            width: 140,
            height: 140,
            border: '5px solid',
            borderColor: 'secondary.main'
          }}
        />

        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h2" sx={{ fontWeight: 600 }}>
            {camera.name}
          </Typography>

          <Chip label={camera.role} icon={<IconShieldCheck size={18} />} color="secondary" sx={{ mt: 1, mb: 2, fontWeight: 600 }} />

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" color="text.secondary">
            Camera ID:{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>
              {camera.id}
            </Box>
          </Typography>
        </Box>
      </Stack>
    </StyledPaper>
  );
}
