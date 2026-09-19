import { useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { Alert, Box, Button, CircularProgress, useMediaQuery, useTheme } from '@mui/material';
import { IconMapPin as PinIcon, IconPencil as EditIcon } from '@tabler/icons-react';

import DetailCard from 'ui-component/cards/DetailCard';
import { SectionHeader } from 'ui-component/SectionHeader';

import { CheckpointRepository } from '../repositories/checkpointRepository';
import checkpointService from '../datasources/checkpointService';
import { useCheckpointViewController } from '../controllers/useCheckpointViewController';
import { CheckpointProfileData } from '../components/view/CheckpointProfileData';
import LeafletMap from '../components/LeafletMap';

export default function CheckpointView() {
  const { checkpointId } = useParams();
  const repository = useMemo(() => new CheckpointRepository(checkpointService), []);
  const controller = useCheckpointViewController(repository, checkpointId);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const editButton = (
    <Button variant="contained" color="primary" size="small" startIcon={<EditIcon size={18} />} onClick={controller.handleEdit}>
      Edit checkpoint
    </Button>
  );

  if (controller.loading) {
    return (
      <DetailCard title="Checkpoint details" avatar={<PinIcon size={24} />} onBack={controller.handleBack}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={48} />
        </Box>
      </DetailCard>
    );
  }

  if (!controller.checkpoint) {
    return (
      <DetailCard title="Checkpoint details" avatar={<PinIcon size={24} />} onBack={controller.handleBack}>
        <Alert severity={controller.error ? 'error' : 'info'} sx={{ mt: 2 }}>
          {controller.error || 'Checkpoint not found.'}
        </Alert>
      </DetailCard>
    );
  }

  return (
    <DetailCard title="Checkpoint details" avatar={<PinIcon size={24} />} onBack={controller.handleBack} headerActions={editButton}>
      <CheckpointProfileData checkpoint={controller.checkpoint} isMobile={isMobile} />
      <br />
      <SectionHeader title="Map" />
      <LeafletMap checkpoint={controller.checkpoint} />
    </DetailCard>
  );
}
