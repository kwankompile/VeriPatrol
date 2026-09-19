import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormHelperText from '@mui/material/FormHelperText';
import { QRCodeSVG } from 'qrcode.react';

import AnimateButton from 'ui-component/extended/AnimateButton';
import OtpInput from './OtpInput';

export default function TwoFactorSetupCard({
  email,
  manualKey,
  otpauthUri,
  otp,
  setOtp,
  submitError,
  startError,
  isStarting,
  isSubmitting,
  missingSetupContext,
  setupReady,
  onSubmit
}) {
  if (missingSetupContext) {
    return (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Your two-factor setup session expired or was interrupted.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sign in again to continue account setup.
        </Typography>
      </Box>
    );
  }

  if (startError) {
    return (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          {startError}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sign in again to restart two-factor authentication setup.
        </Typography>
      </Box>
    );
  }

  if (isStarting || !setupReady) {
    return (
      <Typography variant="body2" color="text.secondary">
        Preparing authenticator setup...
      </Typography>
    );
  }

  return (
    <Box component="form" onSubmit={onSubmit}>
      {email ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Setting up two-factor authentication for {email}
        </Typography>
      ) : null}

      <Typography variant="body1" sx={{ mb: 1 }}>
        1. Scan this QR code with your authenticator app
      </Typography>
      {otpauthUri ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <QRCodeSVG value={otpauthUri} size={180} includeMargin />
        </Box>
      ) : null}

      <Typography variant="body1" sx={{ mb: 1 }}>
        2. Or enter this setup key manually
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontFamily: 'monospace',
          wordBreak: 'break-all',
          mb: 2,
          p: 1.5,
          bgcolor: 'grey.100',
          borderRadius: 1
        }}
      >
        {manualKey}
      </Typography>

      <Typography variant="body1" sx={{ mb: 1 }}>
        3. Enter the 6-digit code from your authenticator app
      </Typography>
      <OtpInput value={otp} onChange={setOtp} disabled={isSubmitting} error={Boolean(submitError)} />

      {submitError ? (
        <Box sx={{ mt: 1 }}>
          <FormHelperText error>{submitError}</FormHelperText>
        </Box>
      ) : null}

      <Box sx={{ mt: 2 }}>
        <AnimateButton>
          <Button color="secondary" disabled={isSubmitting} fullWidth size="large" type="submit" variant="contained">
            {isSubmitting ? 'Verifying...' : 'Enable two-factor authentication'}
          </Button>
        </AnimateButton>
      </Box>
    </Box>
  );
}
