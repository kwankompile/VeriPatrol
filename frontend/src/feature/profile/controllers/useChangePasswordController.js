import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import profileService from '../datasources/profileService';
import { ProfileRepository } from '../repositories/ProfileRepository';
import { applyProfileActionError } from '../utils/profileErrors';
import { endProfileSensitiveSession } from '../utils/profileSensitiveSession';
import { PROFILE_PASSWORD_MIN_LENGTH, validatePasswordChangeFields } from '../utils/profileValidation';

/**
 * @param {ProfileRepository} [repository]
 */
export function useChangePasswordController(repository) {
  const navigate = useNavigate();
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = repository ?? new ProfileRepository(profileService);
  }

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(null);

  const resetState = useCallback(() => {
    setSubmitting(false);
    setError('');
    setFieldErrors({});
    setRetryAfterSeconds(null);
  }, []);

  const submit = useCallback(
    async ({ currentPassword, otp, password, passwordConfirmation }) => {
      const clientErrors = validatePasswordChangeFields({
        currentPassword,
        otp,
        password,
        passwordConfirmation
      });

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
        await repositoryRef.current.changePassword({
          current_password: currentPassword,
          otp: otp.replace(/\D/g, ''),
          password,
          password_confirmation: passwordConfirmation
        });
        endProfileSensitiveSession(navigate);
        return true;
      } catch (submitError) {
        applyProfileActionError(submitError, {
          setFieldErrors,
          setError,
          setRetryAfterSeconds,
          fallbackMessage: 'Failed to change password.'
        });
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [navigate]
  );

  return {
    submitting,
    error,
    fieldErrors,
    retryAfterSeconds,
    passwordMinLength: PROFILE_PASSWORD_MIN_LENGTH,
    resetState,
    submit
  };
}
