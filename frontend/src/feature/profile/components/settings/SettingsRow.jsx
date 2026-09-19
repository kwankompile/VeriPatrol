import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Stack, Typography } from '@mui/material';

/**
 * A modern settings row (ChatGPT-style): leading icon, a label with optional
 * secondary description, and a trailing control/value area. Stacks gracefully
 * on mobile so the control never gets squeezed.
 */
export default function SettingsRow({ icon = null, label, description = null, control = null, tone = 'secondary', align = 'center', testId }) {
  return (
    <Stack
      data-testid={testId}
      direction={{ xs: 'column', sm: 'row' }}
      spacing={{ xs: 1.25, sm: 2 }}
      alignItems={{ xs: 'stretch', sm: align }}
      justifyContent="space-between"
      sx={(theme) => ({
        px: { xs: 1.5, sm: 2 },
        py: 1.75,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: alpha(theme.palette.secondary.main, 0.1),
        bgcolor: alpha(theme.palette.secondary.main, 0.02),
        transition: 'border-color 160ms ease, background-color 160ms ease',
        ':hover': {
          borderColor: alpha(theme.palette.secondary.main, 0.22),
          bgcolor: alpha(theme.palette.secondary.main, 0.05)
        }
      })}
    >
      <Stack direction="row" spacing={1.5} alignItems={align === 'flex-start' ? 'flex-start' : 'center'} sx={{ minWidth: 0 }}>
        {icon ? (
          <Box
            aria-hidden
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 2,
              flexShrink: 0,
              mt: align === 'flex-start' ? 0.25 : 0,
              color: theme.palette[tone]?.main ?? theme.palette.secondary.main,
              bgcolor: alpha(theme.palette[tone]?.main ?? theme.palette.secondary.main, 0.12)
            })}
          >
            {icon}
          </Box>
        ) : null}
        <Stack spacing={0.25} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.35 }}>
            {label}
          </Typography>
          {description ? (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.45 }}>
              {description}
            </Typography>
          ) : null}
        </Stack>
      </Stack>
      {control ? (
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: { xs: 'flex-start', sm: 'flex-end' },
            pl: { xs: icon ? 6.25 : 0, sm: 0 }
          }}
        >
          {control}
        </Box>
      ) : null}
    </Stack>
  );
}

SettingsRow.propTypes = {
  icon: PropTypes.node,
  label: PropTypes.node.isRequired,
  description: PropTypes.node,
  control: PropTypes.node,
  tone: PropTypes.string,
  align: PropTypes.oneOf(['center', 'flex-start']),
  testId: PropTypes.string
};
