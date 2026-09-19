import PropTypes from 'prop-types';
import { Box, Chip, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import { IconMapPin } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

import ContentEmptyState from 'ui-component/state/ContentEmptyState';
import { formatDashboardTimestamp, formatPatrolStatusLabel } from '../utils/dashboardFormatters';

const STATUS_COLOR = {
  active: 'secondary',
  completed: 'success',
  aborted: 'error',
  needs_review: 'warning'
};

export default function DashboardPatrolList({
  sessions,
  timezone,
  detailBasePath = null,
  emptyTitle = 'No patrol sessions',
  emptyMessage = 'Active patrols will appear here.'
}) {
  const navigate = useNavigate();

  if (!sessions?.length) {
    return <ContentEmptyState title={emptyTitle} message={emptyMessage} testId="dashboard-patrol-empty" />;
  }

  return (
    <Stack spacing={1} data-testid="dashboard-patrol-list">
      {sessions.map((session) => {
        const progress = session.checkpointProgress;
        const percent = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;
        const clickable = Boolean(detailBasePath && session.id);
        return (
          <Box
            key={session.id}
            onClick={clickable ? () => navigate(`${detailBasePath}/${session.id}`) : undefined}
            sx={{
              p: 1.25,
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'divider',
              cursor: clickable ? 'pointer' : 'default',
              transition: 'background-color 0.15s ease',
              '&:hover': clickable ? { bgcolor: 'action.hover' } : undefined
            }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={0.5}>
              <Typography variant="subtitle2" noWrap>
                {session.guardName}
              </Typography>
              <Chip size="small" color={STATUS_COLOR[session.status] ?? 'default'} label={formatPatrolStatusLabel(session.status)} />
            </Stack>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary', mt: 0.25 }}>
              <IconMapPin size={13} />
              <Typography variant="caption" noWrap>
                {session.zoneName} · {formatDashboardTimestamp(session.startedAt, timezone)}
              </Typography>
            </Stack>
            {percent !== null ? (
              <Tooltip title={`${progress.completed} of ${progress.total} checkpoints`}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
                  <LinearProgress
                    variant="determinate"
                    value={percent}
                    sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                    color={percent >= 100 ? 'success' : 'secondary'}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {progress.completed}/{progress.total}
                  </Typography>
                </Stack>
              </Tooltip>
            ) : null}
            {session.attentionLabel ? (
              <Chip size="small" color="warning" variant="outlined" label={session.attentionLabel} sx={{ mt: 0.75 }} />
            ) : null}
          </Box>
        );
      })}
    </Stack>
  );
}

DashboardPatrolList.propTypes = {
  sessions: PropTypes.array,
  timezone: PropTypes.string,
  detailBasePath: PropTypes.string,
  emptyTitle: PropTypes.string,
  emptyMessage: PropTypes.string
};
