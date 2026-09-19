import { TableCell, TableHead, TableRow } from '@mui/material';

export function CheckpointTableHeader({ hideZoneColumn = false }) {
  return (
    <TableHead sx={{ backgroundColor: 'secondary.light' }}>
      <TableRow>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }}>Name</TableCell>
        {!hideZoneColumn ? <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }}>Zone</TableCell> : null}
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Type
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Radius (m)
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Status
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Latitude
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Longitude
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Updated
        </TableCell>
        <TableCell sx={{ color: 'secondary.dark', fontWeight: 600, py: 1.5 }} align="center">
          Actions
        </TableCell>
      </TableRow>
    </TableHead>
  );
}
