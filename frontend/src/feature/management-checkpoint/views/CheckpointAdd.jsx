import { useParams } from 'react-router-dom';

import { Box, Grid, Fade } from '@mui/material';
import { IconMapPinPlus as CheckpointsIcon } from '@tabler/icons-react';

import DetailCard from 'ui-component/cards/DetailCard';
import { FieldContainer } from 'ui-component/FieldContainer';
import { SubmitButton } from 'ui-component/CreateActionButtons';
import { SuccessDialog } from 'ui-component/dialogs/SuccessDialog';
import { SectionHeader } from 'ui-component/SectionHeader';

import { CheckpointRepository } from '../repositories/checkpointRepository';
import checkpointService from '../datasources/checkpointService';
import { useCheckpointAddController } from '../controllers/useCheckpointAddController';

export default function CheckpointAdd() {
  const { zoneId } = useParams();
  const repository = new CheckpointRepository(checkpointService);
  const controller = useCheckpointAddController(repository, zoneId);

  return (
    <>
      <DetailCard title="Add new Checkpoint" avatar={<CheckpointsIcon size={24} />} onBack={controller.handleCancel}>
        <Box sx={{ mx: 'auto' }} component="form" onSubmit={controller.handleSubmit}>
          {/* Profile Picture Section */}
          {/* <ProfilePictureSection controller={controller} /> */}

          <Grid container spacing={3}>
            {/* Checkpoint Details */}
            <Grid size={{ xs: 12, md: 12 }} sx={{ mb: 2 }}>
              <Fade in timeout={1000}>
                <Box>
                  <SectionHeader title="Checkpoint Details"></SectionHeader>
                </Box>
              </Fade>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box>
                    <FieldContainer
                      label="Name"
                      name="name"
                      value={controller.formData.name}
                      onChange={controller.handleChange('name')}
                      error={!!controller.errors.name}
                      helperText={controller.errors.name}
                      placeholder="Enter checkpoint name"
                    ></FieldContainer>
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Box>
                    <FieldContainer
                      label="Description"
                      name="description"
                      value={controller.formData.description}
                      onChange={controller.handleChange('description')}
                      error={!!controller.errors.description}
                      helperText={controller.errors.description}
                      placeholder="Enter description"
                      multiline
                      minRows={1}
                      maxRows={3}
                    ></FieldContainer>
                  </Box>
                </Grid>
              </Grid>
            </Grid>

            {/* Coordinate */}
            <Grid size={{ xs: 12, md: 12 }} sx={{ mb: 2 }}>
              <Fade in timeout={1000}>
                <Box>
                  <SectionHeader title="Coordinate"></SectionHeader>
                </Box>
              </Fade>

              <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Box>
                    <FieldContainer
                      label="Latitude"
                      name="latitude"
                      value={controller.formData.latitude}
                      onChange={controller.handleChange('latitude')}
                      error={!!controller.errors.latitude}
                      helperText={controller.errors.latitude}
                      placeholder="Enter checkpoint latitude"
                    ></FieldContainer>
                  </Box>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                  <Box>
                    <FieldContainer
                      label="Longitude"
                      name="longitude"
                      value={controller.formData.longitude}
                      onChange={controller.handleChange('longitude')}
                      error={!!controller.errors.longitude}
                      helperText={controller.errors.longitude}
                      placeholder="Enter checkpoint longitude"
                    ></FieldContainer>
                  </Box>
                </Grid>
              </Grid>
            </Grid>

            {/* Action Buttons */}
            <Grid size={{ xs: 12, md: 12 }}>
              <SubmitButton text1="Create Checkpoint" text2="Creating..." controller={controller}></SubmitButton>
            </Grid>
          </Grid>
        </Box>
      </DetailCard>

      {/* Success Dialog */}
      <SuccessDialog controller={controller} msg="Checkpoint created successfully! Redirecting to checkpoint view page..."></SuccessDialog>
    </>
  );
}
