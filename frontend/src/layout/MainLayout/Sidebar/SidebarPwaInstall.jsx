import { Component, memo, useEffect } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';

import GetAppOutlinedIcon from '@mui/icons-material/GetAppOutlined';

import { pwaDebug } from 'pwa/pwaLogger';

// ==============================|| SIDEBAR - PWA INSTALL (ERROR BOUNDARY) ||============================== //

class PwaInstallErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.warn('[PWA] SidebarPwaInstall failed; hiding install UI.', error);
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function SidebarPwaInstallInner({
  downMD,
  drawerOpen,
  showInstallButton,
  isInstalled,
  isStandalone,
  hasDeferredPrompt,
  promptInstall,
  showUnsupportedHint
}) {
  useEffect(() => {
    if (!downMD) return;
    pwaDebug('[PWA][mobile sidebar]', {
      downMD,
      drawerOpen,
      showInstallButton,
      isInstalled,
      canInstall: hasDeferredPrompt,
      isStandalone
    });
  }, [downMD, drawerOpen, showInstallButton, isInstalled, hasDeferredPrompt, isStandalone]);

  if (!showInstallButton && !showUnsupportedHint) {
    return null;
  }

  return (
    <Box sx={{ pb: 2, pt: 1, flexShrink: 0 }}>
      {showInstallButton ? (
        <Button
          fullWidth
          variant="outlined"
          color="primary"
          size="small"
          aria-label="Install VeriPatrol app"
          title="Install VeriPatrol for faster home-screen access"
          startIcon={<GetAppOutlinedIcon />}
          onClick={() => {
            void promptInstall();
          }}
        >
          Install VeriPatrol
        </Button>
      ) : null}
      {showUnsupportedHint ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, px: 0.5 }}>
          Install prompt is unavailable in this browser.
        </Typography>
      ) : null}
    </Box>
  );
}

/** Install UI only; parent must call usePwaInstallPrompt so listeners run even when drawer is closed. */
function SidebarPwaInstall(props) {
  return (
    <PwaInstallErrorBoundary>
      <SidebarPwaInstallInner {...props} />
    </PwaInstallErrorBoundary>
  );
}

export default memo(SidebarPwaInstall);
