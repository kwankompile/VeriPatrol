import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import profileService from '../datasources/profileService';
import { ProfileRepository } from '../repositories/ProfileRepository';
import { applyProfileActionError } from '../utils/profileErrors';
import { endProfileSensitiveSession } from '../utils/profileSensitiveSession';
import { validateTwoFactorReconfigureStartFields, validateTwoFactorReconfigureVerifyFields } from '../utils/profileValidation';

/**
 * @param {ProfileRepository} [repository]
 */
export function useTwoFactorReconfigureController(repository) {
  const navigate = useNavigate();
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = repository ?? new ProfileRepository(profileService);
  }

  const [step, setStep] = useState('start');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(null);
  const [twoFactorReconfigureToken, setTwoFactorReconfigureToken] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [expiresIn, setExpiresIn] = useState(null);

  const resetState = useCallback(() => {
    setStep('start');
    setSubmitting(false);
    setError('');
    setFieldErrors({});
    setRetryAfterSeconds(null);
    setTwoFactorReconfigureToken('');
    setManualKey('');
    setOtpauthUri('');
    setExpiresIn(null);
  }, []);

  const startReconfigure = useCallback(async ({ currentPassword, otp }) => {
    const clientErrors = validateTwoFactorReconfigureStartFields({ currentPassword, otp });

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setError('Please correct the highlighted fields.');
      return false;
    }

    setSubmitting(true);
    setError('');
    setFieldErrors({});
    setRetryAfterSeconds(null);

    try {
      const result = await repositoryRef.current.startTwoFactorReconfigure({
        current_password: currentPassword,
        otp: otp.replace(/\D/g, '')
      });
      setTwoFactorReconfigureToken(result.twoFactorReconfigureToken);
      setManualKey(result.manualKey);
      setOtpauthUri(result.otpauthUri);
      setExpiresIn(result.expiresIn || null);
      setStep('verify');
      return true;
    } catch (startError) {
      applyProfileActionError(startError, {
        setFieldErrors,
        setError,
        setRetryAfterSeconds,
        fallbackMessage: 'Failed to start two-factor reconfiguration.'
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const verifyReconfigure = useCallback(
    async ({ otp }) => {
      const clientErrors = validateTwoFactorReconfigureVerifyFields({ otp });

      if (Object.keys(clientErrors).length > 0) {
        setFieldErrors(clientErrors);
        setError('Please correct the highlighted fields.');
        return false;
      }

      if (!twoFactorReconfigureToken) {
        setError('Reconfiguration session expired. Close this dialog and try again.');
        return false;
      }

      setSubmitting(true);
      setError('');
      setFieldErrors({});
      setRetryAfterSeconds(null);

      try {
        await repositoryRef.current.verifyTwoFactorReconfigure({
          two_factor_reconfigure_token: twoFactorReconfigureToken,
          otp: otp.replace(/\D/g, '')
        });
        endProfileSensitiveSession(navigate);
        return true;
      } catch (verifyError) {
        applyProfileActionError(verifyError, {
          setFieldErrors,
          setError,
          setRetryAfterSeconds,
          fallbackMessage: 'Failed to verify two-factor reconfiguration.'
        });
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [navigate, twoFactorReconfigureToken]
  );

  return {
    step,
    submitting,
    error,
    fieldErrors,
    retryAfterSeconds,
    manualKey,
    otpauthUri,
    expiresIn,
    resetState,
    startReconfigure,
    verifyReconfigure
  };
}
