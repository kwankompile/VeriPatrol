import { Chip } from '@mui/material';

const STATUS_COLORS = {
  success: 'success',
  failure: 'error',
  blocked: 'warning',
  revoked: 'default'
};

export default function AuthAuditStatusChip({ status }) {
  const color = STATUS_COLORS[status] || 'default';
  return <Chip size="small" label={status || 'unknown'} color={color} variant="outlined" />;
}
