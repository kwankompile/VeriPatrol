import { TableRow, TableCell, IconButton, Box } from '@mui/material';
import { IconEye as ViewIcon } from '@tabler/icons-react';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';

export const PatrolTableRow = ({ patrol, index, page, rowsPerPage, onView, onEdit, onDelete }) => {
  // Calculate human-readable row number
  const rowNumber = page * rowsPerPage + index + 1;
  console.log(patrol);

  return (
    <TableRow
      key={patrol.id}
      hover
      sx={{
        cursor: 'pointer',
        '&:hover': {
          backgroundColor: 'action.hover'
        }
      }}
    >
      <TableCell align="center">{rowNumber}</TableCell>
      <TableCell>{patrol.guard_user.full_name}</TableCell>
      <TableCell>{patrol.zone.name}</TableCell>
      <TableCell align="center">{patrol.status}</TableCell>
      <TableCell align="center">{<MalaysiaTime time={patrol.time_start} />}</TableCell>
      <TableCell align="center">{<MalaysiaTime time={patrol.time_end} />}</TableCell>

      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.25 }}>
          <IconButton color="info" size="small" aria-label="view" title="View Details" onClick={() => onView(patrol.id)}>
            <ViewIcon />
          </IconButton>
          {/* <IconButton color="warning" size="small" aria-label="edit" title="Edit Patrol" onClick={() => onEdit(patrol.id)}>
                  <EditIcon />
               </IconButton> */}
          {/* <IconButton color="error" size="small" aria-label="delete" title="Delete Patrol" onClick={() => onDelete(patrol.id)}>
                  <DeleteIcon />
               </IconButton> */}
        </Box>
      </TableCell>
    </TableRow>
  );
};
