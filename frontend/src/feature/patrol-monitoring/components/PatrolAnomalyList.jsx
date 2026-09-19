import PropTypes from 'prop-types';
import { Box, Chip, List, ListItemButton, ListItemText, Stack, Typography } from '@mui/material';

import { countAnomaliesBySeverity, formatAnomalyTimeRange, getAnomalyTypeLabel } from '../utils/patrolAnomalyUtils';

function severityColor(severity) {
  return severity === 'major' ? 'error' : 'warning';
}

export default function PatrolAnomalyList({ anomalies = [], selectedAnomalyId = null, onSelectAnomaly, showAnomalies = true }) {
  if (!showAnomalies) {
    return null;
  }

  if (!anomalies.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
        No route concerns detected.
      </Typography>
    );
  }

  const counts = countAnomaliesBySeverity(anomalies);

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <Typography variant="subtitle2">
          {counts.total} movement review item{counts.total === 1 ? '' : 's'}
        </Typography>
        {counts.major > 0 ? <Chip size="small" label={`${counts.major} needs attention`} color="error" variant="outlined" /> : null}
        {counts.minor > 0 ? <Chip size="small" label={`${counts.minor} advisory`} color="warning" variant="outlined" /> : null}
      </Stack>
      <List dense disablePadding sx={{ maxHeight: 280, overflow: 'auto' }}>
        {anomalies.map((item) => (
          <ListItemButton
            key={item.id}
            selected={selectedAnomalyId === item.id}
            onClick={() => onSelectAnomaly?.(item)}
            sx={{ borderRadius: 1, mb: 0.5 }}
          >
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography variant="body2" fontWeight={600}>
                    {getAnomalyTypeLabel(item.type)}
                  </Typography>
                  <Chip size="small" label={item.severity} color={severityColor(item.severity)} variant="outlined" />
                </Stack>
              }
              secondary={
                <>
                  <Typography variant="caption" component="div" color="text.secondary">
                    {item.message || '—'}
                  </Typography>
                  <Typography variant="caption" component="div" color="text.secondary">
                    {formatAnomalyTimeRange(item)}
                  </Typography>
                </>
              }
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

PatrolAnomalyList.propTypes = {
  anomalies: PropTypes.arrayOf(PropTypes.object),
  selectedAnomalyId: PropTypes.string,
  onSelectAnomaly: PropTypes.func,
  showAnomalies: PropTypes.bool
};
