import { useMemo } from 'react';

import { Box, CircularProgress } from '@mui/material';
import { IconMapPinPlus as CheckpointsIcon } from '@tabler/icons-react';

import DetailCard from 'ui-component/cards/DetailCard';
import { SuccessDialog } from 'ui-component/dialogs/SuccessDialog';

import { CheckpointRepository } from '../repositories/checkpointRepository';
import checkpointService from '../datasources/checkpointService';
import { useCheckpointFormController } from '../controllers/useCheckpointFormController';
import CheckpointForm from '../components/CheckpointForm';

export default function CheckpointCreate() {
  const repository = useMemo(() => new CheckpointRepository(checkpointService), []);
  const controller = useCheckpointFormController(repository);

  if (controller.initialLoading) {
    return (
      <DetailCard title="Create checkpoint" avatar={<CheckpointsIcon size={24} />} onBack={controller.handleCancel}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      </DetailCard>
    );
  }

  return (
    <>
      <DetailCard title="Create checkpoint" avatar={<CheckpointsIcon size={24} />} onBack={controller.handleCancel}>
        <CheckpointForm controller={controller} />
      </DetailCard>
      <SuccessDialog controller={controller} msg="Checkpoint created successfully. Redirecting to checkpoint details..." />
    </>
  );
}
