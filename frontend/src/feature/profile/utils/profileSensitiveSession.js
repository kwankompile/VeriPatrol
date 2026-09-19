import broadcastService from 'services/realtime/broadcastService';
import { clearAuthSession } from 'utils/auth';

/**
 * Clears local auth state after a successful sensitive profile action.
 * Backend has already revoked sessions and cleared the refresh cookie.
 *
 * @param {(path: string, options?: { replace?: boolean }) => void} navigate
 */
export function endProfileSensitiveSession(navigate) {
  try {
    broadcastService.disconnect();
  } catch (error) {
    console.warn('[profile] realtime disconnect failed after sensitive change', error);
  }

  clearAuthSession();
  navigate('/login', { replace: true });
}
