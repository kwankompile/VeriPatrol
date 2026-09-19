import { Chip, Paper, Stack, styled, Typography } from '@mui/material';
import { MalaysiaTime } from 'ui-component/MalaysiaTime';

const Title = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  letterSpacing: 1.2,
  fontSize: '0.85rem',
  background: `linear-gradient(135deg, ${theme.palette.secondary.main} 100%, ${theme.palette.secondary.light} 100%)`,
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
  marginBottom: 20
}));

export function PatrolHistoryData({ info, isMobile }) {
  const status = info.status;

  const statusConfig = {
    completed: { label: 'Completed', color: 'success' },
    in_progress: { label: 'In Progress', color: 'warning' },
    cancelled: { label: 'Cancelled', color: 'default' }
  };

  const viewConfig = {
    false: { direction: 'row', spacing: 2, align: 'center', mb: 0.5 },
    true: { direction: 'column', spacing: 0.5, align: '', mb: 2 }
  };

  return (
    <>
      <Paper elevation={2} sx={{ p: 2 }}>
        <Title>Patrol Histroy Details</Title>

        <Stack direction={viewConfig[isMobile].direction} spacing={viewConfig[isMobile].spacing} sx={{ mb: viewConfig[isMobile].mb }}>
          <Typography variant="body2" color="text.secondary">
            Guard Name
          </Typography>
          <Typography variant="body2" color="text.primary">
            {info.guard_user.full_name}
          </Typography>
        </Stack>

        <Stack direction={viewConfig[isMobile].direction} spacing={viewConfig[isMobile].spacing} sx={{ mb: viewConfig[isMobile].mb }}>
          <Typography variant="body2" color="text.secondary">
            Time Start
          </Typography>
          <Typography variant="body2" color="text.primary">
            {<MalaysiaTime time={info.time_start} />}
          </Typography>
        </Stack>

        <Stack direction={viewConfig[isMobile].direction} spacing={viewConfig[isMobile].spacing} sx={{ mb: viewConfig[isMobile].mb }}>
          <Typography variant="body2" color="text.secondary">
            Time End
          </Typography>
          <Typography variant="body2" color="text.primary">
            {<MalaysiaTime time={info.time_end} />}
          </Typography>
        </Stack>

        <Stack direction={viewConfig[isMobile].direction} spacing={viewConfig[isMobile].spacing} sx={{ mb: viewConfig[isMobile].mb }}>
          <Typography variant="body2" color="text.secondary">
            Zone Name
          </Typography>
          <Typography variant="body2" color="text.primary">
            {info.zone.name}
          </Typography>
        </Stack>

        <Stack
          direction={viewConfig[isMobile].direction}
          spacing={viewConfig[isMobile].spacing}
          alignItems={viewConfig[isMobile].align}
          sx={{ mb: viewConfig[isMobile].mb }}
        >
          <Typography variant="body2" color="text.secondary">
            Status
          </Typography>
          <Chip label={statusConfig[status]?.label ?? 'Unknown'} color={statusConfig[status]?.color ?? 'default'} size="small" />
        </Stack>
      </Paper>
    </>
  );
}
