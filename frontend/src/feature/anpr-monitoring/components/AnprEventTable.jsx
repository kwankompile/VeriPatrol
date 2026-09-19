import PropTypes from 'prop-types';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import { TableActionButtons } from 'ui-component/table/TableActionButtons';
import { TableBodySkeleton } from 'ui-component/table/TableBodySkeleton';
import { TableEmptyRow } from 'ui-component/table/TableEmptyRow';
import { standardTableHeadCellSx, standardTablePaperSx, standardTableRowSx } from 'ui-component/table/tableStyles';

import AnprStatusChip from './AnprStatusChip';

const COLUMN_COUNT = 9;

export default function AnprEventTable({
  events,
  highlightedEventIds = [],
  page = 0,
  rowsPerPage = 10,
  loading = false,
  onViewDetails
}) {
  const highlightSet = new Set(highlightedEventIds);

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
              <TableCell sx={standardTableHeadCellSx} align="center">
                Confidence
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Detection time</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Camera</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Valid
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Flagged
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Evidence
              </TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Action
              </TableCell>
            </TableRow>
          </TableHead>
          {loading ? (
            <TableBodySkeleton rowCount={rowsPerPage} columnCount={COLUMN_COUNT} testId="anpr-event-table-skeleton" />
          ) : (
            <TableBody>
              {!events.length ? (
                <TableEmptyRow colSpan={COLUMN_COUNT} message="No ANPR detections found." />
              ) : (
                events.map((event, index) => (
                  <TableRow
                    key={event.id}
                    hover
                    sx={{
                      ...standardTableRowSx,
                      transition: 'background-color 0.4s ease',
                      ...(highlightSet.has(event.id)
                        ? {
                            bgcolor: 'action.selected',
                            '&:hover': { bgcolor: 'action.selected' }
                          }
                        : {})
                    }}
                  >
                    <TableCell align="center">{page * rowsPerPage + index + 1}</TableCell>
                    <TableCell>
                      <Typography variant="subtitle2">{event.plateNumber}</Typography>
                    </TableCell>
                    <TableCell align="center">{event.confidencePercent}</TableCell>
                    <TableCell>
                      <MalaysiaTime time={event.detectionTime} />
                    </TableCell>
                    <TableCell>{event.camera?.name ?? '—'}</TableCell>
                    <TableCell align="center">
                      <AnprStatusChip kind="validity" value={event.isValid ? 'valid' : 'invalid'} />
                    </TableCell>
                    <TableCell align="center">
                      <AnprStatusChip kind="flagged" value={event.isFlagged ? 'flagged' : 'unflagged'} />
                    </TableCell>
                    <TableCell align="center">
                      <AnprStatusChip kind="evidence" value={event.hasEvidence ? 'available' : 'missing'} />
                      {event.hasEvidence ? (
                        <Typography variant="caption" display="block" color="text.secondary">
                          {event.evidenceCount} image{event.evidenceCount === 1 ? '' : 's'}
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <TableActionButtons onView={() => onViewDetails(event.id)} viewLabel="View details" />
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

AnprEventTable.propTypes = {
  events: PropTypes.arrayOf(PropTypes.object).isRequired,
  highlightedEventIds: PropTypes.arrayOf(PropTypes.string),
  page: PropTypes.number,
  rowsPerPage: PropTypes.number,
  loading: PropTypes.bool,
  onViewDetails: PropTypes.func.isRequired
};
