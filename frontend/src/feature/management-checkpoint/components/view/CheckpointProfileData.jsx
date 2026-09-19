import { Box, Grid, Paper, Stack, Typography } from '@mui/material';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import CheckpointLocationTypeChip from '../CheckpointLocationTypeChip';
import CheckpointStatusChip from '../CheckpointStatusChip';

export function CheckpointProfileData({ checkpoint, isMobile }) {
  const stackDirection = isMobile ? 'column' : 'row';
  const zoneName = checkpoint.zone?.name ?? '—';

  const field = (label, value) => (
    <Stack direction={stackDirection} spacing={0.5} sx={{ mb: 1.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Typography variant="body2" color="text.primary">
          {value}
        </Typography>
      ) : (
        <Box>{value}</Box>
      )}
    </Stack>
  );

  return (
    <Paper elevation={2} sx={{ p: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          {field('Name', checkpoint.name)}
          {field('Zone', zoneName)}
          {field('Location type', <CheckpointLocationTypeChip locationType={checkpoint.location_type} />)}
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          {field('Radius (m)', checkpoint.radius)}
          {field('Latitude', checkpoint.latitude)}
          {field('Longitude', checkpoint.longitude)}
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          {field('Status', <CheckpointStatusChip isActive={checkpoint.is_active !== false} />)}
          {field('Created', checkpoint.created_at ? <MalaysiaTime time={checkpoint.created_at} /> : '—')}
          {field('Last updated', checkpoint.updated_at ? <MalaysiaTime time={checkpoint.updated_at} /> : '—')}
        </Grid>
      </Grid>
    </Paper>
  );
}
