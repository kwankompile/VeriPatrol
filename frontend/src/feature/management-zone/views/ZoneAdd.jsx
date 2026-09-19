import { useMemo } from 'react';

import { Alert, Box, Grid } from '@mui/material';
import { IconMap as MapIcon } from '@tabler/icons-react';
import DetailCard from 'ui-component/cards/DetailCard';

import { SectionHeader } from 'ui-component/SectionHeader';
import { FieldContainer } from 'ui-component/FieldContainer';
import { SubmitButton } from 'ui-component/CreateActionButtons';
import { SuccessDialog } from 'ui-component/dialogs/SuccessDialog';

import { ZoneRepository } from '../repositories/zoneRepository';
import zoneService from '../datasources/zoneService';
import { useZoneFormController } from '../controllers/useZoneFormController';

export default function ZoneAdd() {
  const repository = useMemo(() => new ZoneRepository(zoneService), []);
  const controller = useZoneFormController(repository);

  return (
    <>
      <DetailCard title="Add new Zone" avatar={<MapIcon size={24} />} onBack={controller.handleCancel}>
        <Box sx={{ mx: 'auto' }} component="form" onSubmit={controller.handleSubmit}>
          {controller.submitError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {controller.submitError}
            </Alert>
          ) : null}

          <SectionHeader title="Zone Profile" />
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FieldContainer
                label="Zone Name"
                name="name"
                value={controller.formData.name}
                onChange={controller.handleChange('name')}
                error={!!controller.errors.name}
                helperText={controller.errors.name}
                placeholder="Enter zone name"
                required
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <FieldContainer
                label="Description"
                name="description"
                value={controller.formData.description}
                onChange={controller.handleChange('description')}
                error={!!controller.errors.description}
                helperText={controller.errors.description || 'Optional'}
                placeholder="Enter description"
                multiline
                minRows={2}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <SubmitButton text1="Create Zone" text2="Creating..." controller={controller} />
            </Grid>
          </Grid>
        </Box>
      </DetailCard>

      <SuccessDialog controller={controller} msg="Zone created successfully! Redirecting..." />
    </>
  );
}
