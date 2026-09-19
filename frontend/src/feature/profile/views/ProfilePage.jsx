import { useCallback, useState } from 'react';
import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';

import { alpha } from '@mui/material/styles';
import { Alert, Box, Button, CircularProgress, Skeleton, Stack, Tab, Tabs, Typography } from '@mui/material';
import { IconRefresh, IconSettings } from '@tabler/icons-react';

import AccountSecuritySessionPanel from '../../account-security/components/AccountSecuritySessionPanel';
import ProfileContactCard from '../components/ProfileContactCard';
import ProfileContactDialog from '../components/ProfileContactDialog';
import ProfileNotificationSettingsCard from '../components/ProfileNotificationSettingsCard';
import ProfileOfflineConflictAlert from '../components/ProfileOfflineConflictAlert';
import ProfilePictureDialog from '../components/ProfilePictureDialog';
import ProfileSecurityActions from '../components/ProfileSecurityActions';
import ProfileSecurityOverview from '../components/ProfileSecurityOverview';
import ProfileSummaryCard from '../components/ProfileSummaryCard';
import { useProfileController } from '../controllers/useProfileController';
import { PROFILE_QUEUE_STATUS_CONFLICT, PROFILE_QUEUE_STATUS_EXHAUSTED, PROFILE_QUEUE_STATUS_FAILED } from '../offline/profileOfflineQueue';
import { ACCOUNT_SETTINGS_TABS, resolveAccountSettingsTab } from '../utils/accountSettingsTabs';

function ProfileTabSkeleton() {
  return (
    <Stack spacing={2} data-testid="profile-tab-skeleton">
      <Skeleton variant="rounded" height={160} />
      <Skeleton variant="rounded" height={120} />
      <Skeleton variant="rounded" height={200} />
      <Skeleton variant="rounded" height={180} />
    </Stack>
  );
}

function AccountSettingsHeader({ onRefresh, refreshing, busy, showRetry, onRetry, retrying }) {
  return (
    <Box
      data-testid="account-settings-header"
      sx={(theme) => ({
        p: { xs: 2.5, sm: 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: alpha(theme.palette.secondary.main, 0.2),
        background: `linear-gradient(120deg, ${alpha(theme.palette.secondary.main, 0.16)} 0%, ${alpha(
          theme.palette.secondary.dark,
          0.08
        )} 55%, ${alpha(theme.palette.background.paper, 0)} 100%)`,
        backgroundColor: 'background.paper'
      })}
    >
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent="space-between"
      >
        <Stack direction="row" spacing={1.75} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            aria-hidden
            sx={(theme) => ({
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 2.5,
              flexShrink: 0,
              color: theme.palette.secondary.main,
              bgcolor: alpha(theme.palette.secondary.main, 0.16)
            })}
          >
            <IconSettings size={26} />
          </Box>
          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography variant="h2" sx={{ fontWeight: 700 }}>
              Account Settings
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Manage your profile, notifications, and account security in one place.
            </Typography>
          </Stack>
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
          {showRetry ? (
            <Button variant="outlined" color="secondary" onClick={onRetry} disabled={retrying}>
              Retry sync
            </Button>
          ) : null}
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<IconRefresh size={16} />}
            onClick={onRefresh}
            disabled={busy}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

AccountSettingsHeader.propTypes = {
  onRefresh: PropTypes.func,
  refreshing: PropTypes.bool,
  busy: PropTypes.bool,
  showRetry: PropTypes.bool,
  onRetry: PropTypes.func,
  retrying: PropTypes.bool
};

export default function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = resolveAccountSettingsTab(searchParams.get('tab'));
  const [pictureDialogOpen, setPictureDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  const {
    profile,
    loading,
    refreshing,
    saving,
    error,
    saveError,
    fieldErrors,
    successMessage,
    conflictMessage,
    offlineQueueItem,
    offlineQueueMessage,
    offlineSyncing,
    pictureSaving,
    pictureRemoving,
    pictureError,
    pictureFieldErrors,
    pictureSuccessMessage,
    reload,
    updateContact,
    dismissOfflineConflict,
    reapplyOfflineConflict,
    retryOfflineSync,
    uploadPicture,
    deletePicture,
    clearPictureMessages,
    isOnline
  } = useProfileController();

  const pageBusy = loading || refreshing || saving || pictureSaving || pictureRemoving;
  const showOfflineConflict = offlineQueueItem?.status === PROFILE_QUEUE_STATUS_CONFLICT;
  const showRetryOfflineSync =
    offlineQueueItem?.status === PROFILE_QUEUE_STATUS_FAILED || offlineQueueItem?.status === PROFILE_QUEUE_STATUS_EXHAUSTED;

  const handleTabChange = useCallback(
    (_, nextTab) => {
      setSearchParams(
        (current) => {
          const params = new URLSearchParams(current);
          if (nextTab === ACCOUNT_SETTINGS_TABS.PROFILE) {
            params.delete('tab');
          } else {
            params.set('tab', nextTab);
          }
          return params;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  return (
    <Stack spacing={3}>
      <AccountSettingsHeader
        onRefresh={() => void reload()}
        refreshing={refreshing}
        busy={pageBusy}
        showRetry={showRetryOfflineSync}
        onRetry={() => void retryOfflineSync()}
        retrying={offlineSyncing}
      />

      <Box
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          px: { xs: 1, sm: 2 }
        }}
      >
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          textColor="secondary"
          indicatorColor="secondary"
          aria-label="Account settings tabs"
          sx={{ '& .MuiTab-root': { fontWeight: 600, textTransform: 'none' } }}
        >
          <Tab label="Profile Summary" value={ACCOUNT_SETTINGS_TABS.PROFILE} />
          <Tab label="Security Settings" value={ACCOUNT_SETTINGS_TABS.SECURITY} />
        </Tabs>
      </Box>

      {activeTab === ACCOUNT_SETTINGS_TABS.PROFILE ? (
        <Stack spacing={2.5}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          {loading ? (
            <ProfileTabSkeleton />
          ) : profile ? (
            <Stack spacing={2.5}>
              <ProfileSummaryCard profile={profile} onEditPicture={() => setPictureDialogOpen(true)} />
              {showOfflineConflict && offlineQueueItem ? (
                <ProfileOfflineConflictAlert
                  queueItem={offlineQueueItem}
                  resolving={saving}
                  onKeepServer={dismissOfflineConflict}
                  onReapply={reapplyOfflineConflict}
                />
              ) : null}
              {!contactDialogOpen ? (
                <Stack spacing={1}>
                  {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}
                  {offlineQueueMessage ? <Alert severity="info">{offlineQueueMessage}</Alert> : null}
                  {offlineSyncing ? <Alert severity="info">Syncing offline profile update…</Alert> : null}
                  {conflictMessage ? <Alert severity="warning">{conflictMessage}</Alert> : null}
                  {saveError ? <Alert severity="error">{saveError}</Alert> : null}
                </Stack>
              ) : null}

              <ProfileContactCard profile={profile} onEdit={() => setContactDialogOpen(true)} />
              <ProfileNotificationSettingsCard />

              <ProfilePictureDialog
                open={pictureDialogOpen}
                onClose={() => setPictureDialogOpen(false)}
                profile={profile}
                isOnline={isOnline}
                saving={pictureSaving}
                removing={pictureRemoving}
                error={pictureError}
                fieldErrors={pictureFieldErrors}
                successMessage={pictureSuccessMessage}
                onUpload={uploadPicture}
                onRemove={deletePicture}
                onClearMessages={clearPictureMessages}
              />
              <ProfileContactDialog
                open={contactDialogOpen}
                onClose={() => setContactDialogOpen(false)}
                profile={profile}
                saving={saving}
                fieldErrors={fieldErrors}
                successMessage={successMessage}
                conflictMessage={conflictMessage}
                offlinePendingMessage={offlineQueueMessage}
                offlineSyncing={offlineSyncing}
                saveError={saveError}
                onSave={updateContact}
              />
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      {activeTab === ACCOUNT_SETTINGS_TABS.SECURITY ? (
        <Stack spacing={2.5}>
          <Alert severity="info">
            Password, email, and two-factor changes require step-up verification. Successful sensitive changes sign you out and require a
            fresh login.
          </Alert>

          {loading && !profile ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress color="secondary" />
            </Box>
          ) : (
            <>
              <ProfileSecurityOverview profile={profile} />
              <ProfileSecurityActions currentEmail={profile?.email ?? ''} hideSessionLink />
            </>
          )}

          <AccountSecuritySessionPanel />
        </Stack>
      ) : null}
    </Stack>
  );
}
