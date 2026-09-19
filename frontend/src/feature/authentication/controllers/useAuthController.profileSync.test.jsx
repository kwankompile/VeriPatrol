import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AUTH_USER_KEY } from 'utils/auth';

import { publishProfileUpdated } from 'feature/profile/utils/profileSyncEvents';

import { useAuthController } from './useAuthController';

vi.mock('../datasources/authService', () => ({
  default: {
    logout: vi.fn()
  }
}));

vi.mock('services/realtime/broadcastService', () => ({
  default: { disconnect: vi.fn() }
}));

describe('useAuthController profile sync', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({
        id: 'user-1',
        name: 'Old Name',
        setup_required: false,
        two_factor_enabled: true,
        role: { name: 'Guard' }
      })
    );
  });

  it('updates currentUser.profile_picture_url when profile update with resolved URL is published', async () => {
    const { result } = renderHook(() => useAuthController(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>
    });

    publishProfileUpdated({
      authUser: {
        id: 'user-1',
        name: 'Old Name',
        profile_picture_url: 'http://localhost:8000/storage/new.jpg',
        setup_required: false,
        two_factor_enabled: true,
        role: { name: 'Guard' }
      }
    });

    await waitFor(() => {
      expect(result.current.currentUser?.profile_picture_url).toBe('http://localhost:8000/storage/new.jpg');
    });
  });

  it('updates currentUser when a profile update event is published', async () => {
    const { result } = renderHook(() => useAuthController(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>
    });

    expect(result.current.currentUser?.name).toBe('Old Name');

    publishProfileUpdated({
      authUser: {
        id: 'user-1',
        name: 'Updated Name',
        setup_required: false,
        two_factor_enabled: true,
        role: { name: 'Guard' }
      }
    });

    await waitFor(() => {
      expect(result.current.currentUser?.name).toBe('Updated Name');
    });
  });
});
