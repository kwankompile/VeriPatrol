import PropTypes from 'prop-types';
import { Skeleton, TableBody, TableCell, TableRow } from '@mui/material';

/**
 * Skeleton rows rendered inside a table's body.
 *
 * Keeps the surrounding page header, filters, table header, and layout intact —
 * only the table rows/content are replaced while data is loading.
 */
export function TableBodySkeleton({ rowCount = 5, columnCount = 5, testId = 'table-body-skeleton' }) {
  return (
    <TableBody data-testid={testId}>
      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columnCount }).map((__, colIndex) => (
            <TableCell key={colIndex}>
              <Skeleton variant="text" height={24} sx={{ mx: colIndex === 0 ? 'auto' : 0 }} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}

TableBodySkeleton.propTypes = {
  rowCount: PropTypes.number,
  columnCount: PropTypes.number,
  testId: PropTypes.string
};

export default TableBodySkeleton;
