import PropTypes from 'prop-types';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { TableActionButtons } from 'ui-component/table/TableActionButtons';
import { TableEmptyRow } from 'ui-component/table/TableEmptyRow';
import { TableBodySkeleton } from 'ui-component/table/TableBodySkeleton';
import { standardTableHeadCellSx, standardTablePaperSx, standardTableRowSx } from 'ui-component/table/tableStyles';

import VehicleStatusChip from './VehicleStatusChip';

export default function VehicleTable({ vehicles, page = 0, rowsPerPage = 10, loading = false, onView, onEdit }) {
  return (
    <Paper sx={standardTablePaperSx} elevation={1}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 960 }}>
          <TableHead sx={{ backgroundColor: 'secondary.light' }}>
            <TableRow>
              <TableCell sx={standardTableHeadCellSx} align="center">
                No
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Plate number</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Owner name</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Vehicle type</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Status
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Source
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Notes</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Created
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Updated
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Action
              </TableCell>
            </TableRow>
          </TableHead>
          {loading ? (
            <TableBodySkeleton rowCount={rowsPerPage || 5} columnCount={10} />
          ) : (
          <TableBody>
            {!vehicles.length ? (
              <TableEmptyRow colSpan={10} message="No vehicle records found." />
            ) : (
              vehicles.map((vehicle, index) => (
                <TableRow key={vehicle.id} hover sx={standardTableRowSx}>
                  <TableCell align="center">{page * rowsPerPage + index + 1}</TableCell>
                  <TableCell>
                    <Typography variant="subtitle2">{vehicle.plateNumber}</Typography>
                  </TableCell>
                  <TableCell>{vehicle.ownerName ?? '—'}</TableCell>
                  <TableCell>{vehicle.vehicleType ?? '—'}</TableCell>
                  <TableCell align="center">
                    <VehicleStatusChip kind="status" value={vehicle.status} />
                  </TableCell>
                  <TableCell align="center">
                    <VehicleStatusChip kind="source" value={vehicle.source} />
                  </TableCell>
                  <TableCell>{vehicle.notesSummary}</TableCell>
                  <TableCell align="center">{vehicle.formattedCreatedAt}</TableCell>
                  <TableCell align="center">{vehicle.formattedUpdatedAt}</TableCell>
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <TableActionButtons
                      onView={() => onView(vehicle.id)}
                      onEdit={() => onEdit(vehicle)}
                      viewLabel="View vehicle"
                      editLabel="Edit vehicle"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          )}
        </Table>
      </TableContainer>
    </Paper>
  );
}

VehicleTable.propTypes = {
  vehicles: PropTypes.arrayOf(PropTypes.object).isRequired,
  page: PropTypes.number,
  rowsPerPage: PropTypes.number,
  loading: PropTypes.bool,
  onView: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired
};
