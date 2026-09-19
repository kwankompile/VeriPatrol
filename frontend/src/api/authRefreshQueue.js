import authService from 'feature/authentication/datasources/authService';
import { AuthRepository } from 'feature/authentication/repositories/authRepository';
import { clearAuthSession, markSessionExpired, setAuthToken, setAuthUser } from 'utils/auth';

const authRepository = new AuthRepository(authService);

let activeRefreshPromise = null;

export class SessionExpiredError extends Error {
  constructor(message = 'Session expired') {
    super(message);
    this.name = 'SessionExpiredError';
    this.status = 401;
  }
}

/**
 * Run a single shared refresh for concurrent 401 responses.
 * @returns {Promise<string>} New access token
 */
export function runAuthRefresh() {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const result = await authRepository.refreshSession();
      setAuthToken(result.accessToken);
      if (result.user) {
        setAuthUser(result.user);
      }
      return result.accessToken;
    } catch (error) {
      clearAuthSession();
      markSessionExpired();
      throw new SessionExpiredError(error?.message || 'Session expired');
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/** Test helper — reset module state between Vitest cases. */
export function resetAuthRefreshQueueForTests() {
  activeRefreshPromise = null;
}
