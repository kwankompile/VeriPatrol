import Button from '@mui/material/Button';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

import AnimateButton from 'ui-component/extended/AnimateButton';
import CustomFormControl from 'ui-component/extended/Form/CustomFormControl';
import { strengthColor, strengthIndicator } from 'utils/password-strength';

import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

export default function PasswordSetupForm({
  email,
  password,
  setPassword,
  passwordConfirmation,
  setPasswordConfirmation,
  errors,
  setErrors,
  submitError,
  isSubmitting,
  missingSetupContext,
  passwordMinLength,
  onSubmit
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const strength = strengthIndicator(password);
  const strengthMeta = strengthColor(strength);

  if (missingSetupContext) {
    return (
      <Box>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Your password setup session expired or was interrupted.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Sign in again with your temporary password to continue first-login setup.
        </Typography>
      </Box>
    );
  }

  return (
    <Box component="form" onSubmit={onSubmit}>
      {email ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Setting password for {email}
        </Typography>
      ) : null}

      <CustomFormControl fullWidth error={Boolean(errors.password)}>
        <InputLabel htmlFor="password-setup-password">New password</InputLabel>
        <OutlinedInput
          id="password-setup-password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (errors.password) {
              setErrors((prev) => ({ ...prev, password: undefined }));
            }
          }}
          endAdornment={
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle password visibility"
                onClick={() => setShowPassword((current) => !current)}
                edge="end"
                size="large"
              >
                {showPassword ? <Visibility /> : <VisibilityOff />}
              </IconButton>
            </InputAdornment>
          }
          label="New password"
        />
        {errors.password && <FormHelperText error>{errors.password}</FormHelperText>}
        {!errors.password && (
          <FormHelperText>
            Use at least {passwordMinLength} characters with uppercase, lowercase, number, and symbol.
          </FormHelperText>
        )}
        {password ? (
          <FormHelperText sx={{ color: strengthMeta.color }}>
            Password strength: {strengthMeta.label}
          </FormHelperText>
        ) : null}
      </CustomFormControl>

      <CustomFormControl fullWidth error={Boolean(errors.passwordConfirmation)}>
        <InputLabel htmlFor="password-setup-confirmation">Confirm password</InputLabel>
        <OutlinedInput
          id="password-setup-confirmation"
          type={showConfirmPassword ? 'text' : 'password'}
          value={passwordConfirmation}
          onChange={(event) => {
            setPasswordConfirmation(event.target.value);
            if (errors.passwordConfirmation) {
              setErrors((prev) => ({ ...prev, passwordConfirmation: undefined }));
            }
          }}
          endAdornment={
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle confirm password visibility"
                onClick={() => setShowConfirmPassword((current) => !current)}
                edge="end"
                size="large"
              >
                {showConfirmPassword ? <Visibility /> : <VisibilityOff />}
              </IconButton>
            </InputAdornment>
          }
          label="Confirm password"
        />
        {errors.passwordConfirmation && <FormHelperText error>{errors.passwordConfirmation}</FormHelperText>}
      </CustomFormControl>

      {submitError && (
        <Box sx={{ mt: 1 }}>
          <FormHelperText error>{submitError}</FormHelperText>
        </Box>
      )}

      <Box sx={{ mt: 2 }}>
        <AnimateButton>
          <Button color="secondary" disabled={isSubmitting} fullWidth size="large" type="submit" variant="contained">
            {isSubmitting ? 'Saving...' : 'Set password'}
          </Button>
        </AnimateButton>
      </Box>
    </Box>
  );
}
