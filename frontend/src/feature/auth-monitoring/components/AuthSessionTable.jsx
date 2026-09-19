import PropTypes from 'prop-types';
import { Button, Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import { TableBodySkeleton } from 'ui-component/table/TableBodySkeleton';
import { TableEmptyRow } from 'ui-component/table/TableEmptyRow';
import { standardTableHeadCellSx, standardTablePaperSx, standardTableRowSx } from 'ui-component/table/tableStyles';

const summarizeUserAgent = (userAgent) => {
  if (!userAgent) return '—';
  return userAgent.length > 48 ? `${userAgent.slice(0, 48)}…` : userAgent;
};

export default function AuthSessionTable({
  sessions,
  revokingId,
  onRevoke,
  showUserColumn = true,
  revokeDisabled = false,
  loading = false,
  rowsPerPage = 10
}) {
  const columnCount = showUserColumn ? 8 : 7;

  return (
    <Paper sx={standardTablePaperSx} elevation={1}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 960 }} size="small">
          <TableHead sx={{ backgroundColor: 'secondary.light' }}>
            <TableRow>
              {showUserColumn ? <TableCell sx={standardTableHeadCellSx}>User</TableCell> : null}
              <TableCell sx={standardTableHeadCellSx}>IP</TableCell>
              <TableCell sx={standardTableHeadCellSx}>User Agent</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Created</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Last Used</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Expires</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Status
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="right">
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          {loading ? (
            <TableBodySkeleton rowCount={rowsPerPage} columnCount={columnCount} testId="auth-session-table-skeleton" />
          ) : (
            <TableBody>
              {!sessions.length ? (
                <TableEmptyRow colSpan={columnCount} message="No active sessions found." />
              ) : (
                sessions.map((session) => {
                  const statusLabel = session.is_active
                    ? 'active'
                    : session.revoked_at
                      ? 'revoked'
                      : session.rotated_at
                        ? 'rotated'
                        : 'inactive';

                  return (
                    <TableRow key={session.id} hover sx={standardTableRowSx}>
                      {showUserColumn ? <TableCell>{session.user?.email || '—'}</TableCell> : null}
                      <TableCell>{session.ip_address || '—'}</TableCell>
                      <TableCell>{summarizeUserAgent(session.user_agent)}</TableCell>
                      <TableCell>
                        <MalaysiaTime time={session.created_at} />
                      </TableCell>
                      <TableCell>
                        <MalaysiaTime time={session.last_used_at} />
                      </TableCell>
                      <TableCell>
                        <MalaysiaTime time={session.expires_at} />
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={session.is_current ? `${statusLabel} (current)` : statusLabel}
                          variant="outlined"
                          color={session.is_active ? 'success' : 'default'}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {session.is_active ? (
                          <Button
                            size="small"
                            color="error"
                            disabled={revokeDisabled || revokingId === session.id}
                            onClick={() => onRevoke(session.id)}
                          >
                            Revoke
                          </Button>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          )}
        </Table>
      </TableContainer>
    </Paper>
  );
}

AuthSessionTable.propTypes = {
  sessions: PropTypes.arrayOf(PropTypes.object).isRequired,
  revokingId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onRevoke: PropTypes.func.isRequired,
  showUserColumn: PropTypes.bool,
  revokeDisabled: PropTypes.bool,
  loading: PropTypes.bool,
  rowsPerPage: PropTypes.number
};
