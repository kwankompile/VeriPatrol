import PropTypes from 'prop-types';
import { Box, Button, Chip, FormControl, InputLabel, MenuItem, Paper, Select, Slider, Stack, Typography } from '@mui/material';
import { IconPlayerPause, IconPlayerPlay, IconRotateClockwise } from '@tabler/icons-react';

import { MalaysiaTime } from 'ui-component/MalaysiaTime';
import ContentEmptyState from 'ui-component/state/ContentEmptyState';
import {
  formatReplayAccuracy,
  formatReplayAnomalyChip,
  formatReplayCoordinate,
  formatReplayPointLabel,
  REPLAY_SPEED_OPTIONS
} from '../utils/patrolReplayUtils';

export default function PatrolReplayControls({
  replayEnabled = true,
  canReplay = false,
  hasEnoughPoints = false,
  routeCount = 0,
  currentIndex = 0,
  isPlaying = false,
  replayProgress = 0,
  replayTime = null,
  currentRoutePoint = null,
  speedMultiplier = 1,
  replayFinished = false,
  currentSegmentAnomaly = null,
  onPlay,
  onPause,
  onStop,
  onSeek,
  onSpeedChange
}) {
  if (!replayEnabled) {
    return (
      <ContentEmptyState
        title="Replay unavailable"
        message="Route replay is available after the patrol session is completed or aborted."
        testId="patrol-replay-unavailable"
      />
    );
  }

  if (routeCount === 0) {
    return (
      <ContentEmptyState
        title="No route data"
        message="This session has no recorded GPS route points to replay."
        testId="patrol-replay-no-route"
      />
    );
  }

  if (!hasEnoughPoints) {
    return (
      <ContentEmptyState
        title="Not enough route points"
        message="At least two route points are required to animate replay. Additional GPS logs may appear after sync."
        testId="patrol-replay-not-enough-points"
      />
    );
  }

  const anomalyLabel = formatReplayAnomalyChip(currentSegmentAnomaly);

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }} data-testid="patrol-replay-controls">
      <Stack spacing={1.5}>
        <Typography variant="subtitle2">Route replay</Typography>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            size="small"
            startIcon={isPlaying ? <IconPlayerPause size={18} /> : <IconPlayerPlay size={18} />}
            onClick={isPlaying ? onPause : onPlay}
            disabled={!canReplay}
          >
            {isPlaying ? 'Pause' : replayFinished ? 'Replay again' : 'Play'}
          </Button>
          <Button variant="outlined" size="small" startIcon={<IconRotateClockwise size={18} />} onClick={onStop} disabled={!canReplay}>
            Stop
          </Button>
          <FormControl size="small" sx={{ minWidth: 88 }}>
            <InputLabel id="replay-speed-label">Speed</InputLabel>
            <Select labelId="replay-speed-label" label="Speed" value={speedMultiplier} onChange={(e) => onSpeedChange?.(e.target.value)}>
              {REPLAY_SPEED_OPTIONS.map((speed) => (
                <MenuItem key={speed} value={speed}>
                  {speed}x
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {replayFinished ? <Chip size="small" label="Finished" color="success" variant="outlined" /> : null}
        </Stack>

        <Box sx={{ px: 0.5 }}>
          <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Timeline
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatReplayPointLabel(currentIndex, routeCount)}
            </Typography>
          </Stack>
          <Slider
            size="small"
            value={replayProgress}
            min={0}
            max={100}
            step={0.1}
            onChange={(_, value) => onSeek?.(Array.isArray(value) ? value[0] / 100 : value / 100)}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v)}%`}
            disabled={!canReplay}
            aria-label="Replay timeline"
          />
        </Box>

        <Stack direction="row" flexWrap="wrap" spacing={2} useFlexGap>
          <Typography variant="caption" color="text.secondary">
            Current time:{' '}
            <strong>{replayTime ? <MalaysiaTime time={replayTime} /> : '—'}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Position: <strong>{formatReplayCoordinate(currentRoutePoint)}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Accuracy: <strong>{formatReplayAccuracy(currentRoutePoint)}</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Progress: <strong>{Math.round(replayProgress)}%</strong>
          </Typography>
        </Stack>

        {anomalyLabel ? <Chip size="small" color="warning" label={anomalyLabel} sx={{ alignSelf: 'flex-start' }} /> : null}
      </Stack>
    </Paper>
  );
}

PatrolReplayControls.propTypes = {
  replayEnabled: PropTypes.bool,
  canReplay: PropTypes.bool,
  hasEnoughPoints: PropTypes.bool,
  routeCount: PropTypes.number,
  currentIndex: PropTypes.number,
  isPlaying: PropTypes.bool,
  replayProgress: PropTypes.number,
  replayTime: PropTypes.string,
  currentRoutePoint: PropTypes.object,
  speedMultiplier: PropTypes.number,
  replayFinished: PropTypes.bool,
  currentSegmentAnomaly: PropTypes.object,
  onPlay: PropTypes.func,
  onPause: PropTypes.func,
  onStop: PropTypes.func,
  onSeek: PropTypes.func,
  onSpeedChange: PropTypes.func
};
