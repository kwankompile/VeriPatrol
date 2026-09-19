import { Alert, Box, FormControlLabel, Grid, Switch, Typography } from '@mui/material';

import { FieldContainer } from 'ui-component/FieldContainer';
import { SelectFieldContainer } from 'ui-component/SelectFieldContainer';
import { SectionHeader } from 'ui-component/SectionHeader';
import { SubmitButton } from 'ui-component/CreateActionButtons';

import CheckpointMapPicker from './CheckpointMapPicker';
import { LOCATION_TYPE_OPTIONS, RADIUS_MAX, RADIUS_MIN, RECOMMENDED_RADIUS } from '../utils/checkpointConstants';

export default function CheckpointForm({ controller }) {
  const {
    formData,
    errors,
    zoneName,
    zoneLoading,
    missingZoneContext,
    isEdit,
    mapLatitude,
    mapLongitude,
    recenterLatitude,
    recenterLongitude,
    handleChange,
    handleCoordinatesChange,
    handleSubmit
  } = controller;

  const coordinateError = errors.latitude || errors.longitude;
  const formDisabled = missingZoneContext || zoneLoading;

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {missingZoneContext ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Zone context is required. Open this form from a zone details page to create or edit a checkpoint.
        </Alert>
      ) : null}

      {!missingZoneContext ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {zoneLoading ? 'Loading zone context...' : `This checkpoint belongs to zone: ${zoneName || 'Current zone'}.`}
        </Alert>
      ) : null}

      <SectionHeader title="Checkpoint details" />
      <Grid container spacing={3} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <FieldContainer
            label="Name"
            name="name"
            value={formData.name}
            onChange={handleChange('name')}
            error={Boolean(errors.name)}
            helperText={errors.name}
            placeholder="Checkpoint name"
            disabled={formDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SelectFieldContainer
            label="Location type"
            name="location_type"
            value={formData.location_type}
            onChange={handleChange('location_type')}
            error={Boolean(errors.location_type)}
            helperText={errors.location_type || `Select Indoor or Outdoor.`}
            options={LOCATION_TYPE_OPTIONS}
            placeholder="Select location type"
            disabled={formDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <FieldContainer
            label="Radius (metres)"
            name="radius"
            type="number"
            value={formData.radius}
            onChange={handleChange('radius')}
            error={Boolean(errors.radius)}
            helperText={
              errors.radius ||
              `Between ${RADIUS_MIN} and ${RADIUS_MAX}. Recommended radius: ${RECOMMENDED_RADIUS[formData.location_type] ?? RECOMMENDED_RADIUS.outdoor} m`
            }
            inputProps={{ min: RADIUS_MIN, max: RADIUS_MAX, step: 1 }}
            disabled={formDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <FormControlLabel
            control={
              <Switch checked={Boolean(formData.is_active)} onChange={handleChange('is_active')} color="primary" disabled={formDisabled} />
            }
            label="Active"
          />
          {errors.is_active ? (
            <Typography variant="caption" color="error" display="block">
              {errors.is_active}
            </Typography>
          ) : null}
        </Grid>
      </Grid>

      <SectionHeader title="Coordinates" />
      <Grid container spacing={3} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <FieldContainer
            label="Latitude"
            name="latitude"
            type="number"
            value={formData.latitude}
            onChange={handleChange('latitude')}
            error={Boolean(errors.latitude)}
            helperText={errors.latitude}
            inputProps={{ step: 'any' }}
            disabled={formDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <FieldContainer
            label="Longitude"
            name="longitude"
            type="number"
            value={formData.longitude}
            onChange={handleChange('longitude')}
            error={Boolean(errors.longitude)}
            helperText={errors.longitude}
            inputProps={{ step: 'any' }}
            disabled={formDisabled}
          />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <CheckpointMapPicker
            latitude={mapLatitude}
            longitude={mapLongitude}
            recenterLatitude={recenterLatitude}
            recenterLongitude={recenterLongitude}
            radius={formData.radius}
            onCoordinatesChange={handleCoordinatesChange}
            coordinateError={coordinateError}
            disabled={formDisabled}
          />
        </Grid>
      </Grid>

      {controller.submitError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {controller.submitError}
        </Alert>
      ) : null}

      <SubmitButton
        text1={isEdit ? 'Update checkpoint' : 'Create checkpoint'}
        text2={isEdit ? 'Updating...' : 'Creating...'}
        controller={controller}
      />
    </Box>
  );
}
