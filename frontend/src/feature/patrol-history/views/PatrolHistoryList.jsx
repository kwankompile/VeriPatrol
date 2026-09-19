import { Box, CircularProgress, useTheme, useMediaQuery } from '@mui/material';

import MainCard from 'ui-component/cards/MainCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';

import { PatrolRepository } from '../repositories/patrolRepository';
import { usePatrolController } from '../controllers/usePatrolController';
import patrolService from '../datasources/patrolService';

import { PatrolTable, PatrolTableToolbar } from '../components';

/**
 * Main view component for patrol list.
 * Orchestrates the integration of toolbar, table, and pagination components.
 * Handles dependency injection and loading states.
 */

export default function PatrolHistoryList() {
  // Initialize dependencies using dependency injection pattern
  const repository = new PatrolRepository(patrolService);
  const controller = usePatrolController(repository);

  // Responsive design hooks
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Show loading indicator while data is being fetched
  if (controller.loading) {
    return (
      <MainCard title="Patrol  History">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      </MainCard>
    );
  }

  return (
    <MainCard title="Patrol History">
      {/* Filtering and action toolbar */}
      <PatrolTableToolbar
        filterText={controller.filterText}
        onFilterChange={controller.handleFilterChange}
        onAddPatrol={controller.handleAddPatrol}
      />

      {/* Main table displaying patrol data */}
      <PatrolTable
        patrols={controller.patrols}
        page={controller.page}
        rowsPerPage={controller.rowsPerPage}
        onView={controller.handleViewPatrol}
        onEdit={controller.handleEditPatrol}
        onDelete={controller.handleDeletePatrol}
      />

      {/* Pagination and rows per page controls */}
      <PaginationFooter
        page={controller.page}
        rowsPerPage={controller.rowsPerPage}
        filteredCount={controller.filteredCount}
        onPageChange={controller.handleChangePage}
        onRowsPerPageChange={controller.handleChangeRowsPerPage}
        isMobile={isMobile}
      />
    </MainCard>
  );
}
