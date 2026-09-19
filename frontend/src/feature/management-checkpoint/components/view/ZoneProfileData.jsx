import { Box, Grid, Paper, Stack, Typography } from '@mui/material';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';

export function ZoneProfileData({ info, isMobile }) {
  const viewConfig = {
    false: { direction: 'row', spacing: 2, align: 'center', mb: 0.5 },
    true: { direction: 'column', spacing: 0.5, align: '', mb: 2 }
  };

  const layout = viewConfig[isMobile];

  const Field = ({ label, children }) => (
    <Stack direction={layout.direction} spacing={layout.spacing} sx={{ mb: layout.mb }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" color="text.primary" component="div">
        {children}
      </Typography>
    </Stack>
  );

  return (
    <Box sx={{ flexGrow: 1 }}>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Field label="Name">{info.name || '—'}</Field>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Field label="Checkpoints count">{info.checkpoints_count ?? 0}</Field>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Field label="Last modified">{info.updated_at ? <MalaysiaTime time={info.updated_at} /> : '—'}</Field>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Field label="Created at">{info.created_at ? <MalaysiaTime time={info.created_at} /> : '—'}</Field>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Field label="Description">{info.description || '—'}</Field>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}
