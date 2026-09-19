import { Link } from 'react-router-dom';

import useMediaQuery from '@mui/material/useMediaQuery';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import AuthWrapper1 from 'views/pages/authentication/AuthWrapper1';
import AuthCardWrapper from 'views/pages/authentication/AuthCardWrapper';
import Logo from 'ui-component/Logo';
import AuthFooter from 'ui-component/cards/AuthFooter';
import PasswordSetupForm from 'feature/authentication/components/PasswordSetupForm';
import usePasswordSetupController from 'feature/authentication/controllers/usePasswordSetupController';

export default function FirstLoginSetup() {
  const downMD = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const controller = usePasswordSetupController();

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
                    Set your password
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '16px', textAlign: { xs: 'center', md: 'inherit' } }}>
                    Choose a permanent password to continue account setup
                  </Typography>
                </Stack>
                <Box sx={{ width: 1 }}>
                  <PasswordSetupForm
                    email={controller.email}
                    password={controller.password}
                    setPassword={controller.setPassword}
                    passwordConfirmation={controller.passwordConfirmation}
                    setPasswordConfirmation={controller.setPasswordConfirmation}
                    errors={controller.errors}
                    setErrors={controller.setErrors}
                    submitError={controller.submitError}
                    isSubmitting={controller.isSubmitting}
                    missingSetupContext={controller.missingSetupContext}
                    passwordMinLength={controller.passwordMinLength}
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
