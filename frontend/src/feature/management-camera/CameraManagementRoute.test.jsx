import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';

import RoleProtectedRoute from 'routes/guards/RoleProtectedRoute';
import { ROLES, setAuthToken, setAuthUser } from 'utils/auth';

function renderCameraManagementRoute(user) {
  setAuthToken('jwt-token');
  setAuthUser(user);

  render(
    <MemoryRouter initialEntries={['/admin/management-camera']}>
      <Routes>
        <Route
          path="/admin/management-camera"
          element={
            <RoleProtectedRoute allowedRoles={[ROLES.ADMIN]}>
              <div>Camera management page</div>
            </RoleProtectedRoute>
          }
        />
        <Route path="/forbidden" element={<div>Forbidden page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Camera management route guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('allows Admin access to /admin/management-camera', () => {
    renderCameraManagementRoute({
      id: '1',
      email: 'admin@example.com',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: 'Admin' }
    });

    expect(screen.getByText('Camera management page')).toBeInTheDocument();
  });

  it('redirects Security Operator to forbidden for /admin/management-camera', () => {
    renderCameraManagementRoute({
      id: '2',
      email: 'operator@example.com',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: 'Security Operator' }
    });

    expect(screen.getByText('Forbidden page')).toBeInTheDocument();
    expect(screen.queryByText('Camera management page')).not.toBeInTheDocument();
  });

  it('redirects Guard to forbidden for /admin/management-camera', () => {
    renderCameraManagementRoute({
      id: '3',
      email: 'guard@example.com',
      setup_required: false,
      two_factor_enabled: true,
      role: { name: 'Guard' }
    });

    expect(screen.getByText('Forbidden page')).toBeInTheDocument();
    expect(screen.queryByText('Camera management page')).not.toBeInTheDocument();
  });
});
