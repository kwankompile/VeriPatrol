import { TableRow, TableCell, IconButton, Box } from '@mui/material';
import { IconEye as ViewIcon } from '@tabler/icons-react';

export const PatrolTableRow = ({ patrol, onView, onEdit, onDelete }) => {
  // const malaysiaTime = new Intl.DateTimeFormat('en-MY', {
  //    timeZone: 'Asia/Kuala_Lumpur',
  //    dateStyle: 'medium',
  //    timeStyle: 'short'
  // }).format(new Date(patrol.updated_at));

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
      <TableCell align="center">{patrol.id}</TableCell>
      <TableCell>{patrol.name}</TableCell>
      <TableCell>{patrol.location.name}</TableCell>
      <TableCell align="center">{patrol.last_modified}</TableCell>
      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.25 }}>
          <IconButton color="info" size="small" aria-label="view" title="View Details" onClick={() => onView(patrol.id)}>
            <ViewIcon />
          </IconButton>
          {/* <IconButton color="warning" size="small" aria-label="edit" title="Edit Patrol" onClick={() => onEdit(patrol.id)}>
                  <EditIcon />
               </IconButton>
               <IconButton color="error" size="small" aria-label="delete" title="Delete Patrol" onClick={() => onDelete(patrol.id)}>
                  <DeleteIcon />
               </IconButton> */}
        </Box>
      </TableCell>
    </TableRow>
  );
};
