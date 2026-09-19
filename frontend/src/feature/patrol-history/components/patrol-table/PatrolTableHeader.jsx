import { TableHead, TableRow, TableCell } from '@mui/material';

export const PatrolTableHeader = () => {
  return (
    <TableHead sx={{ backgroundColor: 'secondary.light' }}>
      <TableRow>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          No
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }}>Name</TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }}>Zone</TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Status
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Time Start
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Time End
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Action
        </TableCell>
      </TableRow>
    </TableHead>
  );
};
