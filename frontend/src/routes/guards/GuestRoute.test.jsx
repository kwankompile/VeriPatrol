import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import GuestRoute from './GuestRoute';
import { AUTH_TOKEN_KEY, AUTH_USER_KEY, clearAuthSession, setAuthToken, setAuthUser } from 'utils/auth';

function renderGuestRoute(initialPath = '/login') {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/login"
          element={
            <GuestRoute>
              <div>Login page</div>
            </GuestRoute>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
        <Route path="/patrol" element={<div>Patrol page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('GuestRoute', () => {
  beforeEach(() => {
    clearAuthSession();
  });

  it('renders guest content for unauthenticated users', () => {
    renderGuestRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it('redirects valid authenticated users to role default route', () => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      email: 'admin@example.com',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: 'Admin' }
    });

    renderGuestRoute();

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('clears setup-required session and renders guest content', () => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      email: 'user@example.com',
      setup_required: true,
      two_factor_enabled: false,
      role: { name: 'Guard' }
    });

    renderGuestRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('clears stale pre-M5 session missing two_factor_enabled and renders guest content', () => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      email: 'user@example.com',
      setup_required: false,
      role: { name: 'Admin' }
    });

    renderGuestRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('clears invalid session with null two_factor_enabled and renders guest content', () => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      email: 'user@example.com',
      setup_required: false,
      two_factor_enabled: null
    });

    renderGuestRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('clears token-only stale session and renders guest content', () => {
    setAuthToken('jwt-token');

    renderGuestRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });

  it('clears token with invalid auth_user JSON and renders guest content', () => {
    setAuthToken('jwt-token');
    localStorage.setItem(AUTH_USER_KEY, '{invalid-json');

    renderGuestRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
  });
});
