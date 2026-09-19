import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import RoleProtectedRoute from './RoleProtectedRoute';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, ROLES, setAuthToken, setAuthUser } from 'utils/auth';

function renderRoleRoute(user, initialPath = '/dashboard') {
  setAuthToken('jwt-token');
  setAuthUser(user);

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <RoleProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <div>Protected admin content</div>
            </RoleProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/forbidden" element={<div>Forbidden page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RoleProtectedRoute', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects setup-required auth users to login and clears storage', () => {
    renderRoleRoute({ id: '1', email: 'user@example.com', setup_required: true, two_factor_enabled: true, role: { name: 'Admin' } });

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('redirects users without completed 2FA to login and clears storage', () => {
    renderRoleRoute({
      id: '1',
      email: 'user@example.com',
      setup_required: false,
      two_factor_enabled: false,
      role: { name: 'Admin' }
    });

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('redirects role-protected users with missing two_factor_enabled to login and clears session', () => {
    renderRoleRoute({
      id: '1',
      email: 'admin@example.com',
      setup_required: false,
      role: { name: 'Admin' }
    });

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Protected admin content')).not.toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('renders protected content for valid user with completed 2FA and allowed role', () => {
    renderRoleRoute({
      id: '1',
      email: 'admin@example.com',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: 'Admin' }
    });

    expect(screen.getByText('Protected admin content')).toBeInTheDocument();
  });

  it('redirects valid user with completed 2FA but wrong role to forbidden', () => {
    renderRoleRoute({
      id: '1',
      email: 'guard@example.com',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: 'Guard' }
    });

    expect(screen.getByText('Forbidden page')).toBeInTheDocument();
  });
});
