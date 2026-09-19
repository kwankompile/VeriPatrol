import PropTypes from 'prop-types';
import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import { TableActionButtons } from 'ui-component/table/TableActionButtons';
import { standardTableHeadCellSx, standardTablePaperSx, standardTableRowSx } from 'ui-component/table/tableStyles';

import BlockchainNetworkBadge from './BlockchainNetworkBadge';
import BlockchainStatusChip from './BlockchainStatusChip';

export default function BlockchainRecordTable({ records, page = 0, rowsPerPage = 10, onViewDetails }) {
  if (!records.length) {
    return null;
  }

  return (
    <Paper sx={standardTablePaperSx} elevation={1}>
      <TableContainer sx={{ overflowX: 'auto' }}>
        <Table sx={{ minWidth: 1100 }}>
          <TableHead sx={{ backgroundColor: 'secondary.light' }}>
            <TableRow>
              <TableCell sx={standardTableHeadCellSx} align="center">
                No
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Entity / proof</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Network</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Status
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Record hash</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Tx hash</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Block / conf.
              </TableCell>
              <TableCell sx={standardTableHeadCellSx}>Created</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Submitted</TableCell>
              <TableCell sx={standardTableHeadCellSx}>Confirmed</TableCell>
              <TableCell sx={standardTableHeadCellSx} align="center">
                Action
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map((record, index) => (
              <TableRow key={record.id} hover sx={standardTableRowSx}>
                <TableCell align="center">{page * rowsPerPage + index + 1}</TableCell>
                <TableCell>
                  <Typography variant="subtitle2">{record.entityTypeLabel}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {record.proofType}
                  </Typography>
                </TableCell>
                <TableCell>
                  <BlockchainNetworkBadge network={record.network} environment={record.environment} />
                </TableCell>
                <TableCell align="center">
                  <BlockchainStatusChip value={record.status} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {record.recordHashShort}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontFamily="monospace">
                    {record.txHashShort}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2">
                    {record.blockNumber ?? '—'} / {record.confirmations ?? '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <MalaysiaTime time={record.createdAt} />
                </TableCell>
                <TableCell>
                  <MalaysiaTime time={record.submittedAt} />
                </TableCell>
                <TableCell>
                  <MalaysiaTime time={record.confirmedAt} />
                </TableCell>
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                  <TableActionButtons onView={() => onViewDetails(record.id)} viewLabel="View details" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

BlockchainRecordTable.propTypes = {
  records: PropTypes.arrayOf(PropTypes.object).isRequired,
  page: PropTypes.number,
  rowsPerPage: PropTypes.number,
  onViewDetails: PropTypes.func.isRequired
};
