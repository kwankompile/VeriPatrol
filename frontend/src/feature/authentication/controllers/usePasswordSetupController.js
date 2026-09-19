import { useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AuthRepository } from '../repositories/authRepository';
import authService from '../datasources/authService';

const PASSWORD_MIN_LENGTH = Number(import.meta.env.VITE_AUTH_PASSWORD_MIN_LENGTH) || 12;

export default function usePasswordSetupController() {
  const navigate = useNavigate();
  const location = useLocation();
  const repository = useMemo(() => new AuthRepository(authService), []);

  const setupState = location.state || {};
  const setupToken = setupState.setupToken || null;
  const email = setupState.email || '';
  const missingSetupContext = !setupToken;

  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateForm = useCallback(() => {
    const nextErrors = {};

    if (!password) {
      nextErrors.password = 'Password is required.';
    } else if (password.length < PASSWORD_MIN_LENGTH) {
      nextErrors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
    }

    if (!passwordConfirmation) {
      nextErrors.passwordConfirmation = 'Please confirm your password.';
    } else if (password !== passwordConfirmation) {
      nextErrors.passwordConfirmation = 'Passwords do not match.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [password, passwordConfirmation]);

  const extractErrorMessage = useCallback((error) => {
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

    return 'Password setup failed. Please try again.';
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (isSubmitting || missingSetupContext) {
        return;
      }

      setSubmitError('');
      if (!validateForm()) {
        return;
      }

      setIsSubmitting(true);
      try {
        const result = await repository.completePasswordSetup({
          setup_token: setupToken,
          password,
          password_confirmation: passwordConfirmation
        });

        setPassword('');
        setPasswordConfirmation('');

        navigate('/first-login/2fa', {
          replace: true,
          state: {
            twoFactorSetupToken: result.twoFactorSetupToken,
            email: result.user?.email || email,
            expiresIn: result.expiresIn
          }
        });
      } catch (error) {
        setSubmitError(extractErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      email,
      extractErrorMessage,
      isSubmitting,
      missingSetupContext,
      navigate,
      password,
      passwordConfirmation,
      repository,
      setupToken,
      validateForm
    ]
  );

  return {
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
    passwordMinLength: PASSWORD_MIN_LENGTH,
    handleSubmit
  };
}

export { PASSWORD_MIN_LENGTH };
