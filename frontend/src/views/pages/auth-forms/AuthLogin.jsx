import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// material-ui
import Button from '@mui/material/Button';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import OutlinedInput from '@mui/material/OutlinedInput';
import Box from '@mui/material/Box';

// project imports
import AnimateButton from 'ui-component/extended/AnimateButton';
import CustomFormControl from 'ui-component/extended/Form/CustomFormControl';
import api from 'api/api';
import { getAuthUserRole, getDefaultRouteForRole, setAuthToken, setAuthUser } from 'utils/auth';

// assets
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';

// ===============================|| JWT - LOGIN ||=============================== //

export default function AuthLogin() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClickShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const handleMouseDownPassword = (event) => {
    event.preventDefault();
  };

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateForm = () => {
    const nextErrors = {};

    if (!email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!emailPattern.test(email.trim())) {
      nextErrors.email = 'Please enter a valid email address.';
    }

    if (!password) {
      nextErrors.password = 'Password is required.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const extractErrorMessage = (error) => {
    const responseData = error?.data;
    const backendMessage = responseData?.message;
    const validationErrors = responseData?.data?.errors || responseData?.errors;

    if (validationErrors && typeof validationErrors === 'object') {
      const firstError = Object.values(validationErrors)[0];
      if (Array.isArray(firstError) && firstError.length > 0) {
        return firstError[0];
      }
      if (typeof firstError === 'string') {
        return firstError;
      }
    }

    if (typeof backendMessage === 'string' && backendMessage.trim()) {
      return backendMessage;
    }

    return 'Login failed. Please try again.';
  };

  const submitLogin = async (payload) => {
    try {
      return await api.post('/auth/login', payload, { skipAuthRefresh: true });
    } catch (error) {
      if (error?.status === 404) {
        return api.post('/login', payload, { skipAuthRefresh: true });
      }
      throw error;
    }
  };

  const completeLoginSession = (responseData) => {
    const token = responseData.access_token;
    const user = responseData.user;

    if (!token) {
      throw new Error('Missing access token from login response.');
    }

    setAuthToken(token);
    if (user) {
      setAuthUser(user);
    }
    const role = responseData.role || getAuthUserRole();
    navigate(getDefaultRouteForRole(role), { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    setSubmitError('');
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload = { email: email.trim(), password };
      const response = await submitLogin(payload);
      const responseData = response?.data?.data || {};

      if (responseData.next_step === 'password_setup_required') {
        navigate('/first-login/setup', {
          replace: true,
          state: {
            setupToken: responseData.setup_token,
            email: responseData.user?.email || email.trim(),
            expiresIn: responseData.expires_in
          }
        });
        return;
      }

      if (responseData.next_step === 'two_factor_setup_required') {
        navigate('/first-login/2fa', {
          replace: true,
          state: {
            twoFactorSetupToken: responseData.two_factor_setup_token,
            email: responseData.user?.email || email.trim(),
            expiresIn: responseData.expires_in
          }
        });
        return;
      }

      if (responseData.next_step === 'otp_required') {
        navigate('/login/otp', {
          replace: true,
          state: {
            loginChallengeId: responseData.login_challenge_id,
            email: responseData.user?.email || email.trim(),
            expiresIn: responseData.expires_in
          }
        });
        return;
      }

      completeLoginSession(responseData);
    } catch (error) {
      const message = extractErrorMessage(error);
      setSubmitError(message);

      if (error?.status === 401 || error?.status === 429) {
        setPassword('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      <CustomFormControl fullWidth error={Boolean(errors.email)}>
        <InputLabel htmlFor="outlined-adornment-email-login">Email Address</InputLabel>
        <OutlinedInput
          id="outlined-adornment-email-login"
          type="email"
          name="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (errors.email) {
              setErrors((prev) => ({ ...prev, email: undefined }));
            }
          }}
        />
        {errors.email && <FormHelperText error>{errors.email}</FormHelperText>}
      </CustomFormControl>

      <CustomFormControl fullWidth error={Boolean(errors.password)}>
        <InputLabel htmlFor="outlined-adornment-password-login">Password</InputLabel>
        <OutlinedInput
          id="outlined-adornment-password-login"
          type={showPassword ? 'text' : 'password'}
          name="password"
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
                onClick={handleClickShowPassword}
                onMouseDown={handleMouseDownPassword}
                edge="end"
                size="large"
              >
                {showPassword ? <Visibility /> : <VisibilityOff />}
              </IconButton>
            </InputAdornment>
          }
          label="Password"
        />
        {errors.password && <FormHelperText error>{errors.password}</FormHelperText>}
      </CustomFormControl>

      {submitError && (
        <Box sx={{ mt: 1 }}>
          <FormHelperText error>{submitError}</FormHelperText>
        </Box>
      )}
      <Box sx={{ mt: 2 }}>
        <AnimateButton>
          <Button color="secondary" disabled={isSubmitting} fullWidth size="large" type="submit" variant="contained">
            {isSubmitting ? 'Signing In...' : 'Sign In'}
          </Button>
        </AnimateButton>
      </Box>
    </Box>
  );
}
