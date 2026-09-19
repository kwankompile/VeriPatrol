import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import broadcastService from 'services/realtime/broadcastService';
import { clearAuthSession } from 'utils/auth';

import authMonitoringService from '../../auth-monitoring/datasources/authMonitoringService';
import { AuthMonitoringRepository } from '../../auth-monitoring/repositories/AuthMonitoringRepository';
import { useAuthSessionController } from '../../auth-monitoring/controllers/useAuthSessionController';

export const useAccountSecurityController = () => {
  const navigate = useNavigate();
  const repositoryRef = useRef(null);
  if (!repositoryRef.current) {
    repositoryRef.current = new AuthMonitoringRepository(authMonitoringService);
  }

  const sessionController = useAuthSessionController(repositoryRef.current, { scope: 'mine' });
  const [confirmAction, setConfirmAction] = useState(null);
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState('');

  const endLocalSession = useCallback(() => {
    try {
      broadcastService.disconnect();
    } catch (err) {
      console.warn('[account-security] realtime disconnect failed', err);
    }
    clearAuthSession();
    navigate('/login', { replace: true });
  }, [navigate]);

  const requestRevokeSession = useCallback(
    (sessionId) => {
      const session = sessionController.sessions.find((row) => row.id === sessionId);
      setConfirmAction({
        type: 'revoke',
        sessionId,
        isCurrent: Boolean(session?.is_current)
      });
    },
    [sessionController.sessions]
  );

  const requestLogoutAll = useCallback(() => {
    setConfirmAction({ type: 'logout-all' });
  }, []);

  const cancelConfirm = useCallback(() => {
    setConfirmAction(null);
  }, []);

  const confirmDestructiveAction = useCallback(async () => {
    if (!confirmAction) {
      return;
    }

    if (confirmAction.type === 'revoke') {
      const { sessionId, isCurrent } = confirmAction;
      setConfirmAction(null);

      if (isCurrent) {
        try {
          await repositoryRef.current.revokeSession(sessionId);
        } catch {
          // Still clear local session — server revocation is best-effort once user confirms.
        }
        endLocalSession();
        return;
      }

      await sessionController.revokeSession(sessionId);
      return;
    }

    if (confirmAction.type === 'logout-all') {
      setLogoutAllLoading(true);
      setLogoutAllError('');
      try {
        await repositoryRef.current.logoutAllSessions();
        endLocalSession();
      } catch (err) {
        setLogoutAllError(err.message || 'Failed to revoke all sessions');
      } finally {
        setLogoutAllLoading(false);
        setConfirmAction(null);
      }
    }
  }, [confirmAction, endLocalSession, sessionController]);

  return {
    ...sessionController,
    error: logoutAllError || sessionController.error,
    confirmAction,
    logoutAllLoading,
    requestRevokeSession,
    requestLogoutAll,
    cancelConfirm,
    confirmDestructiveAction
  };
};
