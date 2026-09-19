import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AuthRepository } from '../repositories/authRepository';
import authService from '../datasources/authService';
import { getDefaultRouteForRole, setAuthToken, setAuthUser } from 'utils/auth';

export default function useTwoFactorSetupController() {
  const navigate = useNavigate();
  const location = useLocation();
  const repository = useMemo(() => new AuthRepository(authService), []);

  const setupState = location.state || {};
  const twoFactorSetupToken = setupState.twoFactorSetupToken || null;
  const email = setupState.email || '';
  const missingSetupContext = !twoFactorSetupToken;

  const [manualKey, setManualKey] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [otp, setOtp] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [startError, setStartError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupReady, setSetupReady] = useState(false);

  const extractErrorMessage = useCallback((error, fallback) => {
    const responseData = error?.data;
    const backendMessage = responseData?.message;

    if (typeof backendMessage === 'string' && backendMessage.trim()) {
      return backendMessage;
    }

    return fallback;
  }, []);

  useEffect(() => {
    if (missingSetupContext) {
      return undefined;
    }

    let cancelled = false;

    const startSetup = async () => {
      setIsStarting(true);
      setStartError('');
      try {
        const result = await repository.startTwoFactorSetup({
          two_factor_setup_token: twoFactorSetupToken
        });

        if (cancelled) {
          return;
        }

        setManualKey(result.manualKey || '');
        setOtpauthUri(result.otpauthUri || '');
        setSetupReady(true);
      } catch (error) {
        if (!cancelled) {
          setStartError(extractErrorMessage(error, 'Two-factor setup could not be started. Sign in again to continue.'));
        }
      } finally {
        if (!cancelled) {
          setIsStarting(false);
        }
      }
    };

    startSetup();

    return () => {
      cancelled = true;
    };
  }, [extractErrorMessage, missingSetupContext, repository, twoFactorSetupToken]);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (isSubmitting || missingSetupContext || !setupReady) {
        return;
      }

      const normalizedOtp = otp.replace(/\D/g, '');
      if (normalizedOtp.length !== 6) {
        setSubmitError('Enter the 6-digit authentication code.');
        return;
      }

      setSubmitError('');
      setIsSubmitting(true);
      try {
        const result = await repository.verifyTwoFactorSetup({
          two_factor_setup_token: twoFactorSetupToken,
          otp: normalizedOtp
        });

        if (!result.accessToken) {
          throw new Error('Missing access token from two-factor setup response.');
        }

        setAuthToken(result.accessToken);
        if (result.user) {
          setAuthUser(result.user);
        }

        navigate(getDefaultRouteForRole(result.role), { replace: true });
      } catch (error) {
        setSubmitError(extractErrorMessage(error, 'The provided authentication code is invalid.'));
        setOtp('');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      extractErrorMessage,
      isSubmitting,
      missingSetupContext,
      navigate,
      otp,
      repository,
      setupReady,
      twoFactorSetupToken
    ]
  );

  return {
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
    handleSubmit
  };
}
