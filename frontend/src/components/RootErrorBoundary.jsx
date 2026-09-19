import { Component } from 'react';
import PropTypes from 'prop-types';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

// ==============================|| ROOT ERROR BOUNDARY ||============================== //

export default class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      console.error('[RootErrorBoundary]', error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    const { children } = this.props;

    if (error) {
      return (
        <Box sx={{ p: 3, maxWidth: 560, mx: 'auto', mt: 8 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            Something went wrong loading the application.
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Try reloading the page. If the problem continues, clear site data or unregister the service worker in
            DevTools (Application → Service Workers).
          </Typography>
          {import.meta.env.DEV ? (
            <Typography component="pre" variant="caption" sx={{ display: 'block', mb: 2, whiteSpace: 'pre-wrap' }}>
              {error?.message ?? String(error)}
            </Typography>
          ) : null}
          <Button variant="contained" onClick={this.handleReload}>
            Reload
          </Button>
        </Box>
      );
    }

    return children;
  }
}

RootErrorBoundary.propTypes = {
  children: PropTypes.node
};
