import { TableCell, TableRow } from '@mui/material';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import { TableActionButtons } from 'ui-component/table/TableActionButtons';
import CheckpointLocationTypeChip from '../CheckpointLocationTypeChip';
import CheckpointStatusChip from '../CheckpointStatusChip';

export function CheckpointTableRow({ checkpoint, hideZoneColumn = false, onView, onEdit, onDelete }) {
  const zoneName = checkpoint.zone?.name ?? checkpoint.zone_name ?? '—';

  return (
    <TableRow hover>
      <TableCell>{checkpoint.name}</TableCell>
      {!hideZoneColumn ? <TableCell>{zoneName}</TableCell> : null}
      <TableCell align="center">
        <CheckpointLocationTypeChip locationType={checkpoint.location_type} />
      </TableCell>
      <TableCell align="center">{checkpoint.radius ?? '—'}</TableCell>
      <TableCell align="center">
        <CheckpointStatusChip isActive={checkpoint.is_active !== false} />
      </TableCell>
      <TableCell align="center">{checkpoint.latitude}</TableCell>
      <TableCell align="center">{checkpoint.longitude}</TableCell>
      <TableCell align="center">{checkpoint.updated_at ? <MalaysiaTime time={checkpoint.updated_at} /> : '—'}</TableCell>
      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
        <TableActionButtons
          onView={() => onView(checkpoint.id)}
          onEdit={() => onEdit(checkpoint.id)}
          onDelete={() => onDelete(checkpoint.id)}
          viewLabel="View checkpoint"
          editLabel="Edit checkpoint"
          deleteLabel="Delete checkpoint"
        />
      </TableCell>
    </TableRow>
  );
}
