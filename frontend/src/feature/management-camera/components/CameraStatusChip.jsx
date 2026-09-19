import PropTypes from 'prop-types';
import { Chip } from '@mui/material';

export default function CameraStatusChip({ kind = 'active', value, size = 'small' }) {
  if (kind === 'credential') {
    const enabled = Boolean(value);
    return (
      <Chip
        label={enabled ? 'Enabled' : 'Disabled'}
        color={enabled ? 'success' : 'default'}
        size={size}
        variant="outlined"
      />
    );
  }

  if (kind === 'operational') {
    const label = value?.label ?? value ?? '—';
    const color = value?.color ?? 'default';
    return <Chip label={label} color={color} size={size} variant="outlined" />;
  }

  const active = Boolean(value);
  return (
    <Chip
      label={active ? 'Active' : 'Inactive'}
      color={active ? 'success' : 'default'}
      size={size}
      variant="outlined"
    />
  );
}

CameraStatusChip.propTypes = {
  kind: PropTypes.oneOf(['active', 'credential', 'operational']),
  value: PropTypes.oneOfType([PropTypes.bool, PropTypes.string, PropTypes.object]),
  size: PropTypes.oneOf(['small', 'medium'])
};
