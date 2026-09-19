import { Navigate } from 'react-router-dom';

import { AUTH_SESSION_REASONS, clearAuthSession, getAuthSessionState, getDefaultRouteForRole } from 'utils/auth';

export default function RoleHomeRedirect() {
  const session = getAuthSessionState();

  if (session.reason === AUTH_SESSION_REASONS.MISSING_TOKEN) {
    return <Navigate to="/login" replace />;
  }

  if (session.reason !== AUTH_SESSION_REASONS.VALID) {
    clearAuthSession();
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getDefaultRouteForRole(session.role)} replace />;
}
