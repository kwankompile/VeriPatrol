import { useRef } from 'react';
import { Alert, Box, Button, CircularProgress, Stack } from '@mui/material';
import { IconRefresh } from '@tabler/icons-react';

import MainCard from 'ui-component/cards/MainCard';

import anprMonitoringService from '../datasources/anprMonitoringService';
import { AnprMonitoringRepository } from '../repositories/AnprMonitoringRepository';
import { useAnprEventDetailController } from '../controllers/useAnprMonitoringController';
import AnprEventSummaryCards from '../components/AnprEventSummaryCards';
import AnprEvidenceGallery from '../components/AnprEvidenceGallery';
import AnprBlockchainProofSection from '../components/AnprBlockchainProofSection';
import AnprStatusChip from '../components/AnprStatusChip';

export default function AnprEventDetail() {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new AnprMonitoringRepository(anprMonitoringService);
  }
  const controller = useAnprEventDetailController(repositoryRef.current);

  if (controller.loading) {
    return (
      <MainCard title="ANPR Event Detail">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      </MainCard>
    );
  }

  if (controller.error) {
    return (
      <MainCard title="ANPR Event Detail">
        <Alert severity="error" sx={{ mb: 2 }}>
          {controller.error}
        </Alert>
        <Button variant="outlined" onClick={controller.handleBack}>
          Back to list
        </Button>
      </MainCard>
    );
  }

  const event = controller.event;

  return (
    <MainCard
      title="ANPR Event Detail"
      secondary={
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={controller.handleBack}>
            Back
          </Button>
          <Button
            variant="contained"
            startIcon={<IconRefresh size={18} />}
            onClick={controller.handleRefresh}
            disabled={controller.refreshing}
          >
            {controller.refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Stack>
      }
    >
      <Stack spacing={3}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <AnprStatusChip kind="validity" value={event.isValid ? 'valid' : 'invalid'} />
          <AnprStatusChip kind="flagged" value={event.isFlagged ? 'flagged' : 'unflagged'} />
          <AnprStatusChip kind="evidence" value={event.hasEvidence ? 'available' : 'missing'} />
        </Stack>

        <AnprEventSummaryCards event={event} />
        <AnprBlockchainProofSection
          eventProof={event.blockchainProof}
          imageProofSummary={event.imageBlockchainProofSummary}
        />
        <AnprEvidenceGallery images={event.images} imageMap={event.imageMap} />
      </Stack>
    </MainCard>
  );
}
