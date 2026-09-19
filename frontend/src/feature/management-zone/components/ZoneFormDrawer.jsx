import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Button, Drawer, Stack, TextField, Typography } from '@mui/material';
import { IconMap as MapIcon } from '@tabler/icons-react';

const EMPTY_FORM = {
  name: '',
  description: ''
};

function formStateFromZone(zone) {
  if (!zone) return { ...EMPTY_FORM };
  return {
    name: zone.name ?? '',
    description: zone.description ?? ''
  };
}

export default function ZoneFormDrawer({ open, mode = 'create', zone = null, saving = false, errors = {}, onClose, onSave }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(isEdit ? formStateFromZone(zone) : { ...EMPTY_FORM });
  }, [open, mode, zone, isEdit]);

  const updateField = (field) => (event) => {
    const { value } = event.target;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 460 }, p: 3 } }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
        <Box
          sx={(theme) => ({
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 2,
            color: theme.palette.secondary.main,
            bgcolor: theme.palette.secondary.light
          })}
        >
          <MapIcon size={22} />
        </Box>
        <Typography variant="h4">{isEdit ? 'Edit zone' : 'Add new zone'}</Typography>
      </Stack>

      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
        <TextField
          name="name"
          label="Zone name"
          value={form.name}
          onChange={updateField('name')}
          required
          fullWidth
          error={Boolean(errors.name)}
          helperText={errors.name}
        />
        <TextField
          name="description"
          label="Description"
          value={form.description}
          onChange={updateField('description')}
          fullWidth
          multiline
          minRows={3}
          error={Boolean(errors.description)}
          helperText={errors.description || 'Optional'}
        />

        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="outlined" color="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" color="secondary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save' : 'Create'}
          </Button>
        </Stack>
      </Stack>
    </Drawer>
  );
}

ZoneFormDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(['create', 'edit']),
  zone: PropTypes.object,
  saving: PropTypes.bool,
  errors: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired
};
