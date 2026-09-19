import { Box, Typography, Select, MenuItem, Pagination } from '@mui/material';

/**
 * Pagination footer component with rows per page selector and pagination controls.
 * Responsively adjusts layout for mobile and desktop views.
 */

export function PaginationFooter({ page, rowsPerPage, filteredCount, onPageChange, onRowsPerPageChange, isMobile }) {
  // Calculate pagination values
  const totalPages = Math.ceil(filteredCount / rowsPerPage);
  const startItem = page * rowsPerPage + 1;
  const endItem = Math.min((page + 1) * rowsPerPage, filteredCount);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'stretch', sm: 'center' },
        p: { xs: 0, sm: 0.5 },
        // borderTop: '1px solid',
        // borderColor: 'divider',
        gap: { xs: 2, sm: 0 }
      }}
    >
      {/* Left section: Rows per page selector and item range */}
      <RowsPerPageSelector
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={onRowsPerPageChange}
        startItem={startItem}
        endItem={endItem}
        filteredCount={filteredCount}
      />

      {/* Right section: Pagination controls */}
      <PaginationControls page={page} totalPages={totalPages} onPageChange={onPageChange} isMobile={isMobile} />
    </Box>
  );
}

/**
 * Sub-component for rows per page selection and item range display
 */
function RowsPerPageSelector({ rowsPerPage, onRowsPerPageChange, startItem, endItem, filteredCount }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'flex-start', sm: 'center' },
        gap: { xs: 1, sm: 2 },
        order: { xs: 2, sm: 1 }
      }}
    >
      {/* Rows per page dropdown */}
      <RowsPerPageDropdown rowsPerPage={rowsPerPage} onChange={onRowsPerPageChange} />

      {/* Item range information */}
      <Typography variant="body2" color="text.secondary">
        {`${startItem}-${endItem} of ${filteredCount}`}
      </Typography>
    </Box>
  );
}

/**
 * Dropdown component for selecting rows per page
 */
function RowsPerPageDropdown({ rowsPerPage, onChange }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        Rows per page:
      </Typography>
      <Select
        value={rowsPerPage}
        onChange={onChange}
        variant="outlined"
        sx={{
          minWidth: 80,
          '& .MuiSelect-select': {
            py: 0.75,
            fontSize: { xs: '0.875rem' }
          }
        }}
      >
        <MenuItem value={5}>5</MenuItem>
        <MenuItem value={10}>10</MenuItem>
        <MenuItem value={25}>25</MenuItem>
      </Select>
    </Box>
  );
}

/**
 * Component for pagination controls with responsive configuration
 */
function PaginationControls({ page, totalPages, onPageChange, isMobile }) {
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: { xs: 'center', sm: 'flex-end' },
        order: { xs: 1, sm: 2 },
        width: { xs: '100%', sm: 'auto' }
      }}
    >
      <Pagination
        count={totalPages}
        variant="outlined"
        color="secondary"
        page={page + 1} // Convert to 1-based for MUI Pagination
        onChange={(event, newPage) => onPageChange(event, newPage - 1)}
        siblingCount={isMobile ? 0 : 1}
        boundaryCount={isMobile ? 1 : 2}
        sx={{
          '& .MuiPaginationItem-root': {
            borderRadius: 1,
            minWidth: { xs: 32 },
            height: { xs: 32 },
            fontSize: { xs: '0.875rem', sm: '1rem' }
          }
        }}
      />
    </Box>
  );
}
