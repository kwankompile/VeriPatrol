import { useMemo } from 'react';
import { Alert, Box, Button, Snackbar, Stack, TextField, useMediaQuery, useTheme } from '@mui/material';
import { IconPlus as AddIcon } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';

import cameraManagementService from '../datasources/cameraManagementService';
import { CameraManagementRepository } from '../repositories/CameraManagementRepository';
import { useCameraManagementController } from '../controllers/useCameraManagementController';
import CameraTable from '../components/CameraTable';
import CameraFormDrawer from '../components/CameraFormDrawer';
import CameraDetailDrawer from '../components/CameraDetailDrawer';
import { CameraEmptyPanel, CameraErrorPanel } from '../components/CameraStatePanels';

export default function CameraList() {
  const repository = useMemo(() => new CameraManagementRepository(cameraManagementService), []);
  const controller = useCameraManagementController(repository);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const showEmpty = !controller.loading && !controller.error && controller.paginationTotal === 0;

  return (
    <MainCard title="Camera Management">
      <Stack spacing={2}>
        {/* Filtering and action toolbar — matches Add New User placement/style */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 2
          }}
        >
          <TextField
            size="small"
            label="Search cameras"
            placeholder="Name, email, location, or RTSP"
            value={controller.searchText}
            onChange={(e) => controller.handleSearchChange(e.target.value)}
            sx={{ width: { xs: '100%', sm: 360 } }}
          />
          <Button
            variant="contained"
            color="secondary"
            startIcon={<AddIcon size={18} />}
            onClick={controller.handleOpenCreate}
            sx={{
              width: { xs: '100%', sm: 'auto' },
              minWidth: { xs: '100%', sm: 'auto' },
              px: { xs: 2, sm: 3 }
            }}
          >
            Add New Camera
          </Button>
        </Box>

        {controller.error ? (
          <CameraErrorPanel message={controller.error} onRetry={controller.handleRetry} />
        ) : null}

        {showEmpty ? <CameraEmptyPanel onCreate={controller.handleOpenCreate} /> : null}

        {!showEmpty && !controller.error ? (
          <>
            <CameraTable
              cameras={controller.cameras}
              page={controller.page}
              rowsPerPage={controller.rowsPerPage}
              deletingId={controller.deletingId}
              loading={controller.loading}
              onView={controller.handleOpenDetail}
              onEdit={controller.handleOpenEdit}
              onDelete={controller.handleDeleteCamera}
            />

            {controller.paginationTotal > 0 ? (
              <PaginationFooter
                page={controller.page}
                rowsPerPage={controller.rowsPerPage}
                filteredCount={controller.paginationTotal}
                onPageChange={controller.handleChangePage}
                onRowsPerPageChange={controller.handleChangeRowsPerPage}
                isMobile={isMobile}
              />
            ) : null}
          </>
        ) : null}
      </Stack>

      <CameraFormDrawer
        open={controller.formOpen}
        mode={controller.formMode}
        camera={controller.formCamera}
        saving={controller.saving}
        errors={controller.formErrors}
        onClose={controller.handleCloseForm}
        onSave={controller.handleSaveForm}
      />

      <CameraDetailDrawer
        open={controller.detailOpen}
        camera={controller.detailCamera}
        onClose={controller.handleCloseDetail}
        onEdit={(camera) => {
          controller.handleCloseDetail();
          controller.handleOpenEdit(camera);
        }}
        onDelete={controller.handleDeleteCamera}
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
