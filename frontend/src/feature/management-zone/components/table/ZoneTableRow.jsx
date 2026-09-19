import { TableRow, TableCell } from '@mui/material';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import { TableActionButtons } from 'ui-component/table/TableActionButtons';

export const ZoneTableRow = ({ zone, index, page, rowsPerPage, onView, onEdit, onDelete }) => {
  const rowNumber = page * rowsPerPage + index + 1;

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
      <TableCell>{zone.name}</TableCell>
      <TableCell align="center">{zone.checkpoints_count}</TableCell>
      <TableCell align="center">{<MalaysiaTime time={zone.updated_at} />}</TableCell>
      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
        <TableActionButtons
          onView={() => onView(zone.id)}
          onEdit={() => onEdit(zone.id)}
          onDelete={() => onDelete(zone.id)}
          viewLabel="View Details"
          editLabel="Edit Zone"
          deleteLabel="Delete Zone"
        />
      </TableCell>
    </TableRow>
  );
};
