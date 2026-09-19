import { useEffect, useState } from 'react';

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';

import OtpInput from 'feature/authentication/components/OtpInput';

import { useChangePasswordController } from '../controllers/useChangePasswordController';

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   isOnline: boolean;
 * }} props
 */
export default function ChangePasswordDialog({ open, onClose, isOnline }) {
  const { submitting, error, fieldErrors, passwordMinLength, resetState, submit } = useChangePasswordController();
  const [currentPassword, setCurrentPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');

  useEffect(() => {
    if (!open) {
      setCurrentPassword('');
      setOtp('');
      setPassword('');
      setPasswordConfirmation('');
      resetState();
    }
  }, [open, resetState]);

  const handleClose = () => {
    if (submitting) {
      return;
    }

    onClose();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isOnline || submitting) {
      return;
    }

    await submit({
      currentPassword,
      otp,
      password,
      passwordConfirmation
    });
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" aria-labelledby="change-password-dialog-title">
      <DialogTitle id="change-password-dialog-title">Change Password</DialogTitle>
      <Box component="form" onSubmit={(event) => void handleSubmit(event)}>
        <DialogContent>
          <Stack spacing={2}>
            <Alert severity="warning">You will be signed out on all devices after your password is changed successfully.</Alert>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <Typography variant="body2" color="text.secondary">
              New password must be at least {passwordMinLength} characters.
            </Typography>

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
              id="change-password-otp"
            />

            <TextField
              label="New password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={Boolean(fieldErrors.password)}
              helperText={fieldErrors.password?.[0]}
              autoComplete="new-password"
              fullWidth
            />

            <TextField
              label="Confirm new password"
              type="password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              error={Boolean(fieldErrors.password_confirmation)}
              helperText={fieldErrors.password_confirmation?.[0]}
              autoComplete="new-password"
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={!isOnline || submitting}>
            {submitting ? 'Changing password…' : 'Change password'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
