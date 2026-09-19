import { Link } from 'react-router-dom';

import useMediaQuery from '@mui/material/useMediaQuery';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import AuthWrapper1 from 'views/pages/authentication/AuthWrapper1';
import AuthCardWrapper from 'views/pages/authentication/AuthCardWrapper';
import Logo from 'ui-component/Logo';
import AuthFooter from 'ui-component/cards/AuthFooter';
import TwoFactorSetupCard from 'feature/authentication/components/TwoFactorSetupCard';
import useTwoFactorSetupController from 'feature/authentication/controllers/useTwoFactorSetupController';

export default function SetupTwoFactor() {
  const downMD = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const controller = useTwoFactorSetupController();

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
                    Set up two-factor authentication
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '16px', textAlign: { xs: 'center', md: 'inherit' } }}>
                    Use an authenticator app to secure your account
                  </Typography>
                </Stack>
                <Box sx={{ width: 1 }}>
                  <TwoFactorSetupCard
                    email={controller.email}
                    manualKey={controller.manualKey}
                    otpauthUri={controller.otpauthUri}
                    otp={controller.otp}
                    setOtp={controller.setOtp}
                    submitError={controller.submitError}
                    startError={controller.startError}
                    isStarting={controller.isStarting}
                    isSubmitting={controller.isSubmitting}
                    missingSetupContext={controller.missingSetupContext}
                    setupReady={controller.setupReady}
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
