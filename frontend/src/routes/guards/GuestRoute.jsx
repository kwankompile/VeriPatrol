import PropTypes from 'prop-types';
import { Navigate, Outlet } from 'react-router-dom';

import { AUTH_SESSION_REASONS, clearAuthSession, getAuthSessionState, getDefaultRouteForRole } from 'utils/auth';

export default function GuestRoute({ children }) {
  const session = getAuthSessionState();

  if (session.reason === AUTH_SESSION_REASONS.VALID) {
    return <Navigate to={getDefaultRouteForRole(session.role)} replace />;
  }

  if (session.reason !== AUTH_SESSION_REASONS.MISSING_TOKEN) {
    clearAuthSession();
  }

  return children || <Outlet />;
}

GuestRoute.propTypes = {
  children: PropTypes.node
};
