import { useMemo } from 'react';
import { Alert, Box, Button, CircularProgress, Grid, Paper, Snackbar, Stack, Typography } from '@mui/material';
import { IconCar, IconPencil } from '@tabler/icons-react';

import DetailCard from 'ui-component/cards/DetailCard';

import vehicleManagementService from '../datasources/vehicleManagementService';
import { VehicleManagementRepository } from '../repositories/VehicleManagementRepository';
import { useVehicleDetailController } from '../controllers/useVehicleManagementController';
import VehicleStatusChip from '../components/VehicleStatusChip';
import VehicleEditDrawer from '../components/VehicleEditDrawer';

function DetailField({ label, value }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1" sx={{ mt: 0.5 }}>
        {value ?? '—'}
      </Typography>
    </Paper>
  );
}

export default function VehicleDetail() {
  const repository = useMemo(() => new VehicleManagementRepository(vehicleManagementService), []);
  const controller = useVehicleDetailController(repository);

  if (controller.loading) {
    return (
      <DetailCard title="Vehicle details" avatar={<IconCar size={24} />} onBack={controller.handleBack}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </DetailCard>
    );
  }

  if (!controller.vehicle) {
    return (
      <DetailCard title="Vehicle details" avatar={<IconCar size={24} />} onBack={controller.handleBack}>
        <Alert severity={controller.error ? 'error' : 'info'} sx={{ mt: 2 }}>
          {controller.error || 'Vehicle not found.'}
        </Alert>
      </DetailCard>
    );
  }

  const vehicle = controller.vehicle;

  return (
    <DetailCard
      title="Vehicle details"
      avatar={<IconCar size={24} />}
      onBack={controller.handleBack}
      headerActions={
        <Button variant="contained" size="small" startIcon={<IconPencil size={18} />} onClick={controller.handleOpenEdit}>
          Edit vehicle
        </Button>
      }
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <VehicleStatusChip kind="status" value={vehicle.status} />
          <VehicleStatusChip kind="source" value={vehicle.source} />
        </Stack>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DetailField label="Plate number" value={vehicle.plateNumber} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DetailField label="Owner name" value={vehicle.ownerName} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DetailField label="Vehicle type" value={vehicle.vehicleType} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DetailField label="Source" value={vehicle.sourceLabel} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DetailField label="Created" value={vehicle.formattedCreatedAt} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <DetailField label="Updated" value={vehicle.formattedUpdatedAt} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Notes
              </Typography>
              <Typography variant="body1" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                {vehicle.notes ?? '—'}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Stack>

      <VehicleEditDrawer
        open={controller.editOpen}
        vehicle={vehicle}
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
    </DetailCard>
  );
}
