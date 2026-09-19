import { Box, CircularProgress, useTheme, useMediaQuery } from '@mui/material';
import MainCard from 'ui-component/cards/MainCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';

import { PatrolLiveRepository } from '../repositories/patrolLiveRepository';
import { usePatrolLiveController } from '../controllers/usePatrolLiveController';
import { patrolLiveDataSource } from '../datasources/patrolLiveDataSource';
// import patrolLiveService from '../datasources/patrolLiveService';

import { PatrolTable, PatrolTableToolbar } from '../components';

/**
 * Main view component for patrolLive list.
 * Orchestrates the integration of toolbar, table, and pagination components.
 * Handles dependency injection and loading states.
 */

export default function PatrolLiveList() {
  // Initialize dependencies using dependency injection pattern
  const repository = new PatrolLiveRepository(patrolLiveDataSource);
  const controller = usePatrolLiveController(repository);

  // Responsive design hooks
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Show loading indicator while data is being fetched
  if (controller.loading) {
    return (
      <MainCard title="Patrol Live Tracking">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      </MainCard>
    );
  }

  return (
    <MainCard title="Patrol Live Tracking">
      {/* Filtering and action toolbar */}
      <PatrolTableToolbar
        filterText={controller.filterText}
        onFilterChange={controller.handleFilterChange}
        onAddPatrolLive={controller.handleAddPatrolLive}
      />

      {/* Main table displaying patrolLive data */}
      <PatrolTable
        patrols={controller.patrols}
        isSelected={controller.isSelected}
        onRowClick={controller.handleRowClick}
        onView={controller.handleViewPatrolLive}
        onEdit={controller.handleEditPatrolLive}
        onDelete={controller.handleDeletePatrolLive}
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
