import { useEffect, useState } from 'react';

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

import { AUTH_SESSION_EXPIRED_EVENT, consumeSessionExpiredFlag } from 'utils/auth';

export default function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (consumeSessionExpiredFlag()) {
      setOpen(true);
    }

    const onSessionExpired = () => setOpen(true);
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, onSessionExpired);
  }, []);

  const handleClose = () => setOpen(false);

  return (
    <Dialog open={open} onClose={handleClose} aria-labelledby="session-expired-title">
      <DialogTitle id="session-expired-title">Session expired</DialogTitle>
      <DialogContent>
        <DialogContentText>Your session has expired. Please sign in again to continue.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary" autoFocus>
          OK
        </Button>
      </DialogActions>
    </Dialog>
  );
}
