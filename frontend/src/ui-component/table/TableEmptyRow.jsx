import PropTypes from 'prop-types';
import { TableCell, TableRow, Typography } from '@mui/material';

export function TableEmptyRow({ colSpan, message = 'No records found.' }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} align="center" sx={{ py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      </TableCell>
    </TableRow>
  );
}

TableEmptyRow.propTypes = {
  colSpan: PropTypes.number.isRequired,
  message: PropTypes.string
};
