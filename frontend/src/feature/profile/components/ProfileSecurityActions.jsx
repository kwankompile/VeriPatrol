import { useState } from 'react';

import { Alert, Button, Stack } from '@mui/material';
import { IconKey, IconMail, IconShieldLock } from '@tabler/icons-react';
import { Link as RouterLink } from 'react-router-dom';

import { useNetworkStatus } from 'pwa/useNetworkStatus';

import SettingsCard from './settings/SettingsCard';
import SettingsRow from './settings/SettingsRow';
import ChangeEmailDialog from './ChangeEmailDialog';
import ChangePasswordDialog from './ChangePasswordDialog';
import TwoFactorReconfigureDialog from './TwoFactorReconfigureDialog';

/**
 * @param {{ currentEmail?: string, hideSessionLink?: boolean }} props
 */
export default function ProfileSecurityActions({ currentEmail = '', hideSessionLink = false }) {
  const isOnline = useNetworkStatus();
  const [activeDialog, setActiveDialog] = useState(null);

  const closeDialog = () => setActiveDialog(null);

  return (
    <>
      <SettingsCard
        title="Security Actions"
        subtitle="Step-up verification is required for sensitive changes"
        icon={<IconShieldLock size={20} />}
      >
        <Stack spacing={2}>
          {!isOnline ? <Alert severity="warning">Sensitive account changes require an active network connection.</Alert> : null}

          <Stack spacing={1.25}>
            <SettingsRow
              icon={<IconKey size={18} />}
              label="Change Password"
              description="Update your password with a fresh authentication code."
              control={
                <Button variant="outlined" color="secondary" disabled={!isOnline} onClick={() => setActiveDialog('password')}>
                  Change Password
                </Button>
              }
            />
            <SettingsRow
              icon={<IconMail size={18} />}
              label="Change Email"
              description="Verify and move your account to a new email address."
              control={
                <Button variant="outlined" color="secondary" disabled={!isOnline} onClick={() => setActiveDialog('email')}>
                  Change Email
                </Button>
              }
            />
            <SettingsRow
              icon={<IconShieldLock size={18} />}
              label="Two-factor authentication"
              description="Re-run setup to move 2FA to a new authenticator app."
              control={
                <Button variant="outlined" color="secondary" disabled={!isOnline} onClick={() => setActiveDialog('2fa')}>
                  Reconfigure 2FA
                </Button>
              }
            />
            {!hideSessionLink ? (
              <SettingsRow
                icon={<IconShieldLock size={18} />}
                label="Active sessions"
                description="Review and revoke devices signed in to your account."
                control={
                  <Button component={RouterLink} to="/account/profile?tab=security" variant="contained" color="secondary">
                    Manage Sessions
                  </Button>
                }
              />
            ) : null}
          </Stack>
        </Stack>
      </SettingsCard>

      <ChangePasswordDialog open={activeDialog === 'password'} onClose={closeDialog} isOnline={isOnline} />
      <ChangeEmailDialog open={activeDialog === 'email'} onClose={closeDialog} isOnline={isOnline} currentEmail={currentEmail} />
      <TwoFactorReconfigureDialog open={activeDialog === '2fa'} onClose={closeDialog} isOnline={isOnline} />
    </>
  );
}
