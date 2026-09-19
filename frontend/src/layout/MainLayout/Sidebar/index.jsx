import { memo, useMemo } from 'react';

import useMediaQuery from '@mui/material/useMediaQuery';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';

// project imports
import MenuCard from './MenuCard';
import SidebarPwaInstall from './SidebarPwaInstall';
import MenuList from '../MenuList';
import LogoSection from '../LogoSection';
import MiniDrawerStyled from './MiniDrawerStyled';

import usePwaInstallPrompt from 'hooks/usePwaInstallPrompt';
import useConfig from 'hooks/useConfig';
import { drawerWidth } from 'store/constant';
import SimpleBar from 'ui-component/third-party/SimpleBar';

import { handlerDrawerOpen, useGetMenuMaster } from 'api/menu';

// ==============================|| SIDEBAR DRAWER ||============================== //

function Sidebar() {
  const downMD = useMediaQuery((theme) => theme.breakpoints.down('md'));

  const { menuMaster } = useGetMenuMaster();
  const drawerOpen = Boolean(menuMaster?.isDashboardDrawerOpened);

  const {
    state: { miniDrawer }
  } = useConfig();

  const { deferredPrompt, showInstallButton, promptInstall, isInstalled, isStandalone, showUnsupportedHint } = usePwaInstallPrompt();
  const hasDeferredPrompt = Boolean(deferredPrompt);

  const logo = useMemo(
    () => (
      <Box sx={{ display: 'flex', p: 2 }}>
        <LogoSection />
      </Box>
    ),
    []
  );

  const drawer = useMemo(() => {
    const drawerContent = (
      <>
        <MenuCard />
        {/* <Stack direction="row" sx={{ justifyContent: 'center', mb: 2 }}>
          <Chip label={import.meta.env.VITE_APP_VERSION} size="small" color="default" />
        </Stack> */}
      </>
    );

    let drawerSX = { paddingLeft: '0px', paddingRight: '0px', marginTop: '20px' };
    if (drawerOpen) drawerSX = { paddingLeft: '16px', paddingRight: '16px', marginTop: '0px' };

    const pwaInstallProps = {
      downMD,
      drawerOpen,
      showInstallButton,
      isInstalled,
      isStandalone,
      hasDeferredPrompt,
      promptInstall,
      showUnsupportedHint
    };

    return (
      <>
        {downMD ? (
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              width: '100%',
              ...drawerSX
            }}
          >
            {/*
              Do not use SimpleBar here on small screens: it wraps content in both BrowserView and MobileView
              (react-device-detect). On real phones isBrowser and isMobile are often both true, so the desktop
              branch still mounts with flexGrow:1 + height:100% and steals the drawer column — pushing the PWA
              install footer below the viewport. Native overflow matches MUI breakpoints without UA sniffing.
            */}
            <Stack direction="column" sx={{ flex: 1, minHeight: 0 }}>
              <Box
                sx={{
                  flex: '1 1 0',
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  WebkitOverflowScrolling: 'touch'
                }}
              >
                <MenuList />
                {drawerOpen && drawerContent}
              </Box>
              {drawerOpen && <SidebarPwaInstall {...pwaInstallProps} />}
            </Stack>
          </Box>
        ) : (
          <Stack direction="column" sx={{ height: 'calc(100vh - 90px)', minHeight: 0, ...drawerSX }}>
            <SimpleBar sx={{ flex: '1 1 auto', minHeight: 0 }}>
              <MenuList />
              {drawerOpen && drawerContent}
            </SimpleBar>
            {drawerOpen && <SidebarPwaInstall {...pwaInstallProps} />}
          </Stack>
        )}
      </>
    );
  }, [downMD, drawerOpen, showInstallButton, isInstalled, isStandalone, hasDeferredPrompt, promptInstall, showUnsupportedHint]);

  return (
    <Box component="nav" sx={{ flexShrink: { md: 0 }, width: { xs: 'auto', md: drawerWidth } }} aria-label="mailbox folders">
      {downMD || (miniDrawer && drawerOpen) ? (
        <Drawer
          variant={downMD ? 'temporary' : 'persistent'}
          anchor="left"
          open={drawerOpen}
          onClose={() => handlerDrawerOpen(!drawerOpen)}
          slotProps={{
            paper: {
              sx: {
                mt: downMD ? 0 : 11,
                zIndex: 1099,
                width: drawerWidth,
                bgcolor: 'background.default',
                color: 'text.primary',
                borderRight: 'none',
                ...(downMD && {
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  maxHeight: '100dvh'
                })
              }
            }
          }}
          ModalProps={{ keepMounted: true }}
          color="inherit"
        >
          {downMD && logo}
          {drawer}
        </Drawer>
      ) : (
        <MiniDrawerStyled variant="permanent" open={drawerOpen}>
          {logo}
          {drawer}
        </MiniDrawerStyled>
      )}
    </Box>
  );
}

export default memo(Sidebar);
