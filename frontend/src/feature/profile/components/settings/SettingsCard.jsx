import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Divider, Paper, Stack, Typography } from '@mui/material';

/**
 * ChatGPT-style settings card: clean white surface, rounded corners, minimal
 * border, subtle shadow, and an optional icon + title header tinted with the
 * app's secondary accent.
 */
export default function SettingsCard({ title, subtitle = null, icon = null, action = null, disableDivider = false, children, testId, sx }) {
  return (
    <Paper
      data-testid={testId}
      elevation={0}
      sx={(theme) => ({
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(theme.palette.secondary.main, 0.14),
        boxShadow: '0 1px 3px 0 rgb(32 40 45 / 6%)',
        overflow: 'hidden',
        transition: 'box-shadow 160ms ease, border-color 160ms ease',
        ':hover': { boxShadow: '0 6px 22px 0 rgb(32 40 45 / 9%)' },
        ...(typeof sx === 'function' ? sx(theme) : sx || {})
      })}
    >
      {title ? (
        <>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            spacing={1.5}
            sx={(theme) => ({
              px: { xs: 2, sm: 2.5 },
              py: { xs: 1.75, sm: 2 },
              background: `linear-gradient(120deg, ${alpha(theme.palette.secondary.main, 0.1)} 0%, ${alpha(
                theme.palette.secondary.main,
                0.02
              )} 70%, ${alpha(theme.palette.background.paper, 0)} 100%)`
            })}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
              {icon ? (
                <Box
                  aria-hidden
                  sx={(theme) => ({
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 38,
                    height: 38,
                    borderRadius: 2,
                    flexShrink: 0,
                    color: theme.palette.secondary.main,
                    bgcolor: alpha(theme.palette.secondary.main, 0.14)
                  })}
                >
                  {icon}
                </Box>
              ) : null}
              <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                  {title}
                </Typography>
                {subtitle ? (
                  <Typography variant="caption" color="text.secondary">
                    {subtitle}
                  </Typography>
                ) : null}
              </Stack>
            </Stack>
            {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
          </Stack>
          {disableDivider ? null : <Divider sx={{ borderColor: 'divider' }} />}
        </>
      ) : null}
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: { xs: 2, sm: 2.5 } }}>{children}</Box>
    </Paper>
  );
}

SettingsCard.propTypes = {
  title: PropTypes.node,
  subtitle: PropTypes.node,
  icon: PropTypes.node,
  action: PropTypes.node,
  disableDivider: PropTypes.bool,
  children: PropTypes.node,
  testId: PropTypes.string,
  sx: PropTypes.oneOfType([PropTypes.object, PropTypes.func])
};
