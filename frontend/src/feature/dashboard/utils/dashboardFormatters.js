import { ROLES } from 'utils/auth';

export function formatDashboardTimestamp(value, timezone = 'Asia/Kuala_Lumpur') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function formatLastUpdated(value, timezone = 'Asia/Kuala_Lumpur') {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone
    }).formatToParts(date);
    const lookup = (type) => parts.find((part) => part.type === type)?.value ?? '';
    return `${lookup('day')} ${lookup('month')} ${lookup('year')}, ${lookup('hour')}:${lookup('minute')}`;
  } catch {
    return date.toLocaleString();
  }
}

export function formatConfidence(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return `${(num * 100).toFixed(1)}%`;
}

export function formatPatrolStatusLabel(status) {
  if (!status) return 'Unknown';
  return String(status)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function roleWelcomeTitle(role) {
  switch (role) {
    case ROLES.ADMIN:
      return 'Administrator Dashboard';
    case ROLES.SECURITY_OPERATOR:
      return 'Operator Dashboard';
    case ROLES.GUARD:
      return 'Guard Dashboard';
    default:
      return 'Dashboard';
  }
}

export function roleWelcomeSubtitle(role) {
  switch (role) {
    case ROLES.ADMIN:
    case ROLES.SECURITY_OPERATOR:
      return 'System-wide operational overview with patrol, ANPR, camera, blockchain, and auth health.';
    case ROLES.GUARD:
      return 'Your patrol status, readiness, and offline sync health.';
    default:
      return 'Operational summary for your role.';
  }
}

export function formatVehicleType(value) {
  if (!value) return null;
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const ANPR_STATUS_META = {
  flagged: { label: 'Flagged', color: 'error' },
  valid: { label: 'Valid', color: 'success' },
  invalid: { label: 'Invalid', color: 'warning' },
  unknown: { label: 'Unknown', color: 'default' }
};

export function anprStatusMeta(status) {
  return ANPR_STATUS_META[status] ?? ANPR_STATUS_META.unknown;
}

const AUTH_SEVERITY_META = {
  high: { label: 'High', color: 'error' },
  medium: { label: 'Medium', color: 'warning' },
  low: { label: 'Low', color: 'default' }
};

export function authSeverityMeta(severity) {
  return AUTH_SEVERITY_META[severity] ?? AUTH_SEVERITY_META.medium;
}

export function formatAuthEventLabel(eventType) {
  if (!eventType) return 'Security event';
  return String(eventType)
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function guardTodayStatusLabel(status) {
  switch (status) {
    case 'active':
      return 'Patrol in progress';
    case 'completed':
      return 'Patrol completed today';
    case 'aborted':
      return 'Patrol aborted today';
    case 'needs_review':
      return 'Needs review';
    case 'not_started':
      return 'No patrol started today';
    default:
      return formatPatrolStatusLabel(status);
  }
}

export function guardTodayStatusColor(status) {
  switch (status) {
    case 'active':
      return 'secondary';
    case 'completed':
      return 'success';
    case 'aborted':
      return 'error';
    case 'needs_review':
      return 'warning';
    case 'not_started':
    default:
      return 'default';
  }
}
