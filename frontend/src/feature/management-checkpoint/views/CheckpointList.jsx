import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { Alert, Snackbar, useMediaQuery, useTheme } from '@mui/material';

import MainCard from 'ui-component/cards/MainCard';
import DetailCard from 'ui-component/cards/DetailCard';
import { PaginationFooter } from 'ui-component/table/PaginationFooter';
import { SectionHeader } from 'ui-component/SectionHeader';

import { CheckpointRepository } from '../repositories/checkpointRepository';
import checkpointService from '../datasources/checkpointService';
import { useCheckpointController } from '../controllers/useCheckpointController';
import { CheckpointTable } from '../components/table/CheckpointTable';
import { CheckpointTableToolbar as Toolbar } from '../components/table/CheckpointTableToolbar';
import { ZoneProfileData } from '../components/view/ZoneProfileData';
import { IconMap as MapIcon } from '@tabler/icons-react';

export default function CheckpointList() {
  const { zoneId: scopedZoneId } = useParams();
  const repository = useMemo(() => new CheckpointRepository(checkpointService), []);
  const controller = useCheckpointController(repository, { zoneId: scopedZoneId ?? null });

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const Wrapper = scopedZoneId ? DetailCard : MainCard;
  const wrapperProps = scopedZoneId
    ? { title: 'Zone details', avatar: <MapIcon size={24} />, onBack: controller.handleBack }
    : { title: 'Checkpoint management' };

  return (
    <Wrapper {...wrapperProps}>
      {scopedZoneId && controller.zone ? <ZoneProfileData info={controller.zone} isMobile={isMobile} /> : null}
      {scopedZoneId ? (
        <>
          <br />
          <SectionHeader title="Checkpoints in this zone" />
        </>
      ) : null}

      {controller.error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {controller.error}
        </Alert>
      ) : null}

      <Toolbar
        filterText={controller.filterText}
        zoneFilter={controller.zoneFilter}
        activeFilter={controller.activeFilter}
        locationTypeFilter={controller.locationTypeFilter}
        zones={controller.zones}
        hideZoneFilter={Boolean(scopedZoneId)}
        onFilterChange={controller.handleFilterChange}
        onZoneFilterChange={controller.handleZoneFilterChange}
        onActiveFilterChange={controller.handleActiveFilterChange}
        onLocationTypeFilterChange={controller.handleLocationTypeFilterChange}
        onAddCheckpoint={controller.handleAddCheckpoint}
      />

      <CheckpointTable
        checkpoints={controller.checkpoints}
        hideZoneColumn={Boolean(scopedZoneId)}
        loading={controller.loading}
        rowsPerPage={controller.rowsPerPage}
        onView={controller.handleViewCheckpoint}
        onEdit={controller.handleEditCheckpoint}
        onDelete={controller.handleDeleteCheckpoint}
      />

      <PaginationFooter
        page={controller.page}
        rowsPerPage={controller.rowsPerPage}
        filteredCount={controller.totalCount}
        onPageChange={controller.handleChangePage}
        onRowsPerPageChange={controller.handleChangeRowsPerPage}
        isMobile={isMobile}
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
    </Wrapper>
  );
}
