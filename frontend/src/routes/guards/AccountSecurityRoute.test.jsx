import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import AccountSecurityPage from '../../feature/account-security/views/AccountSecurityPage';
import RoleProtectedRoute from './RoleProtectedRoute';
import { ALL_ROLES, AUTH_TOKEN_KEY, AUTH_USER_KEY, ROLES, setAuthToken, setAuthUser } from 'utils/auth';

function ProfileRedirectProbe() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') ?? 'profile';

  return <div>Account profile tab={tab}</div>;
}

describe('Account security compatibility route', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ['Admin', ROLES.ADMIN],
    ['Security Operator', ROLES.SECURITY_OPERATOR],
    ['Guard', ROLES.GUARD]
  ])('allows initialized %s users through redirect to security tab', (_label, roleName) => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      email: 'user@example.com',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: roleName }
    });

    render(
      <MemoryRouter initialEntries={['/account/security']}>
        <Routes>
          <Route
            path="/account/security"
            element={
              <RoleProtectedRoute allowedRoles={ALL_ROLES}>
                <AccountSecurityPage />
              </RoleProtectedRoute>
            }
          />
          <Route path="/account/profile" element={<ProfileRedirectProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Account profile tab=security')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', () => {
    render(
      <MemoryRouter initialEntries={['/account/security']}>
        <Routes>
          <Route
            path="/account/security"
            element={
              <RoleProtectedRoute allowedRoles={ALL_ROLES}>
                <AccountSecurityPage />
              </RoleProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });
});
