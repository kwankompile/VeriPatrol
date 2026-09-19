import PropTypes from 'prop-types';
import { Navigate, useLocation } from 'react-router-dom';

import { AUTH_SESSION_REASONS, clearAuthSession, getAuthSessionState, hasAnyRole } from 'utils/auth';

function loginRedirectState(location, reason) {
  const state = { from: location };

  if (reason === AUTH_SESSION_REASONS.SETUP_REQUIRED) {
    state.setupRequired = true;
  }

  if (reason === AUTH_SESSION_REASONS.TWO_FACTOR_REQUIRED) {
    state.twoFactorRequired = true;
  }

  return state;
}

export default function RoleProtectedRoute({ allowedRoles, children }) {
  const location = useLocation();
  const session = getAuthSessionState();

  if (session.reason === AUTH_SESSION_REASONS.MISSING_TOKEN) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (session.reason !== AUTH_SESSION_REASONS.VALID) {
    clearAuthSession();
    return <Navigate to="/login" replace state={loginRedirectState(location, session.reason)} />;
  }

  if (!hasAnyRole(allowedRoles)) {
    return <Navigate to="/forbidden" replace state={{ from: location }} />;
  }

  return children;
}

RoleProtectedRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string).isRequired,
  children: PropTypes.node.isRequired
};
