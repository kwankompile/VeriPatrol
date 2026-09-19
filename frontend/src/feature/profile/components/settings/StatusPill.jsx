import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Stack, Typography } from '@mui/material';

const TONE_TO_PALETTE = {
  active: 'secondary',
  positive: 'secondary',
  success: 'secondary',
  warning: 'warning',
  danger: 'error',
  error: 'error',
  neutral: 'grey'
};

function resolvePaletteColor(theme, tone) {
  const key = TONE_TO_PALETTE[tone] ?? 'grey';
  if (key === 'grey') {
    return theme.palette.text.secondary;
  }
  return theme.palette[key]?.main ?? theme.palette.text.secondary;
}

/**
 * Compact status pill used across the account settings surfaces.
 * Positive/active states use the secondary (purple) accent; warning/danger
 * states use amber/red so meaning is never lost.
 */
export default function StatusPill({ label, tone = 'neutral', dot = true, testId }) {
  return (
    <Box
      component="span"
      data-testid={testId}
      sx={(theme) => {
        const color = resolvePaletteColor(theme, tone);
        return {
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 999,
          px: 1.25,
          py: 0.4,
          bgcolor: alpha(color, 0.12),
          border: '1px solid',
          borderColor: alpha(color, 0.28)
        };
      }}
    >
      <Stack direction="row" spacing={0.75} alignItems="center">
        {dot ? (
          <Box
            component="span"
            sx={(theme) => ({
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: resolvePaletteColor(theme, tone)
            })}
          />
        ) : null}
        <Typography
          component="span"
          variant="caption"
          sx={(theme) => ({ fontWeight: 600, lineHeight: 1.4, color: resolvePaletteColor(theme, tone) })}
        >
          {label}
        </Typography>
      </Stack>
    </Box>
  );
}

StatusPill.propTypes = {
  label: PropTypes.node.isRequired,
  tone: PropTypes.oneOf(['active', 'positive', 'success', 'warning', 'danger', 'error', 'neutral']),
  dot: PropTypes.bool,
  testId: PropTypes.string
};
