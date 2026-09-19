import { TableHead, TableRow, TableCell } from '@mui/material';

export const ZoneTableHeader = () => {
  return (
    <TableHead sx={{ backgroundColor: 'secondary.light' }}>
      <TableRow>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          No
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }}>Name</TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Checkpoints Count
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Last Modified
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Action
        </TableCell>
      </TableRow>
    </TableHead>
  );
};
