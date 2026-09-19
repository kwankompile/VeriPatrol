import PropTypes from 'prop-types';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import { TableBodySkeleton } from 'ui-component/table/TableBodySkeleton';
import { TableEmptyRow } from 'ui-component/table/TableEmptyRow';
import { standardTableHeadCellSx, standardTablePaperSx, standardTableRowSx } from 'ui-component/table/tableStyles';

import AuthAuditStatusChip from './AuthAuditStatusChip';

const COLUMN_COUNT = 7;

const summarizeUserAgent = (userAgent) => {
  if (!userAgent) return '—';
  return userAgent.length > 48 ? `${userAgent.slice(0, 48)}…` : userAgent;
};

const summarizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') return '—';
  const entries = Object.entries(metadata).slice(0, 3);
  if (entries.length === 0) return '—';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(', ');
};

export default function AuthAuditLogTable({ logs, loading = false, rowsPerPage = 10 }) {
  return (
    <Paper sx={standardTablePaperSx} elevation={1}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 960 }} size="small">
          <TableHead sx={{ backgroundColor: 'secondary.light' }}>
            <TableRow>
              <TableCell sx={standardTableHeadCellSx}>Time</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Action</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Status
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>User / Email</TableCell>
              <TableCell sx={standardTableHeadCellSx}>IP</TableCell>
              <TableCell sx={standardTableHeadCellSx}>User Agent</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Metadata</TableCell>
            </TableRow>
          </TableHead>
          {loading ? (
            <TableBodySkeleton rowCount={rowsPerPage} columnCount={COLUMN_COUNT} testId="auth-audit-table-skeleton" />
          ) : (
            <TableBody>
              {!logs.length ? (
                <TableEmptyRow colSpan={COLUMN_COUNT} message="No audit logs found." />
              ) : (
                logs.map((log) => (
                  <TableRow key={log.id} hover sx={standardTableRowSx}>
                    <TableCell>
                      <MalaysiaTime time={log.occurred_at || log.created_at} />
                    </TableCell>
                    <TableCell>{log.action || log.event_type}</TableCell>
                    <TableCell align="center">
                      <AuthAuditStatusChip status={log.status} />
                    </TableCell>
                    <TableCell>{log.user?.email || log.email || '—'}</TableCell>
                    <TableCell>{log.ip_address || '—'}</TableCell>
                    <TableCell>{summarizeUserAgent(log.user_agent)}</TableCell>
                    <TableCell>{summarizeMetadata(log.metadata)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </TableContainer>
    </Paper>
  );
}

AuthAuditLogTable.propTypes = {
  logs: PropTypes.arrayOf(PropTypes.object).isRequired,
  loading: PropTypes.bool,
  rowsPerPage: PropTypes.number
};
