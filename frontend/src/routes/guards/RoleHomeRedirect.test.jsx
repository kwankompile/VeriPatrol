import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import RoleHomeRedirect from './RoleHomeRedirect';
import { ROLES, setAuthToken, setAuthUser } from 'utils/auth';

describe('RoleHomeRedirect', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('redirects valid admin users to dashboard', () => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: ROLES.ADMIN }
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RoleHomeRedirect />} />
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });

  it('redirects valid security operator users to dashboard', () => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: ROLES.SECURITY_OPERATOR }
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RoleHomeRedirect />} />
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });

  it('redirects valid guard users to dashboard', () => {
    setAuthToken('jwt-token');
    setAuthUser({
      id: '1',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: ROLES.GUARD }
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RoleHomeRedirect />} />
          <Route path="/dashboard" element={<div>Dashboard page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Dashboard page')).toBeInTheDocument();
  });
});
