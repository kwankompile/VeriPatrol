import { useEffect, useState } from 'react';

import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';

import OtpInput from 'feature/authentication/components/OtpInput';

import { useTwoFactorReconfigureController } from '../controllers/useTwoFactorReconfigureController';

/**
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   isOnline: boolean;
 * }} props
 */
export default function TwoFactorReconfigureDialog({ open, onClose, isOnline }) {
  const { step, submitting, error, fieldErrors, manualKey, otpauthUri, expiresIn, resetState, startReconfigure, verifyReconfigure } =
    useTwoFactorReconfigureController();
  const [currentPassword, setCurrentPassword] = useState('');
  const [currentOtp, setCurrentOtp] = useState('');
  const [newOtp, setNewOtp] = useState('');

  useEffect(() => {
    if (!open) {
      setCurrentPassword('');
      setCurrentOtp('');
      setNewOtp('');
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

    const started = await startReconfigure({ currentPassword, otp: currentOtp });

    if (started) {
      setCurrentPassword('');
      setCurrentOtp('');
    }
  };

  const handleVerifySubmit = async (event) => {
    event.preventDefault();

    if (!isOnline || submitting) {
      return;
    }

    await verifyReconfigure({ otp: newOtp });
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" aria-labelledby="reconfigure-2fa-dialog-title">
      <DialogTitle id="reconfigure-2fa-dialog-title">Reconfigure Two-Factor Authentication</DialogTitle>

      {step === 'start' ? (
        <Box component="form" onSubmit={(event) => void handleStartSubmit(event)}>
          <DialogContent>
            <Stack spacing={2}>
              <Alert severity="info">
                Verify your current credentials to generate a new authenticator setup. Your existing authenticator remains valid until you
                complete the new setup.
              </Alert>

              {error ? <Alert severity="error">{error}</Alert> : null}

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
                value={currentOtp}
                onChange={setCurrentOtp}
                disabled={submitting || !isOnline}
                error={Boolean(fieldErrors.otp)}
                helperText={fieldErrors.otp?.[0] ?? 'Enter the 6-digit code from your current authenticator app.'}
                id="reconfigure-2fa-current-otp"
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!isOnline || submitting}>
              {submitting ? 'Starting…' : 'Continue'}
            </Button>
          </DialogActions>
        </Box>
      ) : (
        <Box component="form" onSubmit={(event) => void handleVerifySubmit(event)}>
          <DialogContent>
            <Stack spacing={2}>
              <Alert severity="warning">
                You will be signed out on all devices after two-factor authentication is reconfigured successfully.
              </Alert>

              {error ? <Alert severity="error">{error}</Alert> : null}

              {expiresIn ? (
                <Typography variant="body2" color="text.secondary">
                  Setup expires in {Math.ceil(expiresIn / 60)} minutes.
                </Typography>
              ) : null}

              <Typography variant="body1">1. Scan this QR code with your authenticator app</Typography>
              {otpauthUri ? (
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <QRCodeSVG value={otpauthUri} size={180} includeMargin />
                </Box>
              ) : null}

              <Typography variant="body1">2. Or enter this setup key manually</Typography>
              <Typography
                variant="body2"
                sx={{
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                  p: 1.5,
                  bgcolor: 'grey.100',
                  borderRadius: 1
                }}
              >
                {manualKey}
              </Typography>

              <Typography variant="body1">3. Enter the 6-digit code from your new authenticator app</Typography>
              <OtpInput
                value={newOtp}
                onChange={setNewOtp}
                disabled={submitting || !isOnline}
                error={Boolean(fieldErrors.otp)}
                helperText={fieldErrors.otp?.[0]}
                id="reconfigure-2fa-new-otp"
              />
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!isOnline || submitting}>
              {submitting ? 'Verifying…' : 'Complete reconfiguration'}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}
