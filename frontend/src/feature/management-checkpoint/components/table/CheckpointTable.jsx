import { Paper, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material';

import { TableBodySkeleton } from 'ui-component/table/TableBodySkeleton';
import { CheckpointTableHeader } from './CheckpointTableHeader';
import { CheckpointTableRow } from './CheckpointTableRow';

export function CheckpointTable({ checkpoints, hideZoneColumn = false, loading = false, rowsPerPage = 5, onView, onEdit, onDelete }) {
  const columnCount = hideZoneColumn ? 8 : 9;

  return (
    <Paper sx={{ width: '100%', mb: 2, borderRadius: 2, overflow: 'hidden' }} elevation={1}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: hideZoneColumn ? 860 : 960 }}>
          <CheckpointTableHeader hideZoneColumn={hideZoneColumn} />
          {loading ? (
            <TableBodySkeleton rowCount={rowsPerPage || 5} columnCount={columnCount} />
          ) : (
          <TableBody>
            {checkpoints.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columnCount} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No checkpoints found.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              checkpoints.map((checkpoint) => (
                <CheckpointTableRow
                  key={checkpoint.id}
                  checkpoint={checkpoint}
                  hideZoneColumn={hideZoneColumn}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            )}
          </TableBody>
          )}
        </Table>
      </TableContainer>
    </Paper>
  );
}
