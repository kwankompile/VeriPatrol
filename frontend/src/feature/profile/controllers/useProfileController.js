import { useCallback, useEffect, useRef, useState } from 'react';

import { useNetworkStatus } from 'pwa/useNetworkStatus';

import profileService from '../datasources/profileService';
import {
  dismissOfflineQueueItem,
  enqueueContactUpdate,
  flushProfileOfflineQueue,
  getActiveOfflineQueueItem,
  PROFILE_QUEUE_STATUS_EXHAUSTED,
  PROFILE_QUEUE_STATUS_SYNCING,
  reapplyOfflineQueueItem,
  resetExhaustedQueueItemForRetry
} from '../offline/profileOfflineQueue';
import { ProfileRepository } from '../repositories/ProfileRepository';
import { syncAuthUserFromProfile } from '../utils/profileAuthSync';
import { extractValidationErrors, PROFILE_VERSION_CONFLICT_MESSAGE } from '../utils/profileErrors';
import { publishProfileUpdated, subscribeToProfileUpdates } from '../utils/profileSyncEvents';
import { validateContactFields, validateProfilePictureFile } from '../utils/profileValidation';

/**
 * @param {ProfileRepository} [repository]
 */
export const useProfileController = (repository) => {
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = repository ?? new ProfileRepository(profileService);
  }

  const isOnline = useNetworkStatus();
  const wasOnlineRef = useRef(isOnline);
  const initialBootstrapRef = useRef(false);
  const ignoreNextSyncRef = useRef(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');
  const [conflictMessage, setConflictMessage] = useState('');
  const [offlineQueueItem, setOfflineQueueItem] = useState(null);
  const [offlineQueueMessage, setOfflineQueueMessage] = useState('');
  const [offlineSyncing, setOfflineSyncing] = useState(false);
  const [pictureSaving, setPictureSaving] = useState(false);
  const [pictureRemoving, setPictureRemoving] = useState(false);
  const [pictureError, setPictureError] = useState(null);
  const [pictureFieldErrors, setPictureFieldErrors] = useState({});
  const [pictureSuccessMessage, setPictureSuccessMessage] = useState('');

  const clearPictureMessages = useCallback(() => {
    setPictureError(null);
    setPictureFieldErrors({});
    setPictureSuccessMessage('');
  }, []);

  const refreshOfflineQueueState = useCallback(async (profileId) => {
    if (!profileId) {
      setOfflineQueueItem(null);
      return null;
    }

    const item = await getActiveOfflineQueueItem({ profileId });
    setOfflineQueueItem(item);
    return item;
  }, []);

  const loadProfile = useCallback(async ({ isRefresh = false } = {}) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const nextProfile = await repositoryRef.current.getProfile();
      setProfile(nextProfile);
      return nextProfile;
    } catch (loadError) {
      setError(loadError?.message || 'Failed to load profile.');
      return null;
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const applyProfileUpdate = useCallback((nextProfile, { publish = true } = {}) => {
    setProfile(nextProfile);
    const mergedUser = syncAuthUserFromProfile(nextProfile);

    if (publish) {
      ignoreNextSyncRef.current = true;
      publishProfileUpdated({ profile: nextProfile, authUser: mergedUser });
      queueMicrotask(() => {
        ignoreNextSyncRef.current = false;
      });
    }
  }, []);

  const applyFlushResult = useCallback(
    (result) => {
      if (result.syncedProfile) {
        applyProfileUpdate(result.syncedProfile);
        setSuccessMessage('Offline profile update synced successfully.');
        setOfflineQueueMessage('');
        setSaveError(null);
        setFieldErrors({});
      }

      if (result.conflictItem) {
        setOfflineQueueItem(result.conflictItem);
        setOfflineQueueMessage('');
        setConflictMessage('');
      }

      if (result.validationError) {
        setFieldErrors(result.validationError.fieldErrors);
        setSaveError(result.validationError.message);
      }

      if (result.retryableFailure) {
        setSaveError(result.retryableFailure);
      }

      if (result.exhausted) {
        setSaveError(result.retryableFailure || 'Offline profile sync failed after multiple attempts.');
      }
    },
    [applyProfileUpdate]
  );

  const runOfflineFlush = useCallback(
    async (profileId) => {
      const targetProfileId = profileId ?? profile?.id;

      if (!isOnline || !targetProfileId) {
        return null;
      }

      setOfflineSyncing(true);

      try {
        const result = await flushProfileOfflineQueue({
          repository: repositoryRef.current,
          profileId: targetProfileId
        });
        applyFlushResult(result);
        await refreshOfflineQueueState(targetProfileId);
        return result;
      } finally {
        setOfflineSyncing(false);
      }
    },
    [applyFlushResult, isOnline, profile?.id, refreshOfflineQueueState]
  );

  useEffect(() => {
    if (initialBootstrapRef.current) {
      return;
    }

    initialBootstrapRef.current = true;

    const bootstrap = async () => {
      const loadedProfile = await loadProfile();

      if (!loadedProfile?.id) {
        return;
      }

      await refreshOfflineQueueState(loadedProfile.id);

      if (isOnline) {
        await runOfflineFlush(loadedProfile.id);
      }
    };

    void bootstrap();
  }, [isOnline, loadProfile, refreshOfflineQueueState, runOfflineFlush]);

  useEffect(() => {
    if (!wasOnlineRef.current && isOnline && profile?.id) {
      void (async () => {
        await refreshOfflineQueueState(profile.id);
        await runOfflineFlush(profile.id);
      })();
    }

    wasOnlineRef.current = isOnline;
  }, [isOnline, profile?.id, refreshOfflineQueueState, runOfflineFlush]);

  useEffect(() => {
    if (profile?.id) {
      void refreshOfflineQueueState(profile.id);
      return;
    }

    setOfflineQueueItem(null);
  }, [profile?.id, refreshOfflineQueueState]);

  useEffect(() => {
    const unsubscribe = subscribeToProfileUpdates(() => {
      if (ignoreNextSyncRef.current) {
        return;
      }

      void loadProfile({ isRefresh: true });
    });

    return unsubscribe;
  }, [loadProfile]);

  const reload = useCallback(() => loadProfile({ isRefresh: true }), [loadProfile]);

  const updateContact = useCallback(
    async ({ phone, address }) => {
      if (!profile) {
        return;
      }

      const clientErrors = validateContactFields({ phone, address });

      if (Object.keys(clientErrors).length > 0) {
        setFieldErrors(clientErrors);
        setSaveError('Please correct the highlighted fields.');
        setSuccessMessage('');
        setConflictMessage('');
        return;
      }

      setSaveError(null);
      setFieldErrors({});
      setSuccessMessage('');
      setConflictMessage('');

      if (!isOnline) {
        try {
          await enqueueContactUpdate({
            profileId: profile.id,
            phone,
            address,
            profileVersion: profile.profileVersion
          });
          await refreshOfflineQueueState(profile.id);
          setOfflineQueueMessage('Profile update saved offline. It will sync when you are online.');
        } catch {
          setSaveError('Failed to save offline profile update.');
        }

        return;
      }

      setSaving(true);

      const payload = {
        phone: phone === '' ? null : phone,
        address: address === '' ? null : address,
        profile_version: profile.profileVersion
      };

      try {
        const updated = await repositoryRef.current.updateProfile(payload);
        applyProfileUpdate(updated);
        setSuccessMessage('Profile updated successfully.');
        setOfflineQueueMessage('');
      } catch (updateError) {
        if (updateError?.code === 'profile_version_conflict' && updateError.profile) {
          applyProfileUpdate(updateError.profile, { publish: false });
          setConflictMessage(PROFILE_VERSION_CONFLICT_MESSAGE);
          return;
        }

        if (updateError?.status === 422) {
          const validationErrors = extractValidationErrors(updateError);
          setFieldErrors(validationErrors);
        }

        setSaveError(updateError?.message || 'Failed to update profile.');
      } finally {
        setSaving(false);
      }
    },
    [applyProfileUpdate, isOnline, profile, refreshOfflineQueueState]
  );

  const dismissOfflineConflict = useCallback(async () => {
    if (!offlineQueueItem) {
      return;
    }

    await dismissOfflineQueueItem(offlineQueueItem.id);
    setOfflineQueueItem(null);
    setOfflineQueueMessage('');
    await loadProfile({ isRefresh: true });
  }, [loadProfile, offlineQueueItem]);

  const reapplyOfflineConflict = useCallback(async () => {
    if (!offlineQueueItem) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    setFieldErrors({});

    try {
      const updated = await reapplyOfflineQueueItem({
        item: offlineQueueItem,
        repository: repositoryRef.current
      });
      applyProfileUpdate(updated);
      setOfflineQueueItem(null);
      setOfflineQueueMessage('');
      setSuccessMessage('Profile updated successfully.');
    } catch (reapplyError) {
      if (reapplyError?.code === 'profile_version_conflict' && reapplyError.profile) {
        applyProfileUpdate(reapplyError.profile, { publish: false });
        setConflictMessage(PROFILE_VERSION_CONFLICT_MESSAGE);
      } else if (reapplyError?.status === 422) {
        setFieldErrors(extractValidationErrors(reapplyError));
      }

      setSaveError(reapplyError?.message || 'Failed to reapply offline profile update.');
      if (profile?.id) {
        await refreshOfflineQueueState(profile.id);
      }
    } finally {
      setSaving(false);
    }
  }, [applyProfileUpdate, offlineQueueItem, profile?.id, refreshOfflineQueueState]);

  const retryOfflineSync = useCallback(async () => {
    if (!profile?.id) {
      return;
    }

    if (offlineQueueItem?.status === PROFILE_QUEUE_STATUS_EXHAUSTED) {
      await resetExhaustedQueueItemForRetry({
        profileId: profile.id,
        itemId: offlineQueueItem.id
      });
      await refreshOfflineQueueState(profile.id);
    }

    await runOfflineFlush(profile.id);
  }, [offlineQueueItem, profile?.id, refreshOfflineQueueState, runOfflineFlush]);

  const uploadPicture = useCallback(
    async (file) => {
      if (!isOnline) {
        setPictureError('Profile picture changes require an active network connection.');
        return false;
      }

      const validationMessage = validateProfilePictureFile(file);

      if (validationMessage) {
        setPictureFieldErrors({ image: [validationMessage] });
        setPictureError(validationMessage);
        setPictureSuccessMessage('');
        return false;
      }

      setPictureSaving(true);
      clearPictureMessages();

      const formData = new FormData();
      formData.append('image', file);

      try {
        const updated = await repositoryRef.current.uploadProfilePicture(formData);
        applyProfileUpdate(updated);
        setPictureSuccessMessage('Profile picture uploaded successfully.');
        return true;
      } catch (uploadError) {
        if (uploadError?.status === 422) {
          setPictureFieldErrors(extractValidationErrors(uploadError));
        }

        setPictureError(uploadError?.message || 'Failed to upload profile picture.');
        return false;
      } finally {
        setPictureSaving(false);
      }
    },
    [applyProfileUpdate, clearPictureMessages, isOnline]
  );

  const deletePicture = useCallback(async () => {
    if (!isOnline) {
      setPictureError('Profile picture changes require an active network connection.');
      return;
    }

    setPictureRemoving(true);
    clearPictureMessages();

    try {
      const updated = await repositoryRef.current.deleteProfilePicture();
      applyProfileUpdate(updated);
      setPictureSuccessMessage('Profile picture removed successfully.');
    } catch (removeError) {
      if (removeError?.status === 422) {
        setPictureFieldErrors(extractValidationErrors(removeError));
      }

      setPictureError(removeError?.message || 'Failed to remove profile picture.');
    } finally {
      setPictureRemoving(false);
    }
  }, [applyProfileUpdate, clearPictureMessages, isOnline]);

  const contactSaving = saving || offlineSyncing || offlineQueueItem?.status === PROFILE_QUEUE_STATUS_SYNCING;

  return {
    profile,
    loading,
    refreshing,
    saving: contactSaving,
    error,
    saveError,
    fieldErrors,
    successMessage,
    conflictMessage,
    offlineQueueItem,
    offlineQueueMessage,
    offlineSyncing,
    isOnline,
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
    clearPictureMessages
  };
};
