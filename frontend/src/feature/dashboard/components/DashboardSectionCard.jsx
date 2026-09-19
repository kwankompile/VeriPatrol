import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { IconArrowRight } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

export default function DashboardSectionCard({ title, subtitle = null, icon = null, tone = 'secondary', action = null, children, testId }) {
  const navigate = useNavigate();

  return (
    <Paper
      data-testid={testId}
      elevation={0}
      sx={{
        p: { xs: 2, sm: 2.5 },
        height: '100%',
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Stack
        direction="row"
        alignItems="flex-start"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 2 }}
        flexWrap="wrap"
        gap={1}
      >
        <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
          {icon ? (
            <Box
              sx={(theme) => ({
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: 2,
                color: theme.palette[tone]?.main ?? theme.palette.primary.main,
                bgcolor: alpha(theme.palette[tone]?.main ?? theme.palette.primary.main, 0.14)
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
        {action?.path ? (
          <Button
            size="small"
            color={tone}
            endIcon={<IconArrowRight size={16} />}
            onClick={() => navigate(action.path)}
            data-testid={action.testId}
            sx={{ flexShrink: 0 }}
          >
            {action.label ?? 'View'}
          </Button>
        ) : null}
      </Stack>
      <Box sx={{ flexGrow: 1 }}>{children}</Box>
    </Paper>
  );
}

DashboardSectionCard.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  icon: PropTypes.node,
  tone: PropTypes.string,
  action: PropTypes.shape({
    label: PropTypes.string,
    path: PropTypes.string,
    testId: PropTypes.string
  }),
  children: PropTypes.node,
  testId: PropTypes.string
};
