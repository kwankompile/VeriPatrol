import PropTypes from 'prop-types';
import { Box, Stack, Tooltip, Typography } from '@mui/material';

import { MAP_ANOMALY_LEGEND_ITEMS, MAP_ROUTE_LEGEND_ITEMS } from '../utils/mapLegendUtils';
import { getCheckpointStatusTooltip, M8_CHECKPOINT_STATUSES, resolveCheckpointStatus } from '../utils/patrolStatusUtils';

export const MAP_LEGEND_HELP_TOOLTIP =
  'Shows route colors, checkpoint markers, replay marker, GPS accuracy indicators, and anomaly symbols used on the patrol map.';

function LegendSwatch({ color, style }) {
  if (style === 'dot') {
    return (
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          bgcolor: color,
          border: '1px solid rgba(0,0,0,0.2)'
        }}
      />
    );
  }

  if (style === 'pin') {
    return (
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: color,
          border: '2px solid #fff',
          boxShadow: 1
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        width: 28,
        height: 0,
        borderTop: style === 'dashed' ? `3px dashed ${color}` : `3px solid ${color}`
      }}
    />
  );
}

LegendSwatch.propTypes = {
  color: PropTypes.string.isRequired,
  style: PropTypes.string
};

function LegendEntry({ testId, title, label, swatch }) {
  return (
    <Tooltip title={title} arrow describeChild>
      <Stack
        component="span"
        direction="row"
        alignItems="center"
        spacing={0.75}
        data-testid={testId}
        sx={{ display: 'inline-flex', cursor: 'help' }}
      >
        {swatch}
        <Typography variant="caption" component="span">
          {label}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

LegendEntry.propTypes = {
  testId: PropTypes.string,
  title: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  swatch: PropTypes.node.isRequired
};

export default function MapLegend({ gapCount = 0, anomalyCount = 0 }) {
  return (
    <Box sx={{ mt: 1 }} data-testid="map-legend-content">
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Map legend
      </Typography>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} sx={{ mb: 1 }}>
        {MAP_ROUTE_LEGEND_ITEMS.map((item) => (
          <LegendEntry
            key={item.key}
            testId={`map-legend-route-${item.key}`}
            title={item.description}
            label={item.label}
            swatch={<LegendSwatch color={item.color} style={item.style} />}
          />
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Movement review (after validation)
      </Typography>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} sx={{ mb: 1 }}>
        {MAP_ANOMALY_LEGEND_ITEMS.map((item) => (
          <LegendEntry
            key={item.key}
            testId={`map-legend-anomaly-${item.key}`}
            title={item.description}
            label={item.label}
            swatch={<LegendSwatch color={item.color} style={item.style} />}
          />
        ))}
      </Stack>
      <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2}>
        {M8_CHECKPOINT_STATUSES.map((key) => {
          const item = resolveCheckpointStatus(key);
          return (
            <LegendEntry
              key={key}
              testId={`map-legend-checkpoint-${key}`}
              title={getCheckpointStatusTooltip(key)}
              label={item.label}
              swatch={
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: item.mapColor,
                    border: '2px solid #fff',
                    boxShadow: 1
                  }}
                />
              }
            />
          );
        })}
      </Stack>
      {gapCount > 0 ? (
        <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 1 }}>
          {gapCount} GPS gap{gapCount === 1 ? '' : 's'} detected between route points (&gt;30s).
        </Typography>
      ) : null}
      {anomalyCount > 0 ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: gapCount > 0 ? 0.5 : 1 }}>
          {anomalyCount} movement review item{anomalyCount === 1 ? '' : 's'} from backend validation.
        </Typography>
      ) : null}
    </Box>
  );
}

MapLegend.propTypes = {
  gapCount: PropTypes.number,
  anomalyCount: PropTypes.number
};
