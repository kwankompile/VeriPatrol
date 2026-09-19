import { useState, useRef } from 'react';
import {
  Grid,
  TextField,
  MenuItem,
  Box,
  Typography,
  alpha,
  styled,
  useTheme,
  Avatar,
  IconButton,
  Tooltip,
  Paper,
  Fade,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button
} from '@mui/material';
import { Camera as CameraIcon, Phone, Mail, MapPin, ShieldCheck, X } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'Administrator', label: 'Administrator', icon: '👨‍💼' },
  { value: 'Operator', label: 'Operator', icon: '⚙️' },
  { value: 'Guard', label: 'Guard', icon: '🛡️' }
];

const StyledTextField = styled(TextField)(({ theme }) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 12,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    backgroundColor: theme.palette.background.paper,
    '&:hover': {
      backgroundColor: alpha(theme.palette.primary.main, 0.02),
      transform: 'translateY(-1px)',
      boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.08)}`,
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.primary.main,
        borderWidth: 2
      }
    },
    '&.Mui-focused': {
      backgroundColor: alpha(theme.palette.primary.main, 0.04),
      transform: 'translateY(-1px)',
      boxShadow: `0 4px 16px ${alpha(theme.palette.primary.main, 0.12)}`,
      '& .MuiOutlinedInput-notchedOutline': {
        borderColor: theme.palette.primary.main,
        borderWidth: 2
      }
    }
  },
  '& .MuiInputLabel-root': {
    fontWeight: 500,
    '&.Mui-focused': {
      fontWeight: 600,
      color: theme.palette.primary.main
    }
  },
  '& .MuiOutlinedInput-input': {
    padding: '16px 14px'
  }
}));

const FieldContainer = styled(Box)(({ theme }) => ({
  position: 'relative',
  marginBottom: theme.spacing(2.5),
  '& .field-icon': {
    position: 'absolute',
    top: '50%',
    right: 14,
    transform: 'translateY(-50%)',
    color: theme.palette.text.secondary,
    pointerEvents: 'none',
    zIndex: 1,
    opacity: 0.5,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  },
  '&:hover .field-icon': {
    opacity: 1,
    color: theme.palette.primary.main,
    transform: 'translateY(-50%) scale(1.1)'
  }
}));

const ProfilePictureSection = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  borderRadius: 20,
  background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.primary.light, 0.02)} 100%)`,
  border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
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
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.common.white,
  boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.4)}`,
  '&:hover': {
    backgroundColor: theme.palette.primary.dark,
    transform: 'translateX(50px) scale(1.1)',
    boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.6)}`
  },
  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
}));

const SectionHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1.5),
  marginBottom: theme.spacing(2.5),
  marginTop: theme.spacing(3)
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  letterSpacing: 1.2,
  fontSize: '0.85rem',
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text'
}));

const Divider = styled(Box)(({ theme }) => ({
  flex: 1,
  height: 2,
  background: `linear-gradient(90deg, ${alpha(theme.palette.primary.main, 0.1)}, ${alpha(theme.palette.primary.main, 0.3)}, ${alpha(theme.palette.primary.main, 0.1)})`,
  borderRadius: 2
}));

export const CameraFormFields = () => {
  const theme = useTheme();
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    name: 'John Doe',
    role: 'Administrator',
    phoneNum: '+1 (555) 123-4567',
    email: 'john.doe@example.com',
    homeAddress: '123 Main Street\nApartment 4B\nNew York, NY 10001',
    profilePicture: null
  });
  const [errors] = useState({});
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleChange = (field) => (event) => {
    setFormData({ ...formData, [field]: event.target.value });
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result);
        setFormData({ ...formData, profilePicture: file });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setPreviewUrl(null);
    setFormData({ ...formData, profilePicture: null });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setShowSuccessModal(true);
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Paper
        elevation={0}
        sx={{
          p: 4,
          borderRadius: 4,
          background: theme.palette.background.paper,
          boxShadow: `0 8px 32px ${alpha(theme.palette.common.black, 0.08)}`
        }}
      >
        <Typography
          variant="h4"
          sx={{
            mb: 4,
            fontWeight: 700,
            background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.light} 100%)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}
        >
          Edit Camera Profile
        </Typography>

        <Box component="div" onSubmit={handleSubmit}>
          {/* Profile Picture Section */}
          <Fade in timeout={600}>
            <ProfilePictureSection elevation={0}>
              <Box sx={{ position: 'relative', display: 'inline-block' }}>
                <StyledAvatar
                  src={previewUrl}
                  alt={formData.name}
                  sx={{
                    bgcolor: !previewUrl ? theme.palette.primary.main : 'transparent'
                  }}
                >
                  {!previewUrl && <CameraIcon size={60} />}
                </StyledAvatar>

                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />

                <Tooltip title="Upload Photo" arrow>
                  <CameraButton size="medium" onClick={() => fileInputRef.current?.click()}>
                    <CameraIcon size={20} />
                  </CameraButton>
                </Tooltip>

                {previewUrl && (
                  <Tooltip title="Remove Photo" arrow>
                    <IconButton
                      size="small"
                      onClick={handleRemoveImage}
                      sx={{
                        position: 'absolute',
                        top: 0,
                        right: '50%',
                        transform: 'translateX(-50px)',
                        bgcolor: 'error.main',
                        color: 'white',
                        '&:hover': {
                          bgcolor: 'error.dark',
                          transform: 'translateX(-50px) scale(1.1)'
                        }
                      }}
                    >
                      <X size={16} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>

              <Typography variant="h6" sx={{ mt: 2, fontWeight: 600 }}>
                {formData.name || 'Camera Profile'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Click the camera icon to upload a new photo
              </Typography>
            </ProfilePictureSection>
          </Fade>

          <Grid container spacing={3}>
            {/* Personal Information */}
            <Grid item xs={12} md={6}>
              <Fade in timeout={800}>
                <Box>
                  <SectionHeader>
                    <CameraIcon size={20} color={theme.palette.primary.main} />
                    <SectionTitle variant="overline">Personal Information</SectionTitle>
                    <Divider />
                  </SectionHeader>

                  <FieldContainer>
                    <StyledTextField
                      fullWidth
                      label="Full Name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange('name')}
                      error={!!errors.name}
                      helperText={errors.name}
                      required
                      placeholder="Enter full name"
                    />
                    <Box className="field-icon">
                      <CameraIcon size={20} />
                    </Box>
                  </FieldContainer>
                </Box>
              </Fade>
            </Grid>

            {/* Role & Permissions */}
            <Grid item xs={12} md={6}>
              <Fade in timeout={900}>
                <Box>
                  <SectionHeader>
                    <ShieldCheck size={20} color={theme.palette.primary.main} />
                    <SectionTitle variant="overline">Role & Permissions</SectionTitle>
                    <Divider />
                  </SectionHeader>

                  <FieldContainer>
                    <StyledTextField
                      fullWidth
                      select
                      label="Camera Role"
                      name="role"
                      value={formData.role}
                      onChange={handleChange('role')}
                      error={!!errors.role}
                      helperText={errors.role || 'Select the appropriate role'}
                      required
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <MenuItem
                          key={option.value}
                          value={option.value}
                          sx={{
                            py: 1.5,
                            px: 2,
                            borderRadius: 1,
                            mx: 1,
                            my: 0.5,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              backgroundColor: alpha(theme.palette.primary.main, 0.08),
                              transform: 'translateX(4px)'
                            },
                            '&.Mui-selected': {
                              backgroundColor: alpha(theme.palette.primary.main, 0.12),
                              fontWeight: 600
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{ fontSize: '1.25rem' }}>{option.icon}</Box>
                            <Typography variant="body1">{option.label}</Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </StyledTextField>
                    <Box className="field-icon">
                      <ShieldCheck size={20} />
                    </Box>
                  </FieldContainer>
                </Box>
              </Fade>
            </Grid>

            {/* Contact Details */}
            <Grid item xs={12}>
              <Fade in timeout={1000}>
                <Box>
                  <SectionHeader>
                    <Mail size={20} color={theme.palette.primary.main} />
                    <SectionTitle variant="overline">Contact Details</SectionTitle>
                    <Divider />
                  </SectionHeader>
                </Box>
              </Fade>
            </Grid>

            <Grid item xs={12} md={6}>
              <Fade in timeout={1100}>
                <Box>
                  <FieldContainer>
                    <StyledTextField
                      fullWidth
                      label="Phone Number"
                      name="phoneNum"
                      value={formData.phoneNum}
                      onChange={handleChange('phoneNum')}
                      error={!!errors.phoneNum}
                      helperText={errors.phoneNum}
                      required
                      placeholder="+1 (555) 000-0000"
                    />
                    <Box className="field-icon">
                      <Phone size={20} />
                    </Box>
                  </FieldContainer>

                  <FieldContainer>
                    <StyledTextField
                      fullWidth
                      label="Email Address"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange('email')}
                      error={!!errors.email}
                      helperText={errors.email}
                      required
                      placeholder="camera@example.com"
                    />
                    <Box className="field-icon">
                      <Mail size={20} />
                    </Box>
                  </FieldContainer>
                </Box>
              </Fade>
            </Grid>

            <Grid item xs={12} md={6}>
              <Fade in timeout={1200}>
                <FieldContainer>
                  <StyledTextField
                    fullWidth
                    label="Home Address"
                    name="homeAddress"
                    value={formData.homeAddress}
                    onChange={handleChange('homeAddress')}
                    error={!!errors.homeAddress}
                    helperText={errors.homeAddress}
                    required
                    multiline
                    rows={4}
                    placeholder="Enter complete home address"
                  />
                  <Box className="field-icon" sx={{ top: '24px !important' }}>
                    <MapPin size={20} />
                  </Box>
                </FieldContainer>
              </Fade>
            </Grid>

            {/* Action Buttons */}
            <Grid item xs={12}>
              <Fade in timeout={1300}>
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
                  <Button
                    variant="outlined"
                    size="large"
                    sx={{
                      borderRadius: 2,
                      px: 4,
                      textTransform: 'none',
                      fontWeight: 600
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    variant="contained"
                    size="large"
                    disabled={loading}
                    sx={{
                      borderRadius: 2,
                      px: 4,
                      textTransform: 'none',
                      fontWeight: 600,
                      background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
                      boxShadow: `0 4px 12px ${alpha(theme.palette.primary.main, 0.4)}`,
                      '&:hover': {
                        boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.6)}`,
                        transform: 'translateY(-2px)'
                      }
                    }}
                  >
                    {loading ? <CircularProgress size={24} /> : 'Update Camera'}
                  </Button>
                </Box>
              </Fade>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      {/* Success Dialog */}
      <Dialog
        open={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        PaperProps={{
          sx: {
            borderRadius: 3,
            minWidth: 400
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 600 }}>Success!</DialogTitle>
        <DialogContent>
          <DialogContentText>Camera profile updated successfully!</DialogContentText>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setShowSuccessModal(false)} variant="contained" sx={{ borderRadius: 2 }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
