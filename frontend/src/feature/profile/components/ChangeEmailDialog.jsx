import { useEffect, useState } from 'react';

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';

import OtpInput from 'feature/authentication/components/OtpInput';

import { useChangeEmailController } from '../controllers/useChangeEmailController';

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   isOnline: boolean;
 *   currentEmail?: string;
 * }} props
 */
export default function ChangeEmailDialog({ open, onClose, isOnline, currentEmail = '' }) {
  const { step, submitting, error, fieldErrors, maskedEmail, expiresIn, deliveryMode, resetState, startChange, confirmChange } =
    useChangeEmailController();
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!open) {
      setNewEmail('');
      setCurrentPassword('');
      setOtp('');
      setToken('');
      resetState();
    }
  }, [open, resetState]);

  const handleClose = () => {
    if (submitting) {
      return;
    }

    onClose();
  };

  const handleStartSubmit = async (event) => {
    event.preventDefault();

    if (!isOnline || submitting) {
      return;
    }

    const started = await startChange({ newEmail, currentPassword, otp });

    if (started) {
      setCurrentPassword('');
      setOtp('');
    }
  };

  const handleConfirmSubmit = async (event) => {
    event.preventDefault();

    if (!isOnline || submitting) {
      return;
    }

    await confirmChange({ token });
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" aria-labelledby="change-email-dialog-title">
      <DialogTitle id="change-email-dialog-title">Change Email</DialogTitle>

      {step === 'start' ? (
        <Box component="form" onSubmit={(event) => void handleStartSubmit(event)}>
          <DialogContent>
            <Stack spacing={2}>
              {error ? <Alert severity="error">{error}</Alert> : null}

              {currentEmail ? (
                <Typography variant="body2" color="text.secondary">
                  Current email: {currentEmail}
                </Typography>
              ) : null}

              <TextField
                label="New email"
                type="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                error={Boolean(fieldErrors.new_email)}
                helperText={fieldErrors.new_email?.[0]}
                autoComplete="email"
                fullWidth
              />

              <TextField
                label="Current password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                error={Boolean(fieldErrors.current_password)}
                helperText={fieldErrors.current_password?.[0]}
                autoComplete="current-password"
                fullWidth
              />

              <OtpInput
                value={otp}
                onChange={setOtp}
                disabled={submitting || !isOnline}
                error={Boolean(fieldErrors.otp)}
                helperText={fieldErrors.otp?.[0] ?? 'Enter the 6-digit code from your authenticator app.'}
                id="change-email-otp"
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!isOnline || submitting}>
              {submitting ? 'Sending verification…' : 'Send verification email'}
            </Button>
          </DialogActions>
        </Box>
      ) : (
        <Box component="form" onSubmit={(event) => void handleConfirmSubmit(event)}>
          <DialogContent>
            <Stack spacing={2}>
              <Alert severity="info">
                {deliveryMode === 'log'
                  ? 'Verification email is written to the Laravel log in local mode. Copy the token from storage/logs/laravel.log.'
                  : 'Check your email for the verification token.'}
              </Alert>

              {error ? <Alert severity="error">{error}</Alert> : null}

              {maskedEmail ? (
                <Typography variant="body2">
                  Verification sent to <strong>{maskedEmail}</strong>
                </Typography>
              ) : null}

              {expiresIn ? (
                <Typography variant="body2" color="text.secondary">
                  Token expires in {Math.ceil(expiresIn / 60)} minutes.
                </Typography>
              ) : null}

              <Alert severity="warning">You will be signed out on all devices after your email is changed successfully.</Alert>

              <TextField
                label="Confirmation token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                error={Boolean(fieldErrors.token)}
                helperText={
                  fieldErrors.token?.[0] ??
                  (deliveryMode === 'log'
                    ? 'Paste the token from storage/logs/laravel.log for local testing.'
                    : 'Paste the token from your verification email.')
                }
                autoComplete="off"
                fullWidth
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!isOnline || submitting}>
              {submitting ? 'Confirming email…' : 'Confirm email change'}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}
