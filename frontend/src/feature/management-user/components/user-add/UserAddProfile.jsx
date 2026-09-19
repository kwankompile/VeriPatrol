import { Box, Typography, alpha, styled, useTheme, Avatar, IconButton, Tooltip, Paper, Fade } from '@mui/material';
import { Camera, UserPlus } from 'lucide-react';

const ProfilePicture = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  borderRadius: 20,
  background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.05)} 100%, ${alpha(theme.palette.secondary.light, 0.02)} 100%)`,
  border: `1px solid ${alpha(theme.palette.secondary.main, 0.1)}`,
  textAlign: 'center',
  marginBottom: theme.spacing(4),
  transition: 'all 0.3s ease'
}));

const StyledAvatar = styled(Avatar)(({ theme }) => ({
  width: 140,
  height: 140,
  margin: '0 auto',
  border: `4px solid ${theme.palette.background.paper}`,
  boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.12)}`,
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    transform: 'scale(1.05)',
    boxShadow: `0 12px 48px ${alpha(theme.palette.common.black, 0.18)}`
  }
}));

const CameraButton = styled(IconButton)(({ theme }) => ({
  position: 'absolute',
  bottom: 0,
  right: '50%',
  transform: 'translateX(50px)',
  backgroundColor: theme.palette.secondary.main,
  color: theme.palette.common.white,
  boxShadow: `0 4px 12px ${alpha(theme.palette.secondary.main, 0.4)}`,
  '&:hover': {
    backgroundColor: theme.palette.secondary.dark,
    transform: 'translateX(50px) scale(1.1)',
    boxShadow: `0 6px 20px ${alpha(theme.palette.secondary.main, 0.6)}`
  },
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}));

export function UserAddProfile({ controller }) {
  const theme = useTheme();

  return (
    <>
      <Fade in timeout={600}>
        <ProfilePicture elevation={0}>
          <Box sx={{ position: 'relative', display: 'inline-block' }}>
            <StyledAvatar
              src={controller.previewUrl}
              alt="New User"
              sx={{
                bgcolor: !controller.previewUrl ? theme.palette.secondary.main : 'transparent'
              }}
            >
              {!controller.previewUrl && <UserPlus size={60} />}
            </StyledAvatar>

            <input
              ref={controller.fileInputRef}
              type="file"
              accept="image/*"
              onChange={controller.handleImageUpload}
              style={{ display: 'none' }}
            />

            <Tooltip title="Upload Photo" arrow>
              <CameraButton size="medium" onClick={() => controller.fileInputRef.current?.click()}>
                <Camera size={20} />
              </CameraButton>
            </Tooltip>
          </Box>

          <Typography variant="h6" sx={{ mt: 2, fontWeight: 600 }}>
            {controller.formData.name || 'New User'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Click the camera icon to upload a profile photo
          </Typography>
        </ProfilePicture>
      </Fade>
    </>
  );
}
