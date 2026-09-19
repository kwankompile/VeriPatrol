import { Table, TableBody, TableContainer, Paper } from '@mui/material';
import { UserTableHeader } from './UserTableHeader';
import { UserTableRow } from './UserTableRow';
import { TableBodySkeleton } from 'ui-component/table/TableBodySkeleton';

/**
 * Reusable table component for displaying user data.
 * Handles the table layout and row rendering.
 */

export function UserTable({ users, page, rowsPerPage, loading = false, onView, onEdit, onDelete }) {
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
          <UserTableHeader />
          {loading ? (
            <TableBodySkeleton rowCount={rowsPerPage || 5} columnCount={6} />
          ) : (
            <TableBody>
              {users.map((user, index) => (
                <UserTableRow
                  key={user.id}
                  index={index}
                  user={user}
                  page={page}
                  rowsPerPage={rowsPerPage}
                  onView={() => onView(user.id)}
                  onEdit={() => onEdit(user.id)}
                  onDelete={() => onDelete(user.id)}
                />
              ))}
            </TableBody>
          )}
        </Table>
      </TableContainer>
    </Paper>
  );
}
