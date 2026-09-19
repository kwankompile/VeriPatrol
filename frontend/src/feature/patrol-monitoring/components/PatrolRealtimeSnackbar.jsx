import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

import { subscribePatrolRealtimeNotifications } from 'services/realtime/patrolRealtimeNotifier';

const AUTO_HIDE_MS = 6000;

export default function PatrolRealtimeSnackbar() {
  const [open, setOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    return subscribePatrolRealtimeNotifications((next) => {
      setNotification(next);
      setOpen(true);
    });
  }, []);

  const handleClose = (_event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setOpen(false);
  };

  return (
    <Snackbar open={open} autoHideDuration={AUTO_HIDE_MS} onClose={handleClose} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
      <Alert onClose={handleClose} severity={notification?.severity ?? 'info'} variant="filled" sx={{ width: '100%' }}>
        {notification?.message}
      </Alert>
    </Snackbar>
  );
}
