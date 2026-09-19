import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';

import useServiceWorkerUpdate from 'pwa/useServiceWorkerUpdate';

// ==============================|| PWA UPDATE SNACKBAR ||============================== //

export default function PwaUpdateSnackbar() {
  const { updateAvailable, reloadUpdate } = useServiceWorkerUpdate();

  return (
    <Snackbar
      open={updateAvailable}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      data-testid="pwa-update-snackbar"
    >
      <Alert
        severity="info"
        variant="filled"
        sx={{ width: '100%' }}
        action={
          <Button color="inherit" size="small" onClick={reloadUpdate} data-testid="pwa-update-reload">
            Reload now
          </Button>
        }
      >
        New update available
      </Alert>
    </Snackbar>
  );
}
