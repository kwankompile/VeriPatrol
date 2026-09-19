import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import { AUTH_TOKEN_KEY, AUTH_USER_KEY } from 'utils/auth';

import ProfilePage from './ProfilePage';

function renderProfilePage(initialEntry = '/account/profile') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProfilePage />
    </MemoryRouter>
  );
}

const mockNavigate = vi.fn();
const mockGetProfile = vi.fn();
const mockUpdateProfile = vi.fn();
const mockUploadProfilePicture = vi.fn();
const mockDeleteProfilePicture = vi.fn();
const mockChangePassword = vi.fn();
const mockStartEmailChange = vi.fn();
const mockConfirmEmailChange = vi.fn();
const mockStartTwoFactorReconfigure = vi.fn();
const mockVerifyTwoFactorReconfigure = vi.fn();
const mockBroadcastDisconnect = vi.fn();
let mockIsOnline = true;

const mockSubscribeToPush = vi.fn();
const mockUnsubscribeFromPush = vi.fn();
const mockSendTestNotification = vi.fn();
const mockGetExistingPushSubscription = vi.fn();
const mockGetNotificationPermission = vi.fn();
const mockIsPushNotificationSupported = vi.fn();
const mockResolvePushNotificationStatus = vi.fn();

vi.mock('pwa/pushNotificationService', () => ({
  isPushNotificationSupported: () => mockIsPushNotificationSupported(),
  getNotificationPermission: () => mockGetNotificationPermission(),
  getExistingPushSubscription: (...args) => mockGetExistingPushSubscription(...args),
  resolvePushNotificationStatus: (...args) => mockResolvePushNotificationStatus(...args),
  subscribeToPushNotifications: (...args) => mockSubscribeToPush(...args),
  unsubscribeFromPushNotifications: (...args) => mockUnsubscribeFromPush(...args),
  sendTestNotification: (...args) => mockSendTestNotification(...args)
}));

vi.mock('services/realtime/broadcastService', () => ({
  default: {
    disconnect: (...args) => mockBroadcastDisconnect(...args)
  }
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

vi.mock('pwa/useNetworkStatus', () => ({
  useNetworkStatus: () => mockIsOnline
}));

const mockEnqueueContactUpdate = vi.fn();
const mockFlushProfileOfflineQueue = vi.fn();
const mockGetActiveOfflineQueueItem = vi.fn();
const mockDismissOfflineQueueItem = vi.fn();
const mockReapplyOfflineQueueItem = vi.fn();
const mockResetExhaustedQueueItemForRetry = vi.fn();

vi.mock('../offline/profileOfflineQueue', async () => {
  const actual = await vi.importActual('../offline/profileOfflineQueue');
  return {
    ...actual,
    enqueueContactUpdate: (...args) => mockEnqueueContactUpdate(...args),
    flushProfileOfflineQueue: (...args) => mockFlushProfileOfflineQueue(...args),
    getActiveOfflineQueueItem: (...args) => mockGetActiveOfflineQueueItem(...args),
    dismissOfflineQueueItem: (...args) => mockDismissOfflineQueueItem(...args),
    reapplyOfflineQueueItem: (...args) => mockReapplyOfflineQueueItem(...args),
    resetExhaustedQueueItemForRetry: (...args) => mockResetExhaustedQueueItemForRetry(...args)
  };
});

const mockGetSessions = vi.fn();
const mockRevokeSession = vi.fn();
const mockLogoutAllSessions = vi.fn();

vi.mock('../../auth-monitoring/datasources/authMonitoringService', () => ({
  default: {
    getSessions: (...args) => mockGetSessions(...args),
    revokeSession: (...args) => mockRevokeSession(...args),
    logoutAllSessions: (...args) => mockLogoutAllSessions(...args)
  },
  unwrapPaginatedEnvelope: (envelope) => ({
    rows: envelope?.data ?? [],
    meta: { total: envelope?.data?.length ?? 0, current_page: 1, last_page: 1, per_page: 25 }
  })
}));

vi.mock('../datasources/profileService', () => ({
  default: {
    getProfile: (...args) => mockGetProfile(...args),
    updateProfile: (...args) => mockUpdateProfile(...args),
    uploadProfilePicture: (...args) => mockUploadProfilePicture(...args),
    deleteProfilePicture: (...args) => mockDeleteProfilePicture(...args),
    changePassword: (...args) => mockChangePassword(...args),
    startEmailChange: (...args) => mockStartEmailChange(...args),
    confirmEmailChange: (...args) => mockConfirmEmailChange(...args),
    startTwoFactorReconfigure: (...args) => mockStartTwoFactorReconfigure(...args),
    verifyTwoFactorReconfigure: (...args) => mockVerifyTwoFactorReconfigure(...args)
  }
}));

const sampleUser = {
  id: 'user-1',
  name: 'Guard User',
  email: 'guard@example.com',
  phone: '0111111111',
  address: 'Old address',
  profile_version: 3,
  two_factor_enabled: true,
  email_verified_at: '2026-06-29T10:00:00Z',
  role: { name: 'Guard' },
  updated_at: '2026-06-29T10:00:00Z'
};

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    localStorage.clear();
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:preview-url'),
      revokeObjectURL: vi.fn()
    });
    localStorage.setItem(
      AUTH_USER_KEY,
      JSON.stringify({
        id: 'user-1',
        name: 'Guard User',
        setup_required: false,
        two_factor_enabled: true,
        role: { name: 'Guard' }
      })
    );
    localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');

    mockGetProfile.mockResolvedValue({
      success: true,
      message: 'Profile retrieved successfully.',
      data: { user: sampleUser }
    });

    mockFlushProfileOfflineQueue.mockResolvedValue({
      syncedProfile: null,
      conflictItem: null,
      validationError: null,
      exhausted: false,
      authRequired: false,
      retryableFailure: null
    });
    mockGetActiveOfflineQueueItem.mockResolvedValue(null);
    mockEnqueueContactUpdate.mockResolvedValue('offline-queue-1');
    mockResetExhaustedQueueItemForRetry.mockResolvedValue(true);

    mockIsPushNotificationSupported.mockReturnValue(true);
    mockGetNotificationPermission.mockReturnValue('default');
    mockGetExistingPushSubscription.mockResolvedValue(null);
    mockResolvePushNotificationStatus.mockResolvedValue({ status: 'permission_default', subscribed: false });
    mockSubscribeToPush.mockResolvedValue({ subscription: {}, server: { success: true } });
    mockUnsubscribeFromPush.mockResolvedValue(undefined);
    mockSendTestNotification.mockResolvedValue({ success: true });

    mockGetSessions.mockResolvedValue({ data: [] });
    mockRevokeSession.mockResolvedValue({ success: true });
    mockLogoutAllSessions.mockResolvedValue({ success: true });
  });

  it('renders loading state', () => {
    mockGetProfile.mockReturnValue(new Promise(() => {}));

    renderProfilePage();

    expect(screen.getByTestId('profile-tab-skeleton')).toBeInTheDocument();
  });

  it('defaults to Profile Summary tab', async () => {
    renderProfilePage();

    expect(await screen.findByRole('tab', { name: 'Profile Summary', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Security Settings', selected: false })).toBeInTheDocument();
    expect(await screen.findByText('Guard User')).toBeInTheDocument();
  });

  it('opens Security Settings tab from query param', async () => {
    renderProfilePage('/account/profile?tab=security');

    expect(await screen.findByRole('tab', { name: 'Security Settings', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Security Actions')).toBeInTheDocument();
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
  });

  it('falls back invalid tab query to Profile Summary', async () => {
    renderProfilePage('/account/profile?tab=invalid');

    expect(await screen.findByRole('tab', { name: 'Profile Summary', selected: true })).toBeInTheDocument();
    expect(await screen.findByText('Guard User')).toBeInTheDocument();
  });

  it('updates query param when Security Settings tab is clicked', async () => {
    const user = userEvent.setup();

    renderProfilePage();

    await screen.findByText('Guard User');
    await user.click(screen.getByRole('tab', { name: 'Security Settings' }));

    expect(screen.getByRole('tab', { name: 'Security Settings', selected: true })).toBeInTheDocument();
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
  });

  it('renders notification settings on Profile Summary tab', async () => {
    renderProfilePage();

    expect(await screen.findByText('Notification Settings')).toBeInTheDocument();
    expect(screen.getByTestId('push-notification-toggle')).toBeInTheDocument();
  });

  it('renders profile summary details', async () => {
    renderProfilePage();

    expect(await screen.findByText('Profile Summary')).toBeInTheDocument();
    expect(screen.getByText('Guard User')).toBeInTheDocument();
    // Email is shown both in the summary identity block and the contact card.
    expect(screen.getAllByText('guard@example.com').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/2FA: Enabled/)).toBeInTheDocument();
    expect(screen.getByText(/Email: Verified/)).toBeInTheDocument();
    expect(screen.getByText(/Version 3/)).toBeInTheDocument();
  });

  it('shows Contact Information with email, phone, and address', async () => {
    renderProfilePage();

    expect(await screen.findByText('Contact Information')).toBeInTheDocument();
    expect(screen.getByTestId('profile-contact-card')).toBeInTheDocument();
    expect(screen.getByText('0111111111')).toBeInTheDocument();
    expect(screen.getByText('Old address')).toBeInTheDocument();
    expect(screen.getByTestId('profile-contact-edit')).toBeInTheDocument();
  });

  it('does not show the Joined date in the profile summary', async () => {
    renderProfilePage();

    await screen.findByText('Profile Summary');
    expect(screen.queryByText('Joined')).not.toBeInTheDocument();
  });

  it('initializes the contact edit modal from profile', async () => {
    const user = userEvent.setup();

    renderProfilePage();

    await screen.findByText('Guard User');
    await user.click(screen.getByTestId('profile-contact-edit'));

    expect(await screen.findByLabelText('Phone')).toHaveValue('0111111111');
    expect(screen.getByLabelText('Address')).toHaveValue('Old address');
  });

  it('saves phone and address with profile_version from the modal', async () => {
    const user = userEvent.setup();

    mockUpdateProfile.mockResolvedValue({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        user: {
          ...sampleUser,
          phone: '0123456789',
          address: 'Kuala Lumpur',
          profile_version: 4
        }
      }
    });

    renderProfilePage();

    await screen.findByText('Guard User');
    await user.click(screen.getByTestId('profile-contact-edit'));
    await screen.findByLabelText('Phone');
    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), '0123456789');
    await user.clear(screen.getByLabelText('Address'));
    await user.type(screen.getByLabelText('Address'), 'Kuala Lumpur');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        phone: '0123456789',
        address: 'Kuala Lumpur',
        profile_version: 3
      });
    });

    expect(await screen.findByText('Profile updated successfully.')).toBeInTheDocument();
  });

  it('updates auth_user after successful save', async () => {
    const user = userEvent.setup();

    mockUpdateProfile.mockResolvedValue({
      success: true,
      message: 'Profile updated successfully.',
      data: {
        user: {
          ...sampleUser,
          phone: '0123456789',
          profile_version: 4
        }
      }
    });

    renderProfilePage();

    await screen.findByText('Guard User');
    await user.click(screen.getByTestId('profile-contact-edit'));
    await screen.findByLabelText('Phone');
    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), '0123456789');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? '{}');
      expect(stored.phone).toBe('0123456789');
      expect(stored.profile_version).toBe(4);
      expect(stored.setup_required).toBe(false);
    });
  });

  it('renders backend validation errors in the modal', async () => {
    const user = userEvent.setup();

    mockUpdateProfile.mockRejectedValue({
      message: 'Validation failed.',
      status: 422,
      data: {
        message: 'Validation failed.',
        data: {
          errors: {
            phone: ['The phone field is invalid.']
          }
        }
      }
    });

    renderProfilePage();

    await screen.findByText('Guard User');
    await user.click(screen.getByTestId('profile-contact-edit'));
    await screen.findByLabelText('Phone');
    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), 'bad');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('The phone field is invalid.')).toBeInTheDocument();
  });

  it('handles profile_version_conflict by refreshing modal state', async () => {
    const user = userEvent.setup();

    mockUpdateProfile.mockRejectedValue({
      message: 'Profile has been modified. Please refresh and try again.',
      status: 409,
      data: {
        success: false,
        message: 'Profile has been modified. Please refresh and try again.',
        data: {
          code: 'profile_version_conflict',
          current_profile_version: 6,
          user: {
            ...sampleUser,
            phone: 'Server phone',
            address: 'Server address',
            profile_version: 6
          }
        }
      }
    });

    renderProfilePage();

    await screen.findByText('Guard User');
    await user.click(screen.getByTestId('profile-contact-edit'));
    await screen.findByLabelText('Phone');
    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), '0123456789');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('This profile was updated elsewhere. The latest profile has been loaded. Review and save again.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Phone')).toHaveValue('Server phone');
    expect(screen.getByLabelText('Address')).toHaveValue('Server address');
    expect(screen.getByText(/Version 6/)).toBeInTheDocument();
  });

  it('renders error state', async () => {
    mockGetProfile.mockRejectedValue({
      message: 'Failed to load profile.',
      status: 500,
      data: null
    });

    renderProfilePage();

    expect(await screen.findByText('Failed to load profile.')).toBeInTheDocument();
  });

  it('refresh button reloads profile', async () => {
    const user = userEvent.setup();

    renderProfilePage();

    await screen.findByText('Guard User');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      expect(mockGetProfile).toHaveBeenCalledTimes(2);
    });
  });

  it('links to account security settings', async () => {
    renderProfilePage('/account/profile?tab=security');

    expect(await screen.findByText('Active Sessions')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Manage Sessions' })).not.toBeInTheDocument();
  });

  async function openPictureModal(user) {
    await screen.findByText('Guard User');
    await user.click(screen.getByTestId('profile-avatar-edit'));
    await screen.findByText('Update profile picture');
  }

  it('opens the profile picture modal from the avatar pencil', async () => {
    const user = userEvent.setup();

    renderProfilePage();

    await openPictureModal(user);
    expect(screen.getByLabelText('Select profile picture')).toBeInTheDocument();
    expect(screen.getByTestId('profile-picture-dropzone')).toBeInTheDocument();
    expect(screen.getByText(/Maximum size:/)).toBeInTheDocument();
  });

  it('previews a valid selected image before upload', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });

    renderProfilePage();

    await openPictureModal(user);
    await user.upload(screen.getByLabelText('Select profile picture'), file);

    expect(screen.getByText(/Selected: avatar\.png/)).toBeInTheDocument();
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);
  });

  it('blocks invalid file type before upload', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'avatar.gif', { type: 'image/gif' });

    renderProfilePage();

    await openPictureModal(user);
    fireEvent.change(screen.getByLabelText('Select profile picture'), { target: { files: [file] } });

    expect(screen.getByText('Only JPG, PNG, or WebP images are allowed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload picture' })).toBeDisabled();
  });

  it('blocks oversized file before upload', async () => {
    const user = userEvent.setup();
    const file = new File([new ArrayBuffer(2048 * 1024 + 1)], 'big.png', { type: 'image/png' });

    renderProfilePage();

    await openPictureModal(user);
    await user.upload(screen.getByLabelText('Select profile picture'), file);

    expect(screen.getByText(/2\.0 MB or smaller/)).toBeInTheDocument();
  });

  it('cancel selection clears selected preview', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });

    renderProfilePage();

    await openPictureModal(user);
    await user.upload(screen.getByLabelText('Select profile picture'), file);
    await user.click(screen.getByRole('button', { name: 'Cancel selection' }));

    expect(screen.queryByText(/Selected: avatar\.png/)).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url');
  });

  it('upload sends FormData with image', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });

    mockUploadProfilePicture.mockResolvedValue({
      success: true,
      message: 'Profile picture uploaded successfully.',
      data: {
        user: {
          ...sampleUser,
          profile_picture_url: 'https://cdn.example/new-avatar.png',
          profile_version: 4
        }
      }
    });

    renderProfilePage();

    await openPictureModal(user);
    await user.upload(screen.getByLabelText('Select profile picture'), file);
    await user.click(screen.getByRole('button', { name: 'Upload picture' }));

    await waitFor(() => {
      expect(mockUploadProfilePicture).toHaveBeenCalledTimes(1);
    });

    const formData = mockUploadProfilePicture.mock.calls[0][0];
    expect(formData.get('image')).toBe(file);
  });

  it('successful upload updates displayed avatar, profile state, and auth_user', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });

    mockUploadProfilePicture.mockResolvedValue({
      success: true,
      message: 'Profile picture uploaded successfully.',
      data: {
        user: {
          ...sampleUser,
          profile_picture_url: 'https://cdn.example/new-avatar.png',
          profile_version: 4
        }
      }
    });

    renderProfilePage();

    await openPictureModal(user);
    await user.upload(screen.getByLabelText('Select profile picture'), file);
    await user.click(screen.getByRole('button', { name: 'Upload picture' }));

    expect(await screen.findByText('Profile picture uploaded successfully.')).toBeInTheDocument();

    const avatars = await screen.findAllByRole('img', { name: 'Guard User' });
    expect(avatars.some((avatar) => avatar.getAttribute('src') === 'https://cdn.example/new-avatar.png')).toBe(true);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem(AUTH_USER_KEY) ?? '{}');
      expect(stored.profile_picture_url).toBe('https://cdn.example/new-avatar.png');
      expect(stored.profile_version).toBe(4);
    });
  });

  it('remove calls the delete API and resets the avatar', async () => {
    const user = userEvent.setup();

    mockGetProfile.mockResolvedValue({
      success: true,
      message: 'Profile retrieved successfully.',
      data: {
        user: {
          ...sampleUser,
          profile_picture_url: 'https://cdn.example/current.png'
        }
      }
    });

    mockDeleteProfilePicture.mockResolvedValue({
      success: true,
      message: 'Profile picture removed successfully.',
      data: {
        user: {
          ...sampleUser,
          profile_picture_url: null,
          profile_version: 4
        }
      }
    });

    renderProfilePage();

    await openPictureModal(user);
    await user.click(screen.getByRole('button', { name: 'Remove picture' }));

    await waitFor(() => {
      expect(mockDeleteProfilePicture).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Profile picture removed successfully.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove picture' })).not.toBeInTheDocument();
  });

  it('displays backend 422 image validation message', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });

    mockUploadProfilePicture.mockRejectedValue({
      message: 'Validation failed.',
      status: 422,
      data: {
        message: 'Validation failed.',
        data: {
          errors: {
            image: ['The image must be a file of type: jpg, jpeg, png, webp.']
          }
        }
      }
    });

    renderProfilePage();

    await openPictureModal(user);
    await user.upload(screen.getByLabelText('Select profile picture'), file);
    await user.click(screen.getByRole('button', { name: 'Upload picture' }));

    expect(await screen.findByText('The image must be a file of type: jpg, jpeg, png, webp.')).toBeInTheDocument();
    expect(screen.getByText(/Selected: avatar\.png/)).toBeInTheDocument();
  });

  it('clears stale backend image errors when a new valid file is selected', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    const retryFile = new File(['retry'], 'retry.png', { type: 'image/png' });

    mockUploadProfilePicture.mockRejectedValue({
      message: 'Validation failed.',
      status: 422,
      data: {
        message: 'Validation failed.',
        data: {
          errors: {
            image: ['The image must be a file of type: jpg, jpeg, png, webp.']
          }
        }
      }
    });

    renderProfilePage();

    await openPictureModal(user);
    await user.upload(screen.getByLabelText('Select profile picture'), file);
    await user.click(screen.getByRole('button', { name: 'Upload picture' }));

    expect(await screen.findByText('The image must be a file of type: jpg, jpeg, png, webp.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Select profile picture'), { target: { files: [retryFile] } });

    expect(screen.queryByText('The image must be a file of type: jpg, jpeg, png, webp.')).not.toBeInTheDocument();
    expect(screen.getByText(/Selected: retry\.png/)).toBeInTheDocument();
  });

  it('clears stale success message when selecting a new file', async () => {
    const user = userEvent.setup();
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    const nextFile = new File(['next'], 'next.png', { type: 'image/png' });

    mockUploadProfilePicture.mockResolvedValue({
      success: true,
      message: 'Profile picture uploaded successfully.',
      data: {
        user: {
          ...sampleUser,
          profile_picture_url: 'https://cdn.example/new-avatar.png',
          profile_version: 4
        }
      }
    });

    renderProfilePage();

    await openPictureModal(user);
    await user.upload(screen.getByLabelText('Select profile picture'), file);
    await user.click(screen.getByRole('button', { name: 'Upload picture' }));

    expect(await screen.findByText('Profile picture uploaded successfully.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Select profile picture'), { target: { files: [nextFile] } });

    expect(screen.queryByText('Profile picture uploaded successfully.')).not.toBeInTheDocument();
    expect(screen.getByText(/Selected: next\.png/)).toBeInTheDocument();
  });

  it('renders Security Actions section', async () => {
    renderProfilePage('/account/profile?tab=security');

    expect(await screen.findByText('Security Actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconfigure 2FA' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disable 2fa/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/turn off 2fa/i)).not.toBeInTheDocument();
  });

  it('disables sensitive actions while offline', async () => {
    mockIsOnline = false;

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    expect(screen.getByText('Sensitive account changes require an active network connection.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Change Email' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reconfigure 2FA' })).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Manage Sessions' })).not.toBeInTheDocument();
  });

  it('change password dialog validates required fields and submits correct payload', async () => {
    const user = userEvent.setup();

    mockChangePassword.mockResolvedValue({
      success: true,
      message: 'Password changed successfully. Please sign in again.',
      data: { requires_reauthentication: true, revoked_sessions_count: 1 }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Please correct the highlighted fields.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'NewPassword12345');
    await user.type(screen.getByLabelText('Confirm new password'), 'NewPassword12345');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith({
        current_password: 'OldPassword123',
        otp: '123456',
        password: 'NewPassword12345',
        password_confirmation: 'NewPassword12345'
      });
    });
  });

  it('change password success clears auth session and redirects to login', async () => {
    const user = userEvent.setup();

    mockChangePassword.mockResolvedValue({
      success: true,
      message: 'Password changed successfully. Please sign in again.',
      data: { requires_reauthentication: true, revoked_sessions_count: 1 }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.type(screen.getByLabelText('New password'), 'NewPassword12345');
    await user.type(screen.getByLabelText('Confirm new password'), 'NewPassword12345');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      expect(mockBroadcastDisconnect).toHaveBeenCalled();
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('change password displays safe step-up failure', async () => {
    const user = userEvent.setup();

    mockChangePassword.mockRejectedValue({
      message: 'Step-up verification failed.',
      status: 422,
      data: { success: false, message: 'Step-up verification failed.', data: null }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Change Password' }));
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '000000');
    await user.type(screen.getByLabelText('New password'), 'NewPassword12345');
    await user.type(screen.getByLabelText('Confirm new password'), 'NewPassword12345');
    await user.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Step-up verification failed.')).toBeInTheDocument();
  });

  it('change email start submits correct payload and shows confirmation state', async () => {
    const user = userEvent.setup();

    mockStartEmailChange.mockResolvedValue({
      success: true,
      message: 'Email change verification sent.',
      data: { expires_in: 600, masked_email: 'n***@example.com' }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Change Email' }));
    await user.type(screen.getByLabelText('New email'), 'new.email@example.com');
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Send verification email' }));

    await waitFor(() => {
      expect(mockStartEmailChange).toHaveBeenCalledWith({
        current_password: 'OldPassword123',
        otp: '123456',
        new_email: 'new.email@example.com'
      });
    });

    expect(await screen.findByText(/n\*\*\*@example\.com/)).toBeInTheDocument();
    expect(screen.getByLabelText('Confirmation token')).toBeInTheDocument();
  });

  it('change email duplicate validation displays under email field', async () => {
    const user = userEvent.setup();

    mockStartEmailChange.mockRejectedValue({
      message: 'Validation failed.',
      status: 422,
      data: {
        message: 'Validation failed.',
        data: {
          errors: {
            new_email: ['The new email has already been taken.']
          }
        }
      }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Change Email' }));
    await user.type(screen.getByLabelText('New email'), 'guard@example.com');
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Send verification email' }));

    expect(await screen.findByText('The new email has already been taken.')).toBeInTheDocument();
  });

  it('change email confirm submits token and redirects to login', async () => {
    const user = userEvent.setup();

    mockStartEmailChange.mockResolvedValue({
      success: true,
      message: 'Email change verification sent.',
      data: { expires_in: 600, masked_email: 'n***@example.com' }
    });
    mockConfirmEmailChange.mockResolvedValue({
      success: true,
      message: 'Email changed successfully. Please sign in again.',
      data: { requires_reauthentication: true, revoked_sessions_count: 1 }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Change Email' }));
    await user.type(screen.getByLabelText('New email'), 'new.email@example.com');
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Send verification email' }));
    await screen.findByLabelText('Confirmation token');
    await user.type(screen.getByLabelText('Confirmation token'), 'plain-token');
    await user.click(screen.getByRole('button', { name: 'Confirm email change' }));

    await waitFor(() => {
      expect(mockConfirmEmailChange).toHaveBeenCalledWith({ token: 'plain-token' });
      expect(mockBroadcastDisconnect).toHaveBeenCalled();
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('2FA reconfiguration start submits current password and OTP', async () => {
    const user = userEvent.setup();

    mockStartTwoFactorReconfigure.mockResolvedValue({
      success: true,
      message: 'Two-factor reconfiguration started.',
      data: {
        two_factor_reconfigure_token: 'reconfig-token',
        manual_key: 'NEWSECRET',
        otpauth_uri: 'otpauth://totp/Test',
        expires_in: 600
      }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Reconfigure 2FA' }));
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(mockStartTwoFactorReconfigure).toHaveBeenCalledWith({
        current_password: 'OldPassword123',
        otp: '123456'
      });
    });
  });

  it('2FA reconfiguration displays QR and manual key after successful start', async () => {
    const user = userEvent.setup();

    mockStartTwoFactorReconfigure.mockResolvedValue({
      success: true,
      message: 'Two-factor reconfiguration started.',
      data: {
        two_factor_reconfigure_token: 'reconfig-token',
        manual_key: 'NEWSECRET',
        otpauth_uri: 'otpauth://totp/Test',
        expires_in: 600
      }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Reconfigure 2FA' }));
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('NEWSECRET')).toBeInTheDocument();
    expect(screen.getByText('1. Scan this QR code with your authenticator app')).toBeInTheDocument();
  });

  it('2FA reconfiguration verify submits token and new OTP', async () => {
    const user = userEvent.setup();

    mockStartTwoFactorReconfigure.mockResolvedValue({
      success: true,
      message: 'Two-factor reconfiguration started.',
      data: {
        two_factor_reconfigure_token: 'reconfig-token',
        manual_key: 'NEWSECRET',
        otpauth_uri: 'otpauth://totp/Test',
        expires_in: 600
      }
    });
    mockVerifyTwoFactorReconfigure.mockResolvedValue({
      success: true,
      message: 'Two-factor authentication reconfigured successfully. Please sign in again.',
      data: { requires_reauthentication: true, revoked_sessions_count: 1 }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Reconfigure 2FA' }));
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('NEWSECRET');
    await user.type(screen.getByLabelText('Authentication code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Complete reconfiguration' }));

    await waitFor(() => {
      expect(mockVerifyTwoFactorReconfigure).toHaveBeenCalledWith({
        two_factor_reconfigure_token: 'reconfig-token',
        otp: '654321'
      });
    });
  });

  it('2FA reconfiguration success clears auth session and redirects to login', async () => {
    const user = userEvent.setup();

    mockStartTwoFactorReconfigure.mockResolvedValue({
      success: true,
      message: 'Two-factor reconfiguration started.',
      data: {
        two_factor_reconfigure_token: 'reconfig-token',
        manual_key: 'NEWSECRET',
        otpauth_uri: 'otpauth://totp/Test',
        expires_in: 600
      }
    });
    mockVerifyTwoFactorReconfigure.mockResolvedValue({
      success: true,
      message: 'Two-factor authentication reconfigured successfully. Please sign in again.',
      data: { requires_reauthentication: true, revoked_sessions_count: 1 }
    });

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    await user.click(screen.getByRole('button', { name: 'Reconfigure 2FA' }));
    await user.type(screen.getByLabelText('Current password'), 'OldPassword123');
    await user.type(screen.getByLabelText('Authentication code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByText('NEWSECRET');
    await user.type(screen.getByLabelText('Authentication code'), '654321');
    await user.click(screen.getByRole('button', { name: 'Complete reconfiguration' }));

    await waitFor(() => {
      expect(mockBroadcastDisconnect).toHaveBeenCalled();
      expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
      expect(localStorage.getItem(AUTH_USER_KEY)).toBeNull();
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });
  });

  it('when offline, saving phone/address enqueues instead of calling updateProfile', async () => {
    const user = userEvent.setup();
    mockIsOnline = false;

    renderProfilePage();

    await screen.findByText('Guard User');
    await user.click(screen.getByTestId('profile-contact-edit'));
    await screen.findByLabelText('Phone');
    await user.clear(screen.getByLabelText('Phone'));
    await user.type(screen.getByLabelText('Phone'), '0123456789');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockEnqueueContactUpdate).toHaveBeenCalledWith({
        profileId: 'user-1',
        phone: '0123456789',
        address: 'Old address',
        profileVersion: 3
      });
    });

    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(await screen.findByText('Profile update saved offline. It will sync when you are online.')).toBeInTheDocument();
  });

  it('flushes queued contact update when online and updates profile state', async () => {
    mockFlushProfileOfflineQueue.mockResolvedValue({
      syncedProfile: {
        id: 'user-1',
        name: 'Guard User',
        email: 'guard@example.com',
        phone: '0999888777',
        address: 'Synced address',
        profilePictureUrl: null,
        profileVersion: 4,
        twoFactorEnabled: true,
        roleName: 'Guard',
        raw: {}
      },
      conflictItem: null,
      validationError: null,
      exhausted: false,
      authRequired: false,
      retryableFailure: null
    });

    renderProfilePage();

    await waitFor(() => {
      expect(mockFlushProfileOfflineQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'user-1'
        })
      );
    });

    // Synced value is reflected in the read-only Contact Information card.
    expect(await screen.findByText('0999888777')).toBeInTheDocument();
    expect(await screen.findByText('Offline profile update synced successfully.')).toBeInTheDocument();
  });

  it('shows offline conflict UI and reapply sends latest profile_version', async () => {
    const user = userEvent.setup();

    mockGetActiveOfflineQueueItem.mockResolvedValue({
      id: 'offline-queue-1',
      profileId: 'user-1',
      type: 'profile_update_contact',
      status: 'conflict',
      localValues: { phone: '0123456789', address: 'Offline address' },
      serverValues: { phone: 'Server phone', address: 'Server address' },
      serverProfile: { id: 'user-1', phone: 'Server phone', address: 'Server address', profileVersion: 6 }
    });

    mockReapplyOfflineQueueItem.mockResolvedValue({
      id: 'user-1',
      name: 'Guard User',
      email: 'guard@example.com',
      phone: '0123456789',
      address: 'Offline address',
      profilePictureUrl: null,
      profileVersion: 7,
      twoFactorEnabled: true,
      roleName: 'Guard',
      raw: {}
    });

    renderProfilePage();

    expect(await screen.findByText(/Your offline profile update could not be applied/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reapply my changes' }));

    await waitFor(() => {
      expect(mockReapplyOfflineQueueItem).toHaveBeenCalled();
    });
  });

  it('does not queue sensitive actions while offline', async () => {
    mockIsOnline = false;

    renderProfilePage('/account/profile?tab=security');

    await screen.findByText('Security Actions');
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeDisabled();
    expect(mockChangePassword).not.toHaveBeenCalled();
    expect(mockEnqueueContactUpdate).not.toHaveBeenCalled();
  });

  it('does not flush another user queue row after same-browser login switch', async () => {
    mockGetActiveOfflineQueueItem.mockImplementation(async ({ profileId }) => {
      if (profileId === 'user-1') {
        return {
          id: 'offline-queue-1',
          profileId: 'user-1',
          type: 'profile_update_contact',
          status: 'pending',
          localValues: { phone: '0123456789', address: 'User A address' },
          payload: { phone: '0123456789', address: 'User A address', profile_version: 3 }
        };
      }

      return null;
    });

    mockGetProfile.mockResolvedValue({
      success: true,
      message: 'Profile retrieved successfully.',
      data: {
        user: {
          ...sampleUser,
          id: 'user-2',
          email: 'other@example.com',
          name: 'Other User'
        }
      }
    });

    renderProfilePage();

    await waitFor(() => {
      expect(mockFlushProfileOfflineQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'user-2'
        })
      );
    });

    expect(mockFlushProfileOfflineQueue).not.toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'user-1'
      })
    );
    expect(screen.queryByText(/Your offline profile update could not be applied/)).not.toBeInTheDocument();
  });

  it('does not show conflict UI for another profile queue row', async () => {
    mockGetActiveOfflineQueueItem.mockImplementation(async ({ profileId }) => {
      if (profileId === 'user-2') {
        return null;
      }

      return {
        id: 'offline-queue-1',
        profileId: 'user-1',
        type: 'profile_update_contact',
        status: 'conflict',
        localValues: { phone: '0123456789', address: 'Offline address' },
        serverValues: { phone: 'Server phone', address: 'Server address' },
        serverProfile: { id: 'user-1', phone: 'Server phone', address: 'Server address', profileVersion: 6 }
      };
    });

    mockGetProfile.mockResolvedValue({
      success: true,
      message: 'Profile retrieved successfully.',
      data: {
        user: {
          ...sampleUser,
          id: 'user-2',
          email: 'other@example.com',
          name: 'Other User'
        }
      }
    });

    renderProfilePage();

    await screen.findByText('Other User');
    expect(screen.queryByText(/Your offline profile update could not be applied/)).not.toBeInTheDocument();
  });

  it('retry sync resets exhausted queue row and flushes for current profile', async () => {
    const user = userEvent.setup();

    mockGetActiveOfflineQueueItem.mockResolvedValue({
      id: 'offline-queue-1',
      profileId: 'user-1',
      type: 'profile_update_contact',
      status: 'exhausted',
      localValues: { phone: '0123456789', address: 'Offline address' },
      payload: { phone: '0123456789', address: 'Offline address', profile_version: 3 }
    });

    mockFlushProfileOfflineQueue.mockResolvedValue({
      syncedProfile: {
        id: 'user-1',
        name: 'Guard User',
        email: 'guard@example.com',
        phone: '0123456789',
        address: 'Offline address',
        profilePictureUrl: null,
        profileVersion: 4,
        twoFactorEnabled: true,
        roleName: 'Guard',
        raw: {}
      },
      conflictItem: null,
      validationError: null,
      exhausted: false,
      authRequired: false,
      retryableFailure: null
    });

    renderProfilePage();

    await screen.findByRole('button', { name: 'Retry sync' });
    await user.click(screen.getByRole('button', { name: 'Retry sync' }));

    await waitFor(() => {
      expect(mockResetExhaustedQueueItemForRetry).toHaveBeenCalledWith({
        profileId: 'user-1',
        itemId: 'offline-queue-1'
      });
      expect(mockFlushProfileOfflineQueue).toHaveBeenCalledWith(
        expect.objectContaining({
          profileId: 'user-1'
        })
      );
    });
  });

  it('disables profile picture controls while offline', async () => {
    const user = userEvent.setup();
    mockIsOnline = false;

    mockGetProfile.mockResolvedValue({
      success: true,
      message: 'Profile retrieved successfully.',
      data: {
        user: {
          ...sampleUser,
          profile_picture_url: 'https://example.com/avatar.jpg'
        }
      }
    });

    renderProfilePage();

    await openPictureModal(user);
    expect(screen.getByText('Profile picture changes require an active network connection.')).toBeInTheDocument();
    expect(screen.getByLabelText('Select profile picture')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload picture' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove picture' })).toBeDisabled();
    expect(mockUploadProfilePicture).not.toHaveBeenCalled();
    expect(mockDeleteProfilePicture).not.toHaveBeenCalled();
  });

  it('renders the account settings header and both tabs', async () => {
    renderProfilePage();

    expect(await screen.findByTestId('account-settings-header')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Account Settings' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Profile Summary' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Security Settings' })).toBeInTheDocument();
  });

  it('renders user identity, role, and derived account status on Profile Summary', async () => {
    renderProfilePage();

    await screen.findByText('Guard User');
    expect(screen.getByTestId('profile-account-status')).toBeInTheDocument();
    expect(screen.getByText('Active & secured')).toBeInTheDocument();
    // Role appears both as a badge and as metadata context.
    expect(screen.getAllByText('Guard').length).toBeGreaterThanOrEqual(1);
  });

  it('renders graceful fallback text for missing profile fields', async () => {
    mockGetProfile.mockResolvedValue({
      success: true,
      message: 'Profile retrieved successfully.',
      data: { user: { ...sampleUser, phone: null } }
    });

    renderProfilePage();

    await screen.findByText('Guard User');
    expect(screen.getByText('Not provided')).toBeInTheDocument();
  });

  it('renders security overview with 2FA, password, and session context', async () => {
    renderProfilePage('/account/profile?tab=security');

    expect(await screen.findByText('Security Overview')).toBeInTheDocument();
    expect(screen.getByTestId('profile-security-overview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconfigure 2FA' })).toBeInTheDocument();
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
  });
});
