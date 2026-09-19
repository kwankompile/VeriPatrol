import { Box, Button, CircularProgress } from '@mui/material';
import { IconDeviceFloppy as SaveIcon, IconX as CancelIcon } from '@tabler/icons-react';

export const CameraFormActions = ({ onSubmit, onCancel, loading, submitLabel = 'Save' }) => {
  return (
    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 3 }}>
      <Button variant="outlined" color="secondary" onClick={onCancel} disabled={loading} startIcon={<CancelIcon size={18} />}>
        Cancel
      </Button>
      <Button
        variant="contained"
        color="primary"
        onClick={onSubmit}
        disabled={loading}
        startIcon={loading ? <CircularProgress size={18} /> : <SaveIcon size={18} />}
      >
        {loading ? 'Saving...' : submitLabel}
      </Button>
    </Box>
  );
};
