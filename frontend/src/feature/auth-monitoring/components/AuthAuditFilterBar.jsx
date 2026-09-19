import { Grid, MenuItem, TextField } from '@mui/material';

const ACTION_OPTIONS = [
  { value: 'all', label: 'All actions' },
  { value: 'login_password_success', label: 'Login password success' },
  { value: 'login_password_failure', label: 'Login password failure' },
  { value: 'login_rate_limited', label: 'Login rate limited' },
  { value: 'otp_success', label: 'OTP success' },
  { value: 'otp_failure', label: 'OTP failure' },
  { value: 'refresh_success', label: 'Refresh success' },
  { value: 'refresh_failure', label: 'Refresh failure' },
  { value: 'logout_success', label: 'Logout success' },
  { value: 'session_revoked', label: 'Session revoked' },
  { value: 'profile_updated', label: 'Profile updated' },
  { value: 'profile_update_failed', label: 'Profile update failed' },
  { value: 'profile_picture_uploaded', label: 'Profile picture uploaded' },
  { value: 'profile_picture_removed', label: 'Profile picture removed' },
  { value: 'password_changed', label: 'Password changed' },
  { value: 'password_change_failed', label: 'Password change failed' },
  { value: 'email_change_started', label: 'Email change started' },
  { value: 'email_changed', label: 'Email changed' },
  { value: 'email_change_failed', label: 'Email change failed' },
  { value: 'two_factor_reconfigure_started', label: '2FA reconfigure started' },
  { value: 'two_factor_reconfigured', label: '2FA reconfigured' },
  { value: 'two_factor_reconfigure_failed', label: '2FA reconfigure failed' }
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'revoked', label: 'Revoked' }
];

export { ACTION_OPTIONS, STATUS_OPTIONS };

export default function AuthAuditFilterBar({ filters, onChange }) {
  const handleChange = (field) => (event) => {
    onChange({ ...filters, [field]: event.target.value });
  };

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={3}>
        <TextField select fullWidth label="Action" value={filters.action} onChange={handleChange('action')}>
          {ACTION_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid item xs={12} md={2}>
        <TextField select fullWidth label="Status" value={filters.status} onChange={handleChange('status')}>
          {STATUS_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid item xs={12} md={3}>
        <TextField fullWidth label="Email" value={filters.email} onChange={handleChange('email')} />
      </Grid>
      <Grid item xs={12} md={2}>
        <TextField
          fullWidth
          type="date"
          label="From"
          InputLabelProps={{ shrink: true }}
          value={filters.dateFrom}
          onChange={handleChange('dateFrom')}
        />
      </Grid>
      <Grid item xs={12} md={2}>
        <TextField
          fullWidth
          type="date"
          label="To"
          InputLabelProps={{ shrink: true }}
          value={filters.dateTo}
          onChange={handleChange('dateTo')}
        />
      </Grid>
    </Grid>
  );
}
