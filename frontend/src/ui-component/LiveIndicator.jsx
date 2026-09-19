import PropTypes from 'prop-types';
import { Box, Tooltip } from '@mui/material';
import { keyframes } from '@mui/system';

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
`;

const STATUS_CONFIG = {
  live: {
    tooltip: 'Live update',
    dotColor: 'error.main',
    blink: true
  },
  reconnecting: {
    tooltip: 'Last refresh failed. Retrying…',
    dotColor: 'warning.main',
    blink: false
  },
  paused: {
    tooltip: 'Live updates paused',
    dotColor: 'text.disabled',
    blink: false
  }
};

export default function LiveIndicator({ status = 'live' }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.live;

  return (
    <Tooltip title={config.tooltip} arrow>
      <Box
        component="span"
        role="status"
        aria-label={config.tooltip}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          ml: { xs: 0, sm: 1 },
          mt: { xs: 0.5, sm: 0 }
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: config.dotColor,
            flexShrink: 0,
            animation: config.blink ? `${blink} 1.4s ease-in-out infinite` : 'none'
          }}
        />
      </Box>
    </Tooltip>
  );
}

LiveIndicator.propTypes = {
  status: PropTypes.oneOf(['live', 'reconnecting', 'paused'])
};
