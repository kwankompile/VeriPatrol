import PropTypes from 'prop-types';
import { Box, Typography } from '@mui/material';

export default function ContentEmptyState({ title, message, action = null, testId = 'content-empty-state' }) {
  return (
    <Box
      data-testid={testId}
      sx={{
        py: 4,
        px: 2,
        textAlign: 'center',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}
    >
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {title}
      </Typography>
      {message ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: action ? 2 : 0 }}>
          {message}
        </Typography>
      ) : null}
      {action}
    </Box>
  );
}

ContentEmptyState.propTypes = {
  title: PropTypes.string.isRequired,
  message: PropTypes.string,
  action: PropTypes.node,
  testId: PropTypes.string
};
