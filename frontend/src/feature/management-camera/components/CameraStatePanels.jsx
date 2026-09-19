import PropTypes from 'prop-types';
import { Alert, Box, Button, CircularProgress, Skeleton, Stack, Typography } from '@mui/material';

export function CameraLoadingPanel({ rowCount = 5 }) {
  return (
    <Stack spacing={1}>
      {Array.from({ length: rowCount }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={48} />
      ))}
    </Stack>
  );
}

CameraLoadingPanel.propTypes = {
  rowCount: PropTypes.number
};

export function CameraEmptyPanel({ onCreate }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6 }}>
      <Typography variant="h6" gutterBottom>
        No cameras configured
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Create a camera credential so the ANPR runtime can authenticate and report detections.
      </Typography>
      <Button variant="contained" onClick={onCreate}>
        Create camera
      </Button>
    </Box>
  );
}

CameraEmptyPanel.propTypes = {
  onCreate: PropTypes.func.isRequired
};

export function CameraErrorPanel({ message, onRetry }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {message || 'Failed to load cameras.'}
    </Alert>
  );
}

CameraErrorPanel.propTypes = {
  message: PropTypes.string,
  onRetry: PropTypes.func.isRequired
};

export function CameraInlineLoading() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress />
    </Box>
  );
}
