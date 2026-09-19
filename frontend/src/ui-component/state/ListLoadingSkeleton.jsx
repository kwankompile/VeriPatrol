import PropTypes from 'prop-types';
import { Box, Skeleton, Stack } from '@mui/material';

export default function ListLoadingSkeleton({ rows = 5, rowHeight = 48 }) {
  return (
    <Stack spacing={1} data-testid="list-loading-skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={rowHeight} />
      ))}
    </Stack>
  );
}

ListLoadingSkeleton.propTypes = {
  rows: PropTypes.number,
  rowHeight: PropTypes.number
};
