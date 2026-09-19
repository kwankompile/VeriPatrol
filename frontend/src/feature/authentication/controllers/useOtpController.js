import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { AuthRepository } from '../repositories/authRepository';
import authService from '../datasources/authService';
import { getDefaultRouteForRole, setAuthToken, setAuthUser } from 'utils/auth';

export default function useOtpController() {
  const navigate = useNavigate();
  const location = useLocation();
  const repository = useMemo(() => new AuthRepository(authService), []);

  const otpState = location.state || {};
  const loginChallengeId = otpState.loginChallengeId || null;
  const email = otpState.email || '';
  const missingOtpContext = !loginChallengeId;

  const [otp, setOtp] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setOtp('');
    setSubmitError('');
  }, [loginChallengeId]);

  const extractErrorMessage = useCallback((error) => {
    const responseData = error?.data;
    const backendMessage = responseData?.message;

    if (typeof backendMessage === 'string' && backendMessage.trim()) {
      return backendMessage;
    }

    return 'The authentication code is invalid or expired.';
  }, []);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (isSubmitting || missingOtpContext) {
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
        const result = await repository.verifyOtp({
          login_challenge_id: loginChallengeId,
          otp: normalizedOtp
        });

        if (!result.accessToken) {
          throw new Error('Missing access token from OTP verification response.');
        }

        setAuthToken(result.accessToken);
        if (result.user) {
          setAuthUser(result.user);
        }

        navigate(getDefaultRouteForRole(result.role), { replace: true });
      } catch (error) {
        setSubmitError(extractErrorMessage(error));
        setOtp('');
      } finally {
        setIsSubmitting(false);
      }
    },
    [extractErrorMessage, isSubmitting, loginChallengeId, missingOtpContext, navigate, otp, repository]
  );

  return {
    email,
    otp,
    setOtp,
    submitError,
    isSubmitting,
    missingOtpContext,
    handleSubmit
  };
}
