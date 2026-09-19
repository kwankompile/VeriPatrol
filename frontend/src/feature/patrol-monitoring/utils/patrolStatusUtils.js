/**
 * M8 checkpoint status labels, colors, and tooltip help text.
 * Legacy `uncertain` → Needs review, `rejected` → Missed.
 */
const CHECKPOINT_STATUS_CONFIG = {
  verified: { label: 'Verified', color: 'success', mapColor: '#22c55e' },
  partial: { label: 'Partial', color: 'info', mapColor: '#38bdf8' },
  needs_review: { label: 'Needs review', color: 'warning', mapColor: '#eab308' },
  suspicious: { label: 'Suspicious', color: 'error', mapColor: '#f97316' },
  missed: { label: 'Missed', color: 'default', mapColor: '#ef4444' },
  pending: { label: 'Pending', color: 'default', mapColor: '#9ca3af' },
  uncertain: { label: 'Needs review', color: 'warning', mapColor: '#eab308' },
  rejected: { label: 'Missed', color: 'default', mapColor: '#ef4444' }
};

export const CHECKPOINT_STATUS_HELP = Object.freeze({
  verified: {
    label: 'Verified',
    description:
      'Strong checkpoint evidence. The guard reached the checkpoint with high confidence and no meaningful anomaly.'
  },
  partial: {
    label: 'Partial',
    description:
      'Some valid checkpoint evidence exists, but it is incomplete or not strong enough to be fully verified.'
  },
  needs_review: {
    label: 'Needs review',
    description:
      'Weak or uncertain evidence. This is not proof of misconduct; an operator should inspect the route, GPS accuracy, timing, and anomaly notes.'
  },
  suspicious: {
    label: 'Suspicious',
    description:
      'Strong anomaly signals were detected, such as severe route deviation, impossible movement, GPS jump, or integrity concerns.'
  },
  missed: {
    label: 'Missed',
    description:
      'No usable checkpoint evidence was found, or confidence was too low to confirm the checkpoint visit.'
  },
  pending: {
    label: 'Pending',
    description:
      'Checkpoint has not been fully validated yet, or the final validation result has not been assigned.'
  }
});

const UNKNOWN_STATUS_TOOLTIP =
  'This status is not recognized by the current UI. Refresh data or contact an administrator if it persists.';

const LEGACY_STATUS_ALIASES = Object.freeze({
  uncertain: 'needs_review',
  rejected: 'missed'
});

function normalizeStatusKey(status) {
  return String(status ?? '').toLowerCase();
}

function resolveHelpKey(status) {
  const key = normalizeStatusKey(status);
  return LEGACY_STATUS_ALIASES[key] ?? key;
}

export function resolveCheckpointStatus(status) {
  const key = normalizeStatusKey(status);
  return CHECKPOINT_STATUS_CONFIG[key] ?? { label: status || 'Unknown', color: 'default', mapColor: '#9ca3af' };
}

export function checkpointMapColor(status) {
  return resolveCheckpointStatus(status).mapColor;
}

export function getCheckpointStatusLabel(status) {
  return resolveCheckpointStatus(status).label;
}

export function getCheckpointStatusTooltip(status) {
  const helpKey = resolveHelpKey(status);
  const help = CHECKPOINT_STATUS_HELP[helpKey];
  if (help) return help.description;
  return UNKNOWN_STATUS_TOOLTIP;
}

export const M8_CHECKPOINT_STATUSES = ['verified', 'partial', 'needs_review', 'suspicious', 'missed', 'pending'];
