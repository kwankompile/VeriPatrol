import PropTypes from 'prop-types';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { TableActionButtons } from 'ui-component/table/TableActionButtons';
import { TableBodySkeleton } from 'ui-component/table/TableBodySkeleton';
import { standardTableHeadCellSx, standardTablePaperSx, standardTableRowSx } from 'ui-component/table/tableStyles';

import CameraStatusChip from './CameraStatusChip';

export default function CameraTable({
  cameras,
  page = 0,
  rowsPerPage = 10,
  deletingId = null,
  loading = false,
  onView,
  onEdit,
  onDelete
}) {
  return (
    <Paper sx={standardTablePaperSx} elevation={1}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 1100 }}>
          <TableHead sx={{ backgroundColor: 'secondary.light' }}>
            <TableRow>
              <TableCell sx={standardTableHeadCellSx} align="center">
                No
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Name</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Email</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Credential
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Status
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Operational
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Last login</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Last seen</TableCell>
              <TableCell sx={standardTableHeadCellSx}>RTSP (masked)</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Action
              </TableCell>
            </TableRow>
          </TableHead>
          {loading ? (
            <TableBodySkeleton rowCount={rowsPerPage || 5} columnCount={10} />
          ) : (
          <TableBody>
            {cameras.map((camera, index) => (
              <TableRow key={camera.id} hover sx={standardTableRowSx}>
                <TableCell align="center">{page * rowsPerPage + index + 1}</TableCell>
                <TableCell>
                  <Typography variant="subtitle2">{camera.name}</Typography>
                  {camera.location ? (
                    <Typography variant="caption" color="text.secondary" display="block">
                      {camera.location}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>{camera.email}</TableCell>
                <TableCell align="center">
                  <CameraStatusChip kind="credential" value={camera.credentialEnabled} />
                </TableCell>
                <TableCell align="center">
                  <CameraStatusChip kind="active" value={camera.isActive} />
                </TableCell>
                <TableCell align="center">
                  <CameraStatusChip
                    kind="operational"
                    value={{ label: camera.operationalStatusLabel, color: camera.operationalStatusColor }}
                  />
                </TableCell>
                <TableCell>{camera.formattedLastLoginAt}</TableCell>
                <TableCell>{camera.formattedLastSeenAt}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {camera.rtspUrlMasked}
                  </Typography>
                </TableCell>
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                  <TableActionButtons
                    onView={() => onView(camera)}
                    onEdit={() => onEdit(camera)}
                    onDelete={onDelete ? () => onDelete(camera) : undefined}
                    viewLabel="View camera"
                    editLabel="Edit camera"
                    deleteLabel={deletingId === camera.id ? 'Deleting…' : 'Delete camera'}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          )}
        </Table>
      </TableContainer>
    </Paper>
  );
}

CameraTable.propTypes = {
  cameras: PropTypes.arrayOf(PropTypes.object).isRequired,
  page: PropTypes.number,
  rowsPerPage: PropTypes.number,
  deletingId: PropTypes.string,
  loading: PropTypes.bool,
  onView: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func
};
