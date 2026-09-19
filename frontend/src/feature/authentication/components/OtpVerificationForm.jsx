import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import FormHelperText from '@mui/material/FormHelperText';

import AnimateButton from 'ui-component/extended/AnimateButton';
import OtpInput from './OtpInput';

export default function OtpVerificationForm({
  email,
  otp,
  setOtp,
  submitError,
  isSubmitting,
  missingOtpContext,
  onSubmit
}) {
  if (missingOtpContext) {
    return (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Your sign-in verification session expired or was interrupted.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sign in again with your email and password to continue.
        </Typography>
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={onSubmit}>
      {email ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Enter the authentication code for {email}
        </Typography>
      ) : null}

      <OtpInput value={otp} onChange={setOtp} disabled={isSubmitting} error={Boolean(submitError)} id="login-otp-input" />

      {submitError ? (
        <Box sx={{ mt: 1 }}>
          <FormHelperText error>{submitError}</FormHelperText>
        </Box>
      ) : null}

      <Box sx={{ mt: 2 }}>
        <AnimateButton>
          <Button color="secondary" disabled={isSubmitting} fullWidth size="large" type="submit" variant="contained">
            {isSubmitting ? 'Verifying...' : 'Verify and sign in'}
          </Button>
        </AnimateButton>
      </Box>
    </Box>
  );
}
