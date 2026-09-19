import PropTypes from 'prop-types';
import { Chip } from '@mui/material';

const VALIDITY_CONFIG = {
  valid: { label: 'Valid', color: 'success' },
  invalid: { label: 'Invalid', color: 'error' }
};

const FLAGGED_CONFIG = {
  flagged: { label: 'Flagged', color: 'warning' },
  unflagged: { label: 'Not flagged', color: 'default' }
};

const EVIDENCE_CONFIG = {
  available: { label: 'Evidence', color: 'info' },
  missing: { label: 'No evidence', color: 'default' }
};

const BLOCKCHAIN_CONFIG = {
  pending: { label: 'Pending', color: 'default' },
  queued: { label: 'Queued', color: 'info' },
  processing: { label: 'Processing', color: 'info' },
  submitted: { label: 'Submitted', color: 'warning' },
  confirmed: { label: 'Confirmed', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  unknown: { label: 'Unknown', color: 'default' }
};

function resolveConfig(kind, value) {
  const key = String(value ?? '').toLowerCase();

  if (kind === 'validity') {
    return VALIDITY_CONFIG[key] ?? { label: value || '—', color: 'default' };
  }
  if (kind === 'flagged') {
    return FLAGGED_CONFIG[key] ?? { label: value || '—', color: 'default' };
  }
  if (kind === 'evidence') {
    return EVIDENCE_CONFIG[key] ?? { label: value || '—', color: 'default' };
  }
  if (kind === 'blockchain') {
    return BLOCKCHAIN_CONFIG[key] ?? { label: value || 'Unknown', color: 'default' };
  }

  return { label: value || '—', color: 'default' };
}

export default function AnprStatusChip({ kind = 'validity', value, size = 'small' }) {
  const config = resolveConfig(kind, value);
  return <Chip label={config.label} color={config.color} size={size} variant="outlined" />;
}

AnprStatusChip.propTypes = {
  kind: PropTypes.oneOf(['validity', 'flagged', 'evidence', 'blockchain']),
  value: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium'])
};
