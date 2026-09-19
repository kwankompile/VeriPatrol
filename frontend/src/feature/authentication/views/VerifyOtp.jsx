import { Link } from 'react-router-dom';

import useMediaQuery from '@mui/material/useMediaQuery';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import AuthWrapper1 from 'views/pages/authentication/AuthWrapper1';
import AuthCardWrapper from 'views/pages/authentication/AuthCardWrapper';
import Logo from 'ui-component/Logo';
import AuthFooter from 'ui-component/cards/AuthFooter';
import OtpVerificationForm from 'feature/authentication/components/OtpVerificationForm';
import useOtpController from 'feature/authentication/controllers/useOtpController';

export default function VerifyOtp() {
  const downMD = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const controller = useOtpController();

  return (
    <AuthWrapper1>
      <Stack sx={{ justifyContent: 'flex-end', minHeight: '100vh' }}>
        <Stack sx={{ justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 68px)' }}>
          <Box sx={{ m: { xs: 1, sm: 3 }, mb: 0 }}>
            <AuthCardWrapper>
              <Stack sx={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Box sx={{ mb: 3 }}>
                  <Link to="#" aria-label="logo">
                    <Logo />
                  </Link>
                </Box>
                <Stack sx={{ alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <Typography variant={downMD ? 'h3' : 'h2'} sx={{ color: 'secondary.main' }}>
                    Verify authentication code
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '16px', textAlign: { xs: 'center', md: 'inherit' } }}>
                    Enter the 6-digit code from your authenticator app
                  </Typography>
                </Stack>
                <Box sx={{ width: 1 }}>
                  <OtpVerificationForm
                    email={controller.email}
                    otp={controller.otp}
                    setOtp={controller.setOtp}
                    submitError={controller.submitError}
                    isSubmitting={controller.isSubmitting}
                    missingOtpContext={controller.missingOtpContext}
                    onSubmit={controller.handleSubmit}
                  />
                </Box>
              </Stack>
            </AuthCardWrapper>
          </Box>
        </Stack>
        <Box sx={{ px: 3, my: 3 }}>
          <AuthFooter />
        </Box>
      </Stack>
    </AuthWrapper1>
  );
}
