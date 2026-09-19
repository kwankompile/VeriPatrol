import PropTypes from 'prop-types';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText
} from '@mui/material';

export default function PatrolStopConfirmDialog({ open, onClose, onConfirm, disabled = false }) {
  return (
    <Dialog open={open} onClose={disabled ? undefined : onClose} maxWidth="sm" fullWidth data-testid="patrol-stop-confirm-dialog">
      <DialogTitle>Stop patrol?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Stopping will end GPS recording for this patrol. The app will then:
        </DialogContentText>
        <List dense disablePadding>
          <ListItem disableGutters>
            <ListItemText primary="1. Sync any pending offline logs to the server" />
          </ListItem>
          <ListItem disableGutters>
            <ListItemText primary="2. Run backend validation on checkpoint and route evidence" />
          </ListItem>
          <ListItem disableGutters>
            <ListItemText primary="3. Load the final patrol summary for your review" />
          </ListItem>
        </List>
        <DialogContentText sx={{ mt: 2 }} color="text.secondary">
          Unsynced logs are kept locally and will not be deleted. You can retry sync if you are offline.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={disabled}>
          Continue patrol
        </Button>
        <Button variant="contained" color="secondary" onClick={onConfirm} disabled={disabled} data-testid="patrol-stop-confirm-button">
          Stop and finalize
        </Button>
      </DialogActions>
    </Dialog>
  );
}

PatrolStopConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onConfirm: PropTypes.func.isRequired,
  disabled: PropTypes.bool
};
