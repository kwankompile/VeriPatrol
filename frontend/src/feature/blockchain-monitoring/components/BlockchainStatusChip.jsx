import PropTypes from 'prop-types';
import { Chip } from '@mui/material';

const RECORD_STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'default' },
  queued: { label: 'Queued', color: 'info' },
  processing: { label: 'Processing', color: 'info' },
  submitted: { label: 'Submitted', color: 'warning' },
  confirmed: { label: 'Confirmed', color: 'success' },
  failed: { label: 'Failed', color: 'error' }
};

const JOB_STATUS_CONFIG = {
  queued: { label: 'Queued', color: 'info' },
  processing: { label: 'Processing', color: 'info' },
  success: { label: 'Success', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  cancelled: { label: 'Cancelled', color: 'default' }
};

const VERIFICATION_RESULT_CONFIG = {
  valid: { label: 'Valid', color: 'success' },
  tampered: { label: 'Tampered', color: 'error' },
  pending: { label: 'Pending', color: 'default' },
  failed: { label: 'Failed', color: 'error' },
  onchain_missing: { label: 'On-chain Missing', color: 'warning' }
};

const formatFallbackLabel = (value) => {
  if (value === null || value === undefined || value === '') return 'Unknown';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

function resolveConfig(kind, value) {
  const key = String(value ?? '').toLowerCase();

  if (kind === 'job') {
    return JOB_STATUS_CONFIG[key] ?? { label: formatFallbackLabel(value), color: 'default' };
  }
  if (kind === 'verification') {
    return VERIFICATION_RESULT_CONFIG[key] ?? { label: formatFallbackLabel(value), color: 'default' };
  }

  return RECORD_STATUS_CONFIG[key] ?? { label: formatFallbackLabel(value), color: 'default' };
}

export default function BlockchainStatusChip({ kind = 'record', value, size = 'small' }) {
  const config = resolveConfig(kind, value);
  return <Chip label={config.label} color={config.color} size={size} variant="outlined" />;
}

BlockchainStatusChip.propTypes = {
  kind: PropTypes.oneOf(['record', 'job', 'verification']),
  value: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium'])
};
