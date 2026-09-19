import { Box, Grid, CircularProgress, Typography, useTheme, useMediaQuery } from '@mui/material';
import { useParams } from 'react-router-dom';
import DetailCard from 'ui-component/cards/DetailCard';

import { PatrolRepository } from '../repositories/patrolRepository';
import patrolService from '../datasources/patrolService';
import { usePatrolViewController } from '../controllers/usePatrolViewController';
import { PatrolHistoryData, CheckpointHistoryData, RouteHistoryData } from '../components';

import { IconDeviceCctv as PatrolIcon } from '@tabler/icons-react';

export default function PatrolHistoryView() {
  const { patrolHistoryId } = useParams();
  const controller = usePatrolViewController(new PatrolRepository(patrolService), patrolHistoryId);

  // Responsive design hooks
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (controller.loading) {
    return (
      <DetailCard title="Patrol Details" avatar={<PatrolIcon size={24} />} onBack={controller.handleBack}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={60} thickness={4} />
        </Box>
      </DetailCard>
    );
  }

  if (!controller.patrolLog) {
    return (
      <DetailCard title="Patrol Details" avatar={<PatrolIcon size={24} />} onBack={controller.handleBack}>
        <Box sx={{ p: 6, textAlign: 'center' }}>
          <Typography variant="h3" color="text.secondary">
            Patrol not found
          </Typography>
        </Box>
      </DetailCard>
    );
  }

  return (
    <>
      <DetailCard title="Patrol Details" avatar={<PatrolIcon size={24} />} onBack={controller.handleBack}>
        {/* Patrol Profile Data */}
        {/* <PatrolHistoryData info={controller.patrolLog.data} isMobile={isMobile}></PatrolHistoryData> */}

        {/* <br /> */}
        <Box sx={{ flexGrow: 1 }}>
          <Grid container spacing={2}>
            {/* Patrol History Data */}
            <Grid size={{ xs: 12, md: 6 }}>
              <PatrolHistoryData info={controller.patrolLog.data} isMobile={isMobile}></PatrolHistoryData>
            </Grid>

            {/* Patrol History Data */}
            <Grid size={{ xs: 12, md: 6 }}>
              <CheckpointHistoryData info={controller.checkpointLog.data} isMobile={isMobile}></CheckpointHistoryData>
            </Grid>

            {/* Routes Data */}
            <Grid size={{ xs: 12, md: 12 }}>
              <RouteHistoryData
                routeData={Array.isArray(controller.routeLog) ? controller.routeLog : (controller.routeLog?.data ?? [])}
                isMobile={isMobile}
              />
            </Grid>
          </Grid>
        </Box>
      </DetailCard>
    </>
  );
}
