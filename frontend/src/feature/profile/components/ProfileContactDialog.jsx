import { useEffect, useMemo, useState } from 'react';

import PropTypes from 'prop-types';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { IconX } from '@tabler/icons-react';

import {
  contactValuesEqual,
  normalizeContactValue,
  PROFILE_ADDRESS_MAX_LENGTH,
  PROFILE_PHONE_MAX_LENGTH,
  validateContactFields
} from '../utils/profileValidation';

/**
 * Modal for editing contact information (phone + address). Email changes are a
 * sensitive flow handled under Security Settings, so email is shown read-only.
 *
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   profile: import('../repositories/ProfileRepository').NormalizedProfileUser;
 *   saving?: boolean;
 *   fieldErrors?: Record<string, string[]>;
 *   successMessage?: string;
 *   conflictMessage?: string;
 *   offlinePendingMessage?: string;
 *   offlineSyncing?: boolean;
 *   saveError?: string | null;
 *   onSave: (values: { phone: string; address: string }) => void | Promise<void>;
 * }} props
 */
export default function ProfileContactDialog({
  open,
  onClose,
  profile,
  saving = false,
  fieldErrors = {},
  successMessage = '',
  conflictMessage = '',
  offlinePendingMessage = '',
  offlineSyncing = false,
  saveError = null,
  onSave
}) {
  const [phone, setPhone] = useState(() => normalizeContactValue(profile.phone));
  const [address, setAddress] = useState(() => normalizeContactValue(profile.address));
  const [clientErrors, setClientErrors] = useState({});

  useEffect(() => {
    setPhone(normalizeContactValue(profile.phone));
    setAddress(normalizeContactValue(profile.address));
    setClientErrors({});
  }, [profile.id, profile.profileVersion, profile.phone, profile.address, open]);

  const hasChanges = useMemo(
    () => !contactValuesEqual(phone, profile.phone) || !contactValuesEqual(address, profile.address),
    [address, phone, profile.address, profile.phone]
  );

  const mergedFieldErrors = {
    ...clientErrors,
    ...fieldErrors
  };

  const handleSave = () => {
    const nextClientErrors = validateContactFields({ phone, address });
    setClientErrors(nextClientErrors);

    if (Object.keys(nextClientErrors).length > 0) {
      return;
    }

    void onSave({ phone, address });
  };

  const handleReset = () => {
    setPhone(normalizeContactValue(profile.phone));
    setAddress(normalizeContactValue(profile.address));
    setClientErrors({});
  };

  const handleClose = () => {
    if (saving) {
      return;
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth aria-labelledby="profile-contact-dialog-title">
      <DialogTitle id="profile-contact-dialog-title" sx={{ pr: 6 }}>
        Edit Contact Information
        <IconButton
          aria-label="Close"
          onClick={handleClose}
          disabled={saving}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
        >
          <IconX size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {offlinePendingMessage ? <Alert severity="info">{offlinePendingMessage}</Alert> : null}
          {offlineSyncing ? <Alert severity="info">Syncing offline profile update…</Alert> : null}
          {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}
          {conflictMessage ? <Alert severity="warning">{conflictMessage}</Alert> : null}
          {saveError ? <Alert severity="error">{saveError}</Alert> : null}

          <TextField
            label="Email"
            value={profile.email ?? ''}
            InputProps={{ readOnly: true }}
            helperText="Email changes are managed in Security Settings."
            fullWidth
          />

          <TextField
            label="Phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={Boolean(mergedFieldErrors.phone)}
            helperText={mergedFieldErrors.phone?.[0] ?? `${phone.length}/${PROFILE_PHONE_MAX_LENGTH}`}
            inputProps={{ maxLength: PROFILE_PHONE_MAX_LENGTH }}
            fullWidth
          />

          <TextField
            label="Address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            error={Boolean(mergedFieldErrors.address)}
            helperText={mergedFieldErrors.address?.[0] ?? `${address.length}/${PROFILE_ADDRESS_MAX_LENGTH}`}
            inputProps={{ maxLength: PROFILE_ADDRESS_MAX_LENGTH }}
            multiline
            minRows={3}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="outlined" color="secondary" onClick={handleReset} disabled={saving || !hasChanges}>
          Discard changes
        </Button>
        <Button variant="contained" color="secondary" onClick={handleSave} disabled={saving || !hasChanges}>
          {offlineSyncing ? 'Syncing…' : saving ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ProfileContactDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  profile: PropTypes.object.isRequired,
  saving: PropTypes.bool,
  fieldErrors: PropTypes.object,
  successMessage: PropTypes.string,
  conflictMessage: PropTypes.string,
  offlinePendingMessage: PropTypes.string,
  offlineSyncing: PropTypes.bool,
  saveError: PropTypes.string,
  onSave: PropTypes.func
};
