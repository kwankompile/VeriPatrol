import PropTypes from 'prop-types';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { AUTH_SESSION_REASONS, clearAuthSession, getAuthSessionState } from 'utils/auth';

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

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const session = getAuthSessionState();

  if (session.reason === AUTH_SESSION_REASONS.MISSING_TOKEN) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (session.reason !== AUTH_SESSION_REASONS.VALID) {
    clearAuthSession();
    return <Navigate to="/login" replace state={loginRedirectState(location, session.reason)} />;
  }

  return children || <Outlet />;
}

ProtectedRoute.propTypes = {
  children: PropTypes.node
};
