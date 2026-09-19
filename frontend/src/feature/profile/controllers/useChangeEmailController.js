import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import profileService from '../datasources/profileService';
import { ProfileRepository } from '../repositories/ProfileRepository';
import { applyProfileActionError } from '../utils/profileErrors';
import { endProfileSensitiveSession } from '../utils/profileSensitiveSession';
import { validateEmailChangeStartFields, validateEmailConfirmFields } from '../utils/profileValidation';

/**
 * @param {ProfileRepository} [repository]
 */
export function useChangeEmailController(repository) {
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
  const [maskedEmail, setMaskedEmail] = useState('');
  const [expiresIn, setExpiresIn] = useState(null);
  const [deliveryMode, setDeliveryMode] = useState(null);

  const resetState = useCallback(() => {
    setStep('start');
    setSubmitting(false);
    setError('');
    setFieldErrors({});
    setRetryAfterSeconds(null);
    setMaskedEmail('');
    setExpiresIn(null);
    setDeliveryMode(null);
  }, []);

  const startChange = useCallback(async ({ newEmail, currentPassword, otp }) => {
    const clientErrors = validateEmailChangeStartFields({ newEmail, currentPassword, otp });

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
      const result = await repositoryRef.current.startEmailChange({
        current_password: currentPassword,
        otp: otp.replace(/\D/g, ''),
        new_email: newEmail.trim()
      });
      setMaskedEmail(result.maskedEmail ?? '');
      setExpiresIn(result.expiresIn || null);
      setDeliveryMode(result.deliveryMode ?? null);
      setStep('confirm');
      return true;
    } catch (startError) {
      applyProfileActionError(startError, {
        setFieldErrors,
        setError,
        setRetryAfterSeconds,
        fallbackMessage: 'Failed to start email change.'
      });
      return false;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const confirmChange = useCallback(
    async ({ token }) => {
      const clientErrors = validateEmailConfirmFields({ token });

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
        await repositoryRef.current.confirmEmailChange({ token: token.trim() });
        endProfileSensitiveSession(navigate);
        return true;
      } catch (confirmError) {
        applyProfileActionError(confirmError, {
          setFieldErrors,
          setError,
          setRetryAfterSeconds,
          fallbackMessage: 'Failed to confirm email change.'
        });
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [navigate]
  );

  return {
    step,
    submitting,
    error,
    fieldErrors,
    retryAfterSeconds,
    maskedEmail,
    expiresIn,
    deliveryMode,
    resetState,
    startChange,
    confirmChange
  };
}
