import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Box, Button, Drawer, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { IconUsers as UsersIcon } from '@tabler/icons-react';

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  address: '',
  role_id: '',
  password: ''
};

function formStateFromUser(user) {
  if (!user) return { ...EMPTY_FORM };
  return {
    name: user.name ?? '',
    phone: user.phone ?? '',
    email: user.email ?? '',
    address: user.address ?? '',
    role_id: user.role?.id ?? user.role_id ?? '',
    password: ''
  };
}

export default function UserFormDrawer({
  open,
  mode = 'create',
  user = null,
  roleOptions = [],
  rolesLoading = false,
  saving = false,
  errors = {},
  onClose,
  onSave
}) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    setForm(isEdit ? formStateFromUser(user) : { ...EMPTY_FORM });
  }, [open, mode, user, isEdit]);

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
          <UsersIcon size={22} />
        </Box>
        <Typography variant="h4">{isEdit ? 'Edit user' : 'Add new user'}</Typography>
      </Stack>

      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
        <TextField
          name="name"
          label="Full name"
          value={form.name}
          onChange={updateField('name')}
          required
          fullWidth
          error={Boolean(errors.name)}
          helperText={errors.name}
        />
        <TextField
          name="role_id"
          label="User role"
          select
          value={rolesLoading ? '' : form.role_id}
          onChange={updateField('role_id')}
          required
          fullWidth
          disabled={rolesLoading}
          error={Boolean(errors.role_id)}
          helperText={errors.role_id || (rolesLoading ? 'Loading roles…' : 'Select the appropriate role')}
        >
          {roleOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          name="email"
          label="Email address"
          type="email"
          value={form.email}
          onChange={updateField('email')}
          required
          fullWidth
          error={Boolean(errors.email)}
          helperText={errors.email}
        />
        <TextField
          name="phone"
          label="Phone number"
          value={form.phone}
          onChange={updateField('phone')}
          fullWidth
          placeholder="60123456789"
          error={Boolean(errors.phone)}
          helperText={errors.phone}
        />
        <TextField
          name="address"
          label="Home address"
          value={form.address}
          onChange={updateField('address')}
          fullWidth
          multiline
          minRows={3}
          error={Boolean(errors.address)}
          helperText={errors.address}
        />
        <TextField
          name="password"
          label={isEdit ? 'New password' : 'Password'}
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={updateField('password')}
          required={!isEdit}
          fullWidth
          error={Boolean(errors.password)}
          helperText={errors.password || (isEdit ? 'Leave blank to keep the current password.' : 'Minimum 8 characters.')}
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

UserFormDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  mode: PropTypes.oneOf(['create', 'edit']),
  user: PropTypes.object,
  roleOptions: PropTypes.arrayOf(PropTypes.object),
  rolesLoading: PropTypes.bool,
  saving: PropTypes.bool,
  errors: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired
};
