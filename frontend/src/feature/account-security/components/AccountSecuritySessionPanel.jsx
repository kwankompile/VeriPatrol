import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material';
import { alpha, useTheme, useMediaQuery } from '@mui/material';
import { IconDevices, IconLogout } from '@tabler/icons-react';

import { PaginationFooter } from 'ui-component/table/PaginationFooter';
import { useNetworkStatus } from 'pwa/useNetworkStatus';

import SettingsCard from '../../profile/components/settings/SettingsCard';
import StatusPill from '../../profile/components/settings/StatusPill';
import AuthSessionTable from '../../auth-monitoring/components/AuthSessionTable';
import { useAccountSecurityController } from '../controllers/useAccountSecurityController';

export default function AccountSecuritySessionPanel() {
  const controller = useAccountSecurityController();
  const isOnline = useNetworkStatus();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const sessionActionsDisabled = !isOnline;

  const confirmOpen = Boolean(controller.confirmAction);
  const confirmMessage =
    controller.confirmAction?.type === 'logout-all'
      ? 'This will sign you out on every device. Continue?'
      : controller.confirmAction?.isCurrent
        ? 'Revoke your current session? You will be signed out immediately.'
        : 'Revoke this session? The device will need to sign in again.';

  const sessionCount = controller.pagination?.total ?? 0;
  const sessionSummary = controller.loading
    ? 'Checking sessions…'
    : `${sessionCount} active ${sessionCount === 1 ? 'session' : 'sessions'}`;

  return (
    <SettingsCard
      title="Active Sessions"
      subtitle="Devices signed in to your account"
      icon={<IconDevices size={20} />}
      action={<StatusPill label={sessionSummary} tone={sessionCount > 0 ? 'active' : 'neutral'} />}
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Review devices signed in to your account. Revoking a session signs that device out. Session details never include tokens or
          secrets.
        </Typography>

        {sessionActionsDisabled ? (
          <Alert severity="warning">Session revocation requires an active network connection.</Alert>
        ) : null}

        {controller.error ? <Alert severity="error">{controller.error}</Alert> : null}

        {controller.loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress color="secondary" />
          </Box>
        ) : (
          <AuthSessionTable
            sessions={controller.sessions}
            revokingId={controller.revokingId}
            onRevoke={controller.requestRevokeSession}
            showUserColumn={false}
            revokeDisabled={sessionActionsDisabled}
          />
        )}

        {controller.pagination.total > 0 ? (
          <PaginationFooter
            filteredCount={controller.pagination.total}
            page={controller.page}
            rowsPerPage={controller.rowsPerPage}
            isMobile={isMobile}
            onPageChange={(_, nextPage) => controller.setPage(nextPage)}
            onRowsPerPageChange={(event) => {
              controller.setRowsPerPage(parseInt(event.target.value, 10));
              controller.setPage(0);
            }}
          />
        ) : null}

        <Box
          sx={(t) => ({
            mt: 0.5,
            p: 2,
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: alpha(t.palette.error.main, 0.28),
            bgcolor: alpha(t.palette.error.main, 0.05)
          })}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            justifyContent="space-between"
          >
            <Stack spacing={0.25}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Sign out everywhere
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Revoke every session, including this device. You will need to sign in again.
              </Typography>
            </Stack>
            <Button
              color="error"
              variant="outlined"
              startIcon={<IconLogout size={16} />}
              disabled={sessionActionsDisabled || controller.logoutAllLoading || controller.loading}
              onClick={controller.requestLogoutAll}
              sx={{ flexShrink: 0 }}
            >
              {controller.logoutAllLoading ? 'Revoking…' : 'Revoke all sessions'}
            </Button>
          </Stack>
        </Box>
      </Stack>

      <Dialog open={confirmOpen} onClose={controller.cancelConfirm} aria-labelledby="account-security-confirm-title">
        <DialogTitle id="account-security-confirm-title">Confirm session action</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirmMessage}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={controller.cancelConfirm}>Cancel</Button>
          <Button color="error" onClick={() => void controller.confirmDestructiveAction()}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </SettingsCard>
  );
}
