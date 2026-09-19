import { useEffect, useRef, useState } from 'react';

import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';

import { useNetworkStatus } from 'pwa/useNetworkStatus';

const AUTO_HIDE_MS = 5000;

export default function NetworkSnackbar() {
  const isOnline = useNetworkStatus();
  const prevOnlineRef = useRef(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const mountedRef = useRef(false);

  const [open, setOpen] = useState(false);
  const [variant, setVariant] = useState('offline');

  useEffect(() => {
    const wasOnline = prevOnlineRef.current;

    if (!mountedRef.current) {
      mountedRef.current = true;
      prevOnlineRef.current = isOnline;
      if (!isOnline) {
        setVariant('offline');
        setOpen(true);
      }
      return;
    }

    if (wasOnline && !isOnline) {
      setVariant('offline');
      setOpen(true);
    } else if (!wasOnline && isOnline) {
      setVariant('online');
      setOpen(true);
    }

    prevOnlineRef.current = isOnline;
  }, [isOnline]);

  const handleClose = (_event, reason) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  const message = variant === 'online' ? 'You are back online.' : 'You are offline. Some actions may be saved locally until you reconnect.';

  const severity = variant === 'online' ? 'success' : 'warning';

  return (
    <Snackbar open={open} autoHideDuration={AUTO_HIDE_MS} onClose={handleClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert onClose={handleClose} severity={severity} variant="filled" sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  );
}
