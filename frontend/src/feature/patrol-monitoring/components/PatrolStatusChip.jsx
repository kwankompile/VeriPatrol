import PropTypes from 'prop-types';
import { Chip, Tooltip } from '@mui/material';

import { getCheckpointStatusTooltip, resolveCheckpointStatus } from '../utils/patrolStatusUtils';

const PATROL_STATUS = {
  active: { label: 'Active', color: 'info' },
  completed: { label: 'Completed', color: 'success' },
  aborted: { label: 'Aborted', color: 'error' }
};

const CONFIDENCE_LEVEL = {
  high: { label: 'High', color: 'success' },
  medium: { label: 'Medium', color: 'warning' },
  low: { label: 'Low', color: 'error' }
};

function resolveConfig(kind, value) {
  const key = String(value ?? '').toLowerCase();
  if (kind === 'patrol') return PATROL_STATUS[key] ?? { label: value || 'Unknown', color: 'default' };
  if (kind === 'checkpoint') return resolveCheckpointStatus(key);
  if (kind === 'confidence') return CONFIDENCE_LEVEL[key] ?? { label: value || '—', color: 'default' };
  return { label: value || '—', color: 'default' };
}

export default function PatrolStatusChip({ kind = 'patrol', value, size = 'small' }) {
  const config = resolveConfig(kind, value);
  const tooltipTitle = kind === 'checkpoint' ? getCheckpointStatusTooltip(value) : undefined;

  const chip = (
    <Chip
      label={config.label}
      color={config.color}
      size={size}
      variant="outlined"
      data-testid={kind === 'checkpoint' ? 'checkpoint-status-chip' : undefined}
    />
  );

  if (tooltipTitle) {
    return (
      <Tooltip title={tooltipTitle} arrow describeChild>
        <span>{chip}</span>
      </Tooltip>
    );
  }

  return chip;
}

PatrolStatusChip.propTypes = {
  kind: PropTypes.oneOf(['patrol', 'checkpoint', 'confidence']),
  value: PropTypes.string,
  size: PropTypes.oneOf(['small', 'medium'])
};
