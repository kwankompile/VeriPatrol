import PropTypes from 'prop-types';
import { Button, Grid, Paper, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { hasRole, ROLES } from 'utils/auth';
import VehicleStatusChip from '../../management-vehicle/components/VehicleStatusChip';

function SummaryCard({ label, value, helper }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700}>
        {value}
      </Typography>
      {helper ? (
        <Typography variant="caption" color="text.secondary">
          {helper}
        </Typography>
      ) : null}
    </Paper>
  );
}

SummaryCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  helper: PropTypes.string
};

export default function AnprEventSummaryCards({ event }) {
  if (!event) return null;

  const isAdmin = hasRole(ROLES.ADMIN);
  const vehicle = event.vehicle;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <SummaryCard label="Plate number" value={event.plateNumber} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <SummaryCard label="Confidence" value={event.confidencePercent} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <SummaryCard label="Detection time" value={event.formattedDetectionTime} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <SummaryCard
          label="Evidence"
          value={event.evidenceCount}
          helper={event.hasEvidence ? 'Images registered' : 'No images available'}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
          <Typography variant="subtitle2" gutterBottom>
            Camera
          </Typography>
          {event.camera ? (
            <Stack spacing={0.5}>
              <Typography variant="body2">{event.camera.name}</Typography>
              {event.camera.location ? (
                <Typography variant="caption" color="text.secondary">
                  {event.camera.location}
                </Typography>
              ) : null}
              {event.camera.isActive === false ? (
                <Typography variant="caption" color="text.secondary">
                  Status: inactive
                </Typography>
              ) : event.camera.isActive ? (
                <Typography variant="caption" color="text.secondary">
                  Status: active
                </Typography>
              ) : null}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No camera details
            </Typography>
          )}
        </Paper>
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
          <Typography variant="subtitle2" gutterBottom>
            Linked vehicle
          </Typography>
          {vehicle ? (
            <Stack spacing={1}>
              <Typography variant="body1" fontWeight={600}>
                {vehicle.plateNumber ?? event.plateNumber}
              </Typography>
              {vehicle.isAutoDetected && !vehicle.ownerName ? (
                <Typography variant="body2" color="text.secondary">
                  Auto-detected vehicle record
                </Typography>
              ) : null}
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {vehicle.status ? <VehicleStatusChip kind="status" value={vehicle.status} /> : null}
                {vehicle.source ? <VehicleStatusChip kind="source" value={vehicle.source} /> : null}
              </Stack>
              {vehicle.ownerName ? (
                <Typography variant="body2" color="text.secondary">
                  Owner: {vehicle.ownerName}
                </Typography>
              ) : null}
              {vehicle.vehicleType ? (
                <Typography variant="body2" color="text.secondary">
                  Type: {vehicle.vehicleType}
                </Typography>
              ) : null}
              {vehicle.notes ? (
                <Typography variant="body2" color="text.secondary">
                  Notes: {vehicle.notes}
                </Typography>
              ) : null}
              {isAdmin && vehicle.id ? (
                <Button
                  component={RouterLink}
                  to={`/admin/management-vehicle/view/${vehicle.id}`}
                  size="small"
                  variant="outlined"
                  sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                >
                  Open vehicle record
                </Button>
              ) : null}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No linked vehicle record
            </Typography>
          )}
        </Paper>
      </Grid>
      {(event.latitude || event.longitude) && (
        <Grid size={{ xs: 12 }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Coordinates
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {event.latitude ?? '—'}, {event.longitude ?? '—'}
            </Typography>
          </Paper>
        </Grid>
      )}
    </Grid>
  );
}

AnprEventSummaryCards.propTypes = {
  event: PropTypes.object
};
