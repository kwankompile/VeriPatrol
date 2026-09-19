import { useMemo } from 'react';
import { Alert, Snackbar, Stack, TextField, useMediaQuery, useTheme } from '@mui/material';

import MainCard from 'ui-component/cards/MainCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';

import vehicleManagementService from '../datasources/vehicleManagementService';
import { VehicleManagementRepository } from '../repositories/VehicleManagementRepository';
import { useVehicleManagementController } from '../controllers/useVehicleManagementController';
import VehicleTable from '../components/VehicleTable';
import VehicleEditDrawer from '../components/VehicleEditDrawer';

export default function VehicleList() {
  const repository = useMemo(() => new VehicleManagementRepository(vehicleManagementService), []);
  const controller = useVehicleManagementController(repository);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <MainCard title="Vehicle Management">
      <Stack spacing={2}>
        {controller.error ? <Alert severity="error">{controller.error}</Alert> : null}

        <TextField
          size="small"
          label="Search plate number"
          value={controller.searchText}
          onChange={(e) => controller.handleSearchChange(e.target.value)}
          sx={{ maxWidth: 320 }}
        />

        <VehicleTable
          vehicles={controller.vehicles}
          page={controller.page}
          rowsPerPage={controller.rowsPerPage}
          loading={controller.loading}
          onView={controller.handleViewVehicle}
          onEdit={controller.handleOpenEdit}
        />

        {controller.pagination.total > 0 ? (
          <PaginationFooter
            page={controller.page}
            rowsPerPage={controller.rowsPerPage}
            filteredCount={controller.pagination.total}
            onPageChange={controller.handleChangePage}
            onRowsPerPageChange={controller.handleChangeRowsPerPage}
            isMobile={isMobile}
          />
        ) : null}
      </Stack>

      <VehicleEditDrawer
        open={controller.editOpen}
        vehicle={controller.editVehicle}
        saving={controller.saving}
        errors={controller.editErrors}
        onClose={controller.handleCloseEdit}
        onSave={controller.handleSaveEdit}
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
