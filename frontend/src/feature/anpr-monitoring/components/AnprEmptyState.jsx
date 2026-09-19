import PropTypes from 'prop-types';
import { Box, Stack, Typography } from '@mui/material';
import { IconCar } from '@tabler/icons-react';

export default function AnprEmptyState({ title = 'No ANPR detections', description, action }) {
  return (
    <Box
      sx={{
        py: 6,
        px: 2,
        textAlign: 'center',
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2
      }}
    >
      <Stack spacing={1.5} alignItems="center">
        <IconCar size={40} stroke={1.25} opacity={0.5} />
        <Typography variant="h6">{title}</Typography>
        {description ? (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
            {description}
          </Typography>
        ) : null}
        {action}
      </Stack>
    </Box>
  );
}

AnprEmptyState.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  action: PropTypes.node
};
