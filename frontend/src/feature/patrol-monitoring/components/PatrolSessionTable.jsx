import PropTypes from 'prop-types';
import { Chip, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import { TableActionButtons } from 'ui-component/table/TableActionButtons';
import { TableBodySkeleton } from 'ui-component/table/TableBodySkeleton';
import { TableEmptyRow } from 'ui-component/table/TableEmptyRow';
import { standardTableHeadCellSx, standardTablePaperSx, standardTableRowSx } from 'ui-component/table/tableStyles';

import PatrolStatusChip from './PatrolStatusChip';

function attentionChipForSession(session, summary) {
  if (String(session?.status ?? '').toLowerCase() === 'active') {
    return { label: 'Active', color: 'success' };
  }
  if (!summary) return null;
  if (Number(summary.suspicious_checkpoints ?? 0) > 0) {
    return { label: 'Suspicious', color: 'error' };
  }
  const needsReview = Number(summary.needs_review_checkpoints ?? summary.uncertain_checkpoints ?? 0);
  if (needsReview > 0) {
    return { label: 'Needs review', color: 'warning' };
  }
  if (Number(summary.partial_checkpoints ?? 0) > 0) {
    return { label: 'Partial', color: 'info' };
  }
  if (Number(summary.missed_checkpoints ?? summary.rejected_checkpoints ?? 0) > 0) {
    return { label: 'Missed', color: 'default' };
  }
  return null;
}

export default function PatrolSessionTable({
  sessions,
  summariesBySessionId = {},
  page = 0,
  rowsPerPage = 10,
  loading = false,
  onViewDetails
}) {
  const columnCount = 10;

  return (
    <Paper sx={standardTablePaperSx} elevation={1}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 960 }}>
          <TableHead sx={{ backgroundColor: 'secondary.light' }}>
            <TableRow>
              <TableCell sx={standardTableHeadCellSx} align="center">
                No
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Guard</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Zone</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Started</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Ended</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Status
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Attention
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Confidence
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Completion
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Action
              </TableCell>
            </TableRow>
          </TableHead>
          {loading ? (
            <TableBodySkeleton rowCount={rowsPerPage} columnCount={columnCount} testId="patrol-session-table-skeleton" />
          ) : (
            <TableBody>
              {!sessions?.length ? (
                <TableEmptyRow colSpan={columnCount} message="No patrol sessions found." />
              ) : (
                sessions.map((session, index) => {
                const summary = summariesBySessionId[session.id];
                const attention = attentionChipForSession(session, summary);
                return (
                  <TableRow key={session.id} hover sx={standardTableRowSx}>
                    <TableCell align="center">{page * rowsPerPage + index + 1}</TableCell>
                    <TableCell>{session.user?.name ?? '—'}</TableCell>
                    <TableCell>{session.zone?.name ?? '—'}</TableCell>
                    <TableCell>
                      <MalaysiaTime time={session.started_at} />
                    </TableCell>
                    <TableCell>
                      <MalaysiaTime time={session.ended_at} />
                    </TableCell>
                    <TableCell align="center">
                      <PatrolStatusChip kind="patrol" value={session.status} />
                    </TableCell>
                    <TableCell align="center">
                      {attention ? <Chip size="small" label={attention.label} color={attention.color} /> : '—'}
                    </TableCell>
                    <TableCell align="center">
                      {summary?.confidence_level ? (
                        <PatrolStatusChip kind="confidence" value={summary.confidence_level} />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="center">
                      {summary?.completion_percentage != null ? `${summary.completion_percentage}%` : '—'}
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <TableActionButtons onView={() => onViewDetails(session.id)} viewLabel="View details" />
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

PatrolSessionTable.propTypes = {
  sessions: PropTypes.arrayOf(PropTypes.object),
  summariesBySessionId: PropTypes.object,
  page: PropTypes.number,
  rowsPerPage: PropTypes.number,
  loading: PropTypes.bool,
  onViewDetails: PropTypes.func.isRequired
};
