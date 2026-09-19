import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { Box, CircularProgress } from '@mui/material';
import { IconMapPin as CheckpointsIcon } from '@tabler/icons-react';

import DetailCard from 'ui-component/cards/DetailCard';
import { SuccessDialog } from 'ui-component/dialogs/SuccessDialog';

import { CheckpointRepository } from '../repositories/checkpointRepository';
import checkpointService from '../datasources/checkpointService';
import { useCheckpointFormController } from '../controllers/useCheckpointFormController';
import CheckpointForm from '../components/CheckpointForm';

export default function CheckpointEdit() {
  const { checkpointId } = useParams();
  const repository = useMemo(() => new CheckpointRepository(checkpointService), []);
  const controller = useCheckpointFormController(repository, checkpointId);

  if (controller.initialLoading) {
    return (
      <DetailCard title="Edit checkpoint" avatar={<CheckpointsIcon size={24} />} onBack={controller.handleCancel}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      </DetailCard>
    );
  }

  return (
    <>
      <DetailCard title="Edit checkpoint" avatar={<CheckpointsIcon size={24} />} onBack={controller.handleCancel}>
        <CheckpointForm controller={controller} />
      </DetailCard>
      <SuccessDialog controller={controller} msg="Checkpoint updated successfully. Redirecting to checkpoint details..." />
    </>
  );
}
