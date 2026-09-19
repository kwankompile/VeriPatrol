import PropTypes from 'prop-types';
import { Button, Drawer, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';

const STATUS_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'whitelist', label: 'Whitelist' }
];

export default function VehicleEditDrawer({ open, vehicle, saving, errors = {}, onClose, onSave }) {
  const handleSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSave({
      ownerName: formData.get('ownerName'),
      vehicleType: formData.get('vehicleType'),
      status: formData.get('status'),
      notes: formData.get('notes')
    });
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 420 }, p: 3 } }}>
      <Typography variant="h4" gutterBottom>
        Edit vehicle
      </Typography>

      {vehicle ? (
        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <TextField label="Plate number" value={vehicle.plateNumber} disabled fullWidth />
          <TextField label="Source" value={vehicle.sourceLabel} disabled fullWidth />
          <TextField
            name="ownerName"
            label="Owner name"
            defaultValue={vehicle.ownerName ?? ''}
            fullWidth
            error={Boolean(errors.owner_name)}
            helperText={errors.owner_name}
          />
          <TextField
            name="vehicleType"
            label="Vehicle type"
            defaultValue={vehicle.vehicleType ?? ''}
            fullWidth
            error={Boolean(errors.vehicle_type)}
            helperText={errors.vehicle_type}
          />
          <FormControl fullWidth error={Boolean(errors.status)}>
            <InputLabel>Status</InputLabel>
            <Select name="status" label="Status" defaultValue={vehicle.status ?? 'normal'}>
              {STATUS_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
            {errors.status ? (
              <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
                {errors.status}
              </Typography>
            ) : null}
          </FormControl>
          <TextField
            name="notes"
            label="Notes"
            defaultValue={vehicle.notes ?? ''}
            fullWidth
            multiline
            minRows={3}
            error={Boolean(errors.notes)}
            helperText={errors.notes}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button variant="outlined" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Drawer>
  );
}

VehicleEditDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  vehicle: PropTypes.object,
  saving: PropTypes.bool,
  errors: PropTypes.object,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired
};
