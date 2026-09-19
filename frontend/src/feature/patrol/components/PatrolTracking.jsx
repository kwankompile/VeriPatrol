import { alpha } from '@mui/material/styles';
import { Box, Chip, CircularProgress, LinearProgress, List, ListItem, ListItemIcon, ListItemText, Paper, Typography } from '@mui/material';
import { IconCheck, IconMapPin } from '@tabler/icons-react';
import { calculateDistance } from '../services/geolocationService';

/**
 * Checkpoint list + progress (presentational).
 * GPS lifecycle belongs to `usePatrolController` via `feature/patrol/services/geolocationService` — this component must not start/stop watches or persist fixes.
 * Live location readout now lives under Device & Sync Health.
 */
export const PatrolTracking = ({
  checkpointLogs = [],
  progress = 0,
  completedCount = 0,
  totalCount = 0,
  currentLocation = null,
  trackingActive = false
}) => {
  return (
    <Paper
      elevation={0}
      sx={(theme) => ({
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(theme.palette.secondary.main, 0.16),
        bgcolor: theme.palette.background.paper
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <CircularProgress variant="determinate" value={100} size={62} thickness={4} sx={(theme) => ({ color: alpha(theme.palette.secondary.main, 0.14) })} />
          <CircularProgress
            variant="determinate"
            value={progress}
            size={62}
            thickness={4}
            color="secondary"
            sx={{ position: 'absolute', left: 0 }}
          />
          <Box
            sx={{
              top: 0,
              left: 0,
              bottom: 0,
              right: 0,
              position: 'absolute',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Typography variant="caption" component="div" color="secondary.dark" sx={{ fontWeight: 700 }}>
              {`${Math.round(progress)}%`}
            </Typography>
          </Box>
        </Box>
        <Box>
          <Typography variant="h5">Patrol in Progress</Typography>
          <Typography variant="body2" color="text.secondary">
            {completedCount} of {totalCount} checkpoints completed
          </Typography>
        </Box>
        <Chip
          label={trackingActive ? 'Tracking Active' : totalCount > 0 ? 'Acquiring location…' : 'Tracking Inactive'}
          color={trackingActive ? 'secondary' : 'default'}
          variant={trackingActive ? 'filled' : 'outlined'}
          size="small"
          sx={{ ml: 'auto', fontWeight: 600 }}
        />
      </Box>

      {/* <LinearProgress
        variant="determinate"
        value={progress}
        color="secondary"
        sx={{ mb: 3, height: 8, borderRadius: 4 }}
      /> */}

      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Checkpoints
      </Typography>
      <List disablePadding>
        {checkpointLogs.map((checkpointLog) => {
          const distM =
            currentLocation &&
            calculateDistance(
              currentLocation.lat,
              currentLocation.lng,
              checkpointLog.checkpoint?.latitude,
              checkpointLog.checkpoint?.longitude
            );
          const distLabel = Number.isFinite(distM) ? `${Math.round(distM)}m` : '—';
          const completed = checkpointLog.is_within_geofence;

          return (
            <ListItem
              key={checkpointLog.id}
              sx={(theme) => ({
                bgcolor: completed ? alpha(theme.palette.secondary.main, 0.08) : 'transparent',
                border: '1px solid',
                borderColor: completed ? alpha(theme.palette.secondary.main, 0.2) : theme.palette.divider,
                borderRadius: 2,
                mb: 1
              })}
            >
              <ListItemIcon sx={{ minWidth: 40 }}>
                {completed ? <IconCheck color="#673ab7" /> : <IconMapPin />}
              </ListItemIcon>
              <ListItemText
                primary={checkpointLog.checkpoint?.name || `Checkpoint ${checkpointLog.id}`}
                secondary={
                  completed ? `Completed at ${new Date(checkpointLog.actual_time).toLocaleTimeString()}` : 'Pending'
                }
              />
              {currentLocation && !completed && <Chip size="small" label={distLabel} variant="outlined" color="secondary" />}
            </ListItem>
          );
        })}
      </List>
    </Paper>
  );
};
