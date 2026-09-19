import PropTypes from 'prop-types';
import { Alert, Box, Button } from '@mui/material';

export default function ContentErrorState({ message, onRetry, testId = 'content-error-state' }) {
  return (
    <Box data-testid={testId}>
      <Alert
        severity="error"
        action={
          onRetry ? (
            <Button color="inherit" size="small" onClick={onRetry}>
              Retry
            </Button>
          ) : null
        }
      >
        {message}
      </Alert>
    </Box>
  );
}

ContentErrorState.propTypes = {
  message: PropTypes.string.isRequired,
  onRetry: PropTypes.func,
  testId: PropTypes.string
};
