import { Table, TableBody, TableContainer, Paper } from '@mui/material';
import { PatrolTableHeader } from './PatrolTableHeader';
import { PatrolTableRow } from './PatrolTableRow';

/**
 * Reusable table component for displaying patrol data.
 * Handles the table layout and row rendering.
 */

export function PatrolTable({ patrols, page, rowsPerPage, onView, onEdit, onDelete }) {
  return (
    <Paper
      sx={{
        width: '100%',
        mb: 2,
        borderRadius: 2,
        overflow: 'hidden'
      }}
      elevation={1}
    >
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 700 }}>
          <PatrolTableHeader />
          <TableBody>
            {patrols.map((patrol, index) => (
              <PatrolTableRow
                key={patrol.id}
                patrol={patrol}
                index={index}
                page={page}
                rowsPerPage={rowsPerPage}
                onView={() => onView(patrol.id)}
                onEdit={() => onEdit(patrol.id)}
                onDelete={() => onDelete(patrol.id)}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
