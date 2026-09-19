import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import broadcastService from 'services/realtime/broadcastService';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, clearAuthSession, getAuthUser } from 'utils/auth';

import authService from '../datasources/authService';
import { AuthRepository } from '../repositories/authRepository';
import { mergeAuthUserWithProfileUpdate } from 'feature/profile/utils/profileAuthSync';
import { subscribeToProfileUpdates } from 'feature/profile/utils/profileSyncEvents';

const authRepository = new AuthRepository(authService);

function readStoredUser() {
  return getAuthUser();
}

/** Auth hook: stored user, logout flow, cross-tab session sync. */
export function useAuthController() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(() => readStoredUser());
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const logoutInProgress = useRef(false);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== AUTH_USER_KEY && event.key !== AUTH_TOKEN_KEY && event.key !== null) {
        return;
      }

      const tokenRemoved = event.key === AUTH_TOKEN_KEY && event.newValue == null && event.oldValue != null;
      const userRemoved = event.key === AUTH_USER_KEY && event.newValue == null && event.oldValue != null;
      const cleared = event.key === null;

      setCurrentUser(readStoredUser());

      if ((tokenRemoved || userRemoved || cleared) && !localStorage.getItem(AUTH_TOKEN_KEY)) {
        broadcastService.disconnect();
        if (window.location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      }
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [navigate]);

  useEffect(() => {
    const unsubscribe = subscribeToProfileUpdates((detail) => {
      const existing = readStoredUser();

      if (!existing) {
        return;
      }

      if (detail?.authUser && typeof detail.authUser === 'object') {
        setCurrentUser(detail.authUser);
        return;
      }

      if (detail?.profile && typeof detail.profile === 'object') {
        const merged = mergeAuthUserWithProfileUpdate(detail.profile);
        setCurrentUser(merged);
      }
    });

    return unsubscribe;
  }, []);

  const handleLogout = useCallback(async () => {
    if (logoutInProgress.current) {
      return;
    }

    logoutInProgress.current = true;
    setLogoutLoading(true);
    setLogoutError('');

    try {
      await authRepository.logout();
    } catch (error) {
      const status = error?.status;
      const isNetworkFailure = !status && error?.message !== 'Unauthorized';
      if (status && status !== 401) {
        setLogoutError('Could not reach the server. You have been signed out locally.');
      } else if (isNetworkFailure) {
        setLogoutError('Could not reach the server. You have been signed out locally.');
      }
    } finally {
      logoutInProgress.current = false;
      try {
        broadcastService.disconnect();
      } catch (err) {
        console.warn('[auth] realtime disconnect failed', err);
      }
      clearAuthSession();
      setCurrentUser(null);
      setLogoutLoading(false);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return {
    currentUser,
    logoutLoading,
    logoutError,
    handleLogout
  };
}
