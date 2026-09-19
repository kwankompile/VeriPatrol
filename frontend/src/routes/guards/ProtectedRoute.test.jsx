import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import ProtectedRoute from './ProtectedRoute';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, setAuthToken, setAuthUser } from 'utils/auth';

describe('ProtectedRoute setup-required guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects setup-required auth users to login and clears session', () => {
    setAuthToken('jwt-token');
    setAuthUser({ id: '1', email: 'user@example.com', setup_required: true });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
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

  it('redirects users without completed 2FA to login and clears session', () => {
    setAuthToken('jwt-token');
    setAuthUser({ id: '1', email: 'user@example.com', setup_required: false, two_factor_enabled: false });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
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

  it('redirects auth users with missing two_factor_enabled to login and clears session', () => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      email: 'user@example.com',
      setup_required: false,
      role: 'Admin'
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected content</div>
              </ProtectedRoute>
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
