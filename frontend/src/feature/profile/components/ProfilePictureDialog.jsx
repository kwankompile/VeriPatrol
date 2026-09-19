import { useEffect, useRef, useState } from 'react';

import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography
} from '@mui/material';
import { IconCloudUpload, IconPhoto, IconTrash, IconX } from '@tabler/icons-react';

import { getProfileInitials } from '../utils/profileFormatters';
import { formatFileSize, PROFILE_PICTURE_MAX_SIZE_BYTES, validateProfilePictureFile } from '../utils/profileValidation';

/**
 * Profile picture upload modal with file picker + drag & drop, live preview,
 * accepted-format/size guidance, and clear validation errors.
 *
 * @param {{
 *   open: boolean;
 *   onClose: () => void;
 *   profile: import('../repositories/ProfileRepository').NormalizedProfileUser;
 *   isOnline?: boolean;
 *   saving?: boolean;
 *   removing?: boolean;
 *   error?: string | null;
 *   fieldErrors?: Record<string, string[]>;
 *   successMessage?: string;
 *   onUpload: (file: File) => boolean | Promise<boolean>;
 *   onRemove: () => void | Promise<void>;
 *   onClearMessages?: () => void;
 * }} props
 */
export default function ProfilePictureDialog({
  open,
  onClose,
  profile,
  isOnline = true,
  saving = false,
  removing = false,
  error = null,
  fieldErrors = {},
  successMessage = '',
  onUpload,
  onRemove,
  onClearMessages
}) {
  const fileInputRef = useRef(null);
  const previewUrlRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [selectionError, setSelectionError] = useState(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const busy = saving || removing;
  const offlineBlocked = !isOnline;
  const controlsDisabled = busy || offlineBlocked;

  const revokePreviewUrl = (url) => {
    if (url) {
      URL.revokeObjectURL(url);
    }
  };

  const resetSelectionState = () => {
    revokePreviewUrl(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setSelectedFile(null);
    setSelectionError(null);
    setDragActive(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearSelection = () => {
    onClearMessages?.();
    resetSelectionState();
  };

  useEffect(() => () => revokePreviewUrl(previewUrlRef.current), []);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [profile.profilePictureUrl, previewUrl]);

  // Reset the transient selection whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      onClearMessages?.();
      resetSelectionState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const acceptFile = (file) => {
    onClearMessages?.();

    if (!file) {
      return;
    }

    const validationMessage = validateProfilePictureFile(file);

    if (validationMessage) {
      resetSelectionState();
      setSelectionError(validationMessage);
      return;
    }

    revokePreviewUrl(previewUrlRef.current);
    const nextPreviewUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setSelectedFile(file);
    setSelectionError(null);
  };

  const handleFileChange = (event) => {
    acceptFile(event.target.files?.[0]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);

    if (controlsDisabled) {
      return;
    }

    acceptFile(event.dataTransfer?.files?.[0]);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    if (!controlsDisabled) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setDragActive(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setSelectionError('Please select an image file.');
      return;
    }

    const succeeded = await onUpload(selectedFile);

    if (succeeded !== false) {
      resetSelectionState();
    }
  };

  const handleClose = () => {
    if (busy) {
      return;
    }
    onClose();
  };

  const displayAvatarSrc = previewUrl ?? (avatarLoadFailed || !profile.profilePictureUrl ? undefined : profile.profilePictureUrl);
  const imageFieldError = fieldErrors.image?.[0] ?? selectionError;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth aria-labelledby="profile-picture-dialog-title">
      <DialogTitle id="profile-picture-dialog-title" sx={{ pr: 6 }}>
        Update profile picture
        <IconButton
          aria-label="Close"
          onClick={handleClose}
          disabled={busy}
          sx={{ position: 'absolute', right: 8, top: 8, color: 'text.secondary' }}
        >
          <IconX size={18} />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {offlineBlocked ? <Alert severity="warning">Profile picture changes require an active network connection.</Alert> : null}
          {imageFieldError ? <Alert severity="error">{imageFieldError}</Alert> : null}

          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar
              src={displayAvatarSrc}
              alt={profile.name}
              sx={(theme) => ({
                width: 72,
                height: 72,
                fontSize: '1.3rem',
                fontWeight: 600,
                color: theme.palette.secondary.main,
                bgcolor: alpha(theme.palette.secondary.main, 0.16)
              })}
              imgProps={{ onError: () => setAvatarLoadFailed(true) }}
            >
              {getProfileInitials(profile.name)}
            </Avatar>
            <Stack spacing={0.5} sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                <Chip size="small" variant="outlined" color="secondary" label="JPG" />
                <Chip size="small" variant="outlined" color="secondary" label="PNG" />
                <Chip size="small" variant="outlined" color="secondary" label="WebP" />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Maximum size: {formatFileSize(PROFILE_PICTURE_MAX_SIZE_BYTES)}
              </Typography>
            </Stack>
          </Stack>

          <Box
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            data-testid="profile-picture-dropzone"
            sx={(theme) => ({
              p: 3,
              borderRadius: 2.5,
              textAlign: 'center',
              cursor: controlsDisabled ? 'not-allowed' : 'pointer',
              border: '1.5px dashed',
              borderColor: dragActive ? theme.palette.secondary.main : alpha(theme.palette.secondary.main, 0.3),
              bgcolor: dragActive ? alpha(theme.palette.secondary.main, 0.08) : alpha(theme.palette.secondary.main, 0.02),
              transition: 'border-color 160ms ease, background-color 160ms ease'
            })}
            onClick={() => {
              if (!controlsDisabled) {
                fileInputRef.current?.click();
              }
            }}
          >
            <Stack spacing={1} alignItems="center">
              <Box sx={(theme) => ({ color: theme.palette.secondary.main, display: 'inline-flex' })}>
                <IconCloudUpload size={30} />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Drag and drop an image here
              </Typography>
              <Typography variant="caption" color="text.secondary">
                or click to browse your files
              </Typography>
            </Stack>
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              aria-label="Select profile picture"
              disabled={controlsDisabled}
              onChange={handleFileChange}
            />
          </Box>

          {selectedFile ? (
            <Box
              data-testid="profile-picture-selected"
              sx={(theme) => ({
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(theme.palette.secondary.main, 0.2),
                bgcolor: alpha(theme.palette.secondary.main, 0.04)
              })}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={(theme) => ({ color: theme.palette.secondary.main, display: 'inline-flex' })}>
                  <IconPhoto size={18} />
                </Box>
                <Typography variant="body2" sx={{ minWidth: 0, wordBreak: 'break-word', flexGrow: 1 }}>
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </Typography>
                <Button size="small" color="secondary" onClick={clearSelection} disabled={busy}>
                  Cancel selection
                </Button>
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1 }}>
        {profile.profilePictureUrl ? (
          <Button
            color="error"
            variant="outlined"
            startIcon={<IconTrash size={16} />}
            onClick={() => void onRemove()}
            disabled={controlsDisabled}
            sx={{ mr: 'auto' }}
          >
            {removing ? 'Removing…' : 'Remove picture'}
          </Button>
        ) : null}
        <Button onClick={handleClose} disabled={busy} color="secondary">
          Cancel
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => void handleUpload()}
          disabled={controlsDisabled || !selectedFile}
        >
          {saving ? 'Uploading…' : 'Upload picture'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

ProfilePictureDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  profile: PropTypes.object.isRequired,
  isOnline: PropTypes.bool,
  saving: PropTypes.bool,
  removing: PropTypes.bool,
  error: PropTypes.string,
  fieldErrors: PropTypes.object,
  successMessage: PropTypes.string,
  onUpload: PropTypes.func,
  onRemove: PropTypes.func,
  onClearMessages: PropTypes.func
};
