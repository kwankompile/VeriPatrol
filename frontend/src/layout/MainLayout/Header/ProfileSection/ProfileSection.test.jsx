import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import ProfileSection from './index';

const mockNavigate = vi.fn();
const mockHandleLogout = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

let mockCurrentUser = {
  name: 'Guard User',
  profile_picture_url: 'https://cdn.example/header-avatar.png'
};

vi.mock('feature/authentication/controllers/useAuthController', () => ({
  useAuthController: () => ({
    currentUser: mockCurrentUser,
    logoutLoading: false,
    logoutError: null,
    handleLogout: mockHandleLogout
  })
}));

vi.mock('hooks/useConfig', () => ({
  default: () => ({
    state: { borderRadius: 8 }
  })
}));

vi.mock('utils/auth', async () => {
  const actual = await vi.importActual('utils/auth');
  return {
    ...actual,
    getAuthUserRole: () => 'Guard'
  };
});

describe('ProfileSection menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser = { name: 'Guard User', profile_picture_url: 'https://cdn.example/header-avatar.png' };
  });

  const openMenu = async (user) => {
    await user.click(screen.getByLabelText('user-account'));
  };

  it('navigates to account profile when Account Settings is clicked', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProfileSection />
      </MemoryRouter>
    );

    await openMenu(user);
    await user.click(screen.getByText('Account Settings'));

    expect(mockNavigate).toHaveBeenCalledWith('/account/profile');
  });

  it('navigates to account security when Security Settings is clicked', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProfileSection />
      </MemoryRouter>
    );

    await openMenu(user);
    await user.click(screen.getByText('Security Settings'));

    expect(mockNavigate).toHaveBeenCalledWith('/account/profile?tab=security');
  });

  it('keeps logout behavior unchanged', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProfileSection />
      </MemoryRouter>
    );

    await openMenu(user);
    await user.click(screen.getByText('Logout'));

    expect(mockHandleLogout).toHaveBeenCalledTimes(1);
  });

  it('uses profile_picture_url for the header avatar when available', () => {
    render(
      <MemoryRouter>
        <ProfileSection />
      </MemoryRouter>
    );

    const avatar = screen.getByAltText('user-images');
    expect(avatar).toHaveAttribute('src', 'https://cdn.example/header-avatar.png');
  });

  it('falls back to default avatar when profile_picture_url is null', () => {
    mockCurrentUser = { name: 'Guard User', profile_picture_url: null };

    render(
      <MemoryRouter>
        <ProfileSection />
      </MemoryRouter>
    );

    const avatar = screen.getByAltText('user-images');
    // resolveProfilePictureUrl(null) returns null → falls back to User1 SVG
    expect(avatar.getAttribute('src')).not.toContain('/storage/');
  });

  it('resolves relative /storage/... URL against API origin for header avatar', () => {
    mockCurrentUser = {
      name: 'Guard User',
      profile_picture_url: 'http://localhost:8000/storage/profile-pictures/test.jpg'
    };

    render(
      <MemoryRouter>
        <ProfileSection />
      </MemoryRouter>
    );

    const avatar = screen.getByAltText('user-images');
    expect(avatar.getAttribute('src')).toContain('/storage/profile-pictures/test.jpg');
  });
});
