import { TableRow, TableCell } from '@mui/material';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import { TableActionButtons } from 'ui-component/table/TableActionButtons';

export const UserTableRow = ({ user, index, page, rowsPerPage, onView, onEdit, onDelete }) => {
  const rowNumber = page * rowsPerPage + index + 1;
  const displayTimestamp = user?.updated_at ?? user?.created_at ?? user?.email_verified_at ?? null;

  return (
    <TableRow
      hover
      sx={{
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: 'action.hover'
        }
      }}
    >
      <TableCell align="center">{rowNumber}</TableCell>
      <TableCell>{user.name}</TableCell>
      <TableCell>{user.phone || '—'}</TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell align="center">
        <MalaysiaTime time={displayTimestamp} fallback="N/A" />
      </TableCell>
      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
        <TableActionButtons
          onView={() => onView(user.id)}
          onEdit={() => onEdit(user.id)}
          onDelete={() => onDelete(user.id)}
          viewLabel="View Details"
          editLabel="Edit User"
          deleteLabel="Delete User"
        />
      </TableCell>
    </TableRow>
  );
};
