import { useMemo } from 'react';

import { Alert, Snackbar, useMediaQuery, useTheme } from '@mui/material';
import MainCard from 'ui-component/cards/MainCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';

import { ZoneRepository } from '../repositories/zoneRepository';
import { useZoneController } from '../controllers/useZoneController';
import zoneService from '../datasources/zoneService';

import { ZoneTable, ZoneTableToolbar, ZoneFormDrawer } from '../components';

export default function ZoneList() {
  const repository = useMemo(() => new ZoneRepository(zoneService), []);
  const controller = useZoneController(repository);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <MainCard title="Zone Management">
      {controller.error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {controller.error}
        </Alert>
      ) : null}

      <ZoneTableToolbar
        filterText={controller.filterText}
        onFilterChange={controller.handleFilterChange}
        onAddZone={controller.handleAddZone}
      />

      <ZoneTable
        zones={controller.zones}
        page={controller.page}
        rowsPerPage={controller.rowsPerPage}
        loading={controller.loading}
        onView={controller.handleViewZone}
        onEdit={controller.handleEditZone}
        onDelete={controller.handleDeleteZone}
      />

      <PaginationFooter
        page={controller.page}
        rowsPerPage={controller.rowsPerPage}
        filteredCount={controller.totalCount}
        onPageChange={controller.handleChangePage}
        onRowsPerPageChange={controller.handleChangeRowsPerPage}
        isMobile={isMobile}
      />

      <ZoneFormDrawer
        open={controller.formOpen}
        mode={controller.formMode}
        zone={controller.formZone}
        saving={controller.saving}
        errors={controller.formErrors}
        onClose={controller.handleCloseForm}
        onSave={controller.handleSaveZone}
      />

      <Snackbar
        open={Boolean(controller.feedback.message)}
        autoHideDuration={4000}
        onClose={controller.clearFeedback}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={controller.clearFeedback} severity={controller.feedback.type || 'info'} sx={{ width: '100%' }}>
          {controller.feedback.message}
        </Alert>
      </Snackbar>
    </MainCard>
  );
}
