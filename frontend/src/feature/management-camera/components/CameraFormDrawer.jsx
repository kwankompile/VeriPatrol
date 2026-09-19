import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Button,
  Divider,
  Drawer,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';

function ReadOnlyField({ label, value }) {
  return <TextField label={label} value={value ?? '—'} disabled fullWidth />;
}

ReadOnlyField.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
};

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  location: '',
  latitude: '',
  longitude: '',
  resolutionWidth: '',
  resolutionHeight: '',
  credentialEnabled: true,
  isActive: true
};

function formStateFromCamera(camera) {
  if (!camera) return { ...EMPTY_FORM };

  return {
    name: camera.name ?? '',
    email: camera.email ?? '',
    password: '',
    location: camera.location ?? '',
    latitude: camera.latitude ?? '',
    longitude: camera.longitude ?? '',
    resolutionWidth: camera.resolutionWidth ?? '',
    resolutionHeight: camera.resolutionHeight ?? '',
    credentialEnabled: Boolean(camera.credentialEnabled),
    isActive: Boolean(camera.isActive)
  };
}

export default function CameraFormDrawer({ open, mode, camera, saving, errors = {}, onClose, onSave }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(isEdit ? formStateFromCamera(camera) : { ...EMPTY_FORM });
  }, [open, mode, camera, isEdit]);

  const updateField = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 3 } }}>
      <Typography variant="h4" gutterBottom>
        {isEdit ? 'Edit camera' : 'Create camera'}
      </Typography>

      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
        <TextField
          name="name"
          label="Camera name"
          value={form.name}
          onChange={updateField('name')}
          required
          fullWidth
          error={Boolean(errors.name)}
          helperText={errors.name}
        />
        <TextField
          name="email"
          label="Camera email"
          type="email"
          value={form.email}
          onChange={updateField('email')}
          required
          fullWidth
          error={Boolean(errors.email)}
          helperText={errors.email}
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={updateField('password')}
          required={!isEdit}
          fullWidth
          error={Boolean(errors.password)}
          helperText={
            errors.password || (isEdit ? 'Leave blank to keep the current password.' : 'Minimum length follows backend policy.')
          }
        />
        <TextField
          name="location"
          label="Location"
          value={form.location}
          onChange={updateField('location')}
          fullWidth
          error={Boolean(errors.location)}
          helperText={errors.location}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            name="latitude"
            label="Latitude"
            type="number"
            inputProps={{ step: 'any' }}
            value={form.latitude}
            onChange={updateField('latitude')}
            fullWidth
            error={Boolean(errors.latitude)}
            helperText={errors.latitude}
          />
          <TextField
            name="longitude"
            label="Longitude"
            type="number"
            inputProps={{ step: 'any' }}
            value={form.longitude}
            onChange={updateField('longitude')}
            fullWidth
            error={Boolean(errors.longitude)}
            helperText={errors.longitude}
          />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            name="resolutionWidth"
            label="Resolution width"
            type="number"
            value={form.resolutionWidth}
            onChange={updateField('resolutionWidth')}
            fullWidth
            error={Boolean(errors.resolution_width)}
            helperText={errors.resolution_width}
          />
          <TextField
            name="resolutionHeight"
            label="Resolution height"
            type="number"
            value={form.resolutionHeight}
            onChange={updateField('resolutionHeight')}
            fullWidth
            error={Boolean(errors.resolution_height)}
            helperText={errors.resolution_height}
          />
        </Stack>

        <FormControlLabel
          control={
            <Switch
              name="credentialEnabled"
              checked={form.credentialEnabled}
              onChange={updateField('credentialEnabled')}
              inputProps={{ id: 'credentialEnabled', name: 'credentialEnabled' }}
            />
          }
          label="Credential enabled"
        />
        <FormControlLabel
          control={
            <Switch
              name="isActive"
              checked={form.isActive}
              onChange={updateField('isActive')}
              inputProps={{ id: 'isActive', name: 'isActive' }}
            />
          }
          label="Active"
        />

        {isEdit && camera ? (
          <>
            <Divider />
            <Typography variant="subtitle1">Operational (read-only)</Typography>
            <ReadOnlyField label="Masked RTSP URL" value={camera.rtspUrlMasked} />
            <ReadOnlyField label="RTSP reported at" value={camera.formattedRtspReportedAt} />
            <ReadOnlyField label="Last login" value={camera.formattedLastLoginAt} />
            <ReadOnlyField label="Last seen" value={camera.formattedLastSeenAt} />
            <ReadOnlyField label="Credential rotated at" value={camera.formattedCredentialRotatedAt} />
          </>
        ) : null}

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="outlined" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}

CameraFormDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(['create', 'edit']),
  camera: PropTypes.object,
  saving: PropTypes.bool,
  errors: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired
};
