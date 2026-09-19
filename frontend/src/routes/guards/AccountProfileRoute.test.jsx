import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import RoleProtectedRoute from './RoleProtectedRoute';
import { ALL_ROLES, AUTH_TOKEN_KEY, AUTH_USER_KEY, ROLES, setAuthToken, setAuthUser } from 'utils/auth';

function renderAccountProfileRoute(user, initialPath = '/account/profile') {
  setAuthToken('jwt-token');
  setAuthUser(user);

  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/account/profile"
          element={
            <RoleProtectedRoute allowedRoles={ALL_ROLES}>
              <div>Account profile content</div>
            </RoleProtectedRoute>
          }
        />
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/forbidden" element={<div>Forbidden page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Account profile route guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ['Admin', ROLES.ADMIN],
    ['Security Operator', ROLES.SECURITY_OPERATOR],
    ['Guard', ROLES.GUARD]
  ])('allows initialized %s users', (_label, roleName) => {
    renderAccountProfileRoute({
      id: '1',
      email: 'user@example.com',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: roleName }
    });

    expect(screen.getByText('Account profile content')).toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', () => {
    render(
      <MemoryRouter initialEntries={['/account/profile']}>
        <Routes>
          <Route
            path="/account/profile"
            element={
              <RoleProtectedRoute allowedRoles={ALL_ROLES}>
                <div>Account profile content</div>
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
