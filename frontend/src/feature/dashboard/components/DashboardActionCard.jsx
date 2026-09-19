import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { IconArrowRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

export default function DashboardActionCard({ action }) {
  const navigate = useNavigate();

  if (!action) return null;

  return (
    <Paper
      elevation={0}
      role="button"
      tabIndex={0}
      onClick={() => navigate(action.path)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          navigate(action.path);
        }
      }}
      data-testid={`dashboard-action-${action.id}`}
      sx={(theme) => ({
        p: 2,
        height: '100%',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          borderColor: alpha(theme.palette.secondary.main, 0.5),
          boxShadow: `0 10px 24px ${alpha(theme.palette.secondary.main, 0.16)}`
        }
      })}
    >
      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
          {action.icon ? (
            <Box
              sx={(theme) => ({
                display: 'inline-flex',
                width: 36,
                height: 36,
                borderRadius: 2,
                alignItems: 'center',
                justifyContent: 'center',
                color: theme.palette.secondary.main,
                bgcolor: alpha(theme.palette.secondary.main, 0.12)
              })}
            >
              {action.icon}
            </Box>
          ) : null}
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
            {action.label}
          </Typography>
        </Stack>
        <IconArrowRight size={18} />
      </Stack>
    </Paper>
  );
}

DashboardActionCard.propTypes = {
  action: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    icon: PropTypes.node
  })
};
