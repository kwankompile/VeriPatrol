import PropTypes from 'prop-types';
import { Chip } from '@mui/material';

const STATUS_CONFIG = {
  normal: { label: 'Normal', color: 'default' },
  flagged: { label: 'Flagged', color: 'warning' },
  whitelist: { label: 'Whitelist', color: 'success' }
};

const SOURCE_CONFIG = {
  manual: { label: 'Manual', color: 'info' },
  auto_detected: { label: 'Auto-detected', color: 'default' }
};

export default function VehicleStatusChip({ kind = 'status', value, size = 'small' }) {
  const key = String(value ?? '').toLowerCase();
  const config =
    kind === 'source'
      ? (SOURCE_CONFIG[key] ?? { label: value || '—', color: 'default' })
      : (STATUS_CONFIG[key] ?? { label: value || '—', color: 'default' });

  return <Chip label={config.label} color={config.color} size={size} variant="outlined" />;
}

VehicleStatusChip.propTypes = {
  kind: PropTypes.oneOf(['status', 'source']),
  value: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium'])
};
