import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

import ProfileNotificationSettingsCard from './ProfileNotificationSettingsCard';

const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockSendTest = vi.fn();
const mockResolvePushNotificationStatus = vi.fn();

let mockIsOnline = true;

vi.mock('pwa/useNetworkStatus', () => ({
  useNetworkStatus: () => mockIsOnline
}));

vi.mock('pwa/pushNotificationService', () => ({
  resolvePushNotificationStatus: (...args) => mockResolvePushNotificationStatus(...args),
  subscribeToPushNotifications: (...args) => mockSubscribe(...args),
  unsubscribeFromPushNotifications: (...args) => mockUnsubscribe(...args),
  sendTestNotification: (...args) => mockSendTest(...args)
}));

describe('ProfileNotificationSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOnline = true;
    mockResolvePushNotificationStatus.mockResolvedValue({ status: 'permission_default', subscribed: false });
    mockSubscribe.mockResolvedValue({ subscription: {}, server: { success: true } });
    mockUnsubscribe.mockResolvedValue(undefined);
    mockSendTest.mockResolvedValue({ success: true, message: 'ok' });
  });

  it('shows unsupported browser state', async () => {
    mockResolvePushNotificationStatus.mockResolvedValue({ status: 'unsupported_browser', subscribed: false });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    expect(await screen.findByText(/not supported in this browser/i)).toBeInTheDocument();
    expect(screen.getByTestId('push-notification-toggle')).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows permission denied state', async () => {
    mockResolvePushNotificationStatus.mockResolvedValue({ status: 'permission_denied', subscribed: false });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    expect(await screen.findByText(/permission was denied/i)).toBeInTheDocument();
    expect(screen.getByTestId('push-notification-toggle')).toHaveAttribute('aria-disabled', 'true');
  });

  it('subscribes when toggle is enabled', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    await screen.findByTestId('push-notification-toggle');
    await user.click(screen.getByTestId('push-notification-toggle'));

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Push notifications enabled.')).toBeInTheDocument();
  });

  it('unsubscribes when toggle is disabled', async () => {
    const user = userEvent.setup();
    mockResolvePushNotificationStatus.mockResolvedValue({ status: 'subscribed', subscribed: true });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    await screen.findByTestId('push-notification-toggle');
    await user.click(screen.getByTestId('push-notification-toggle'));

    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  it('sends test notification when subscribed', async () => {
    const user = userEvent.setup();
    mockResolvePushNotificationStatus.mockResolvedValue({ status: 'subscribed', subscribed: true });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    await screen.findByRole('button', { name: 'Send test notification' });
    await user.click(screen.getByRole('button', { name: 'Send test notification' }));

    await waitFor(() => {
      expect(mockSendTest).toHaveBeenCalledTimes(1);
    });
  });

  it('blocks test notification when not subscribed', async () => {
    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'Send test notification' })).toBeDisabled();
  });

  it('displays subscribe errors safely', async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValue(new Error('Notification permission: denied'));

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    await screen.findByTestId('push-notification-toggle');
    await user.click(screen.getByTestId('push-notification-toggle'));

    expect(await screen.findByText('Notification permission: denied')).toBeInTheDocument();
  });

  it('shows dev mode SW unavailable message and disables switch', async () => {
    mockResolvePushNotificationStatus.mockResolvedValue({
      status: 'sw_unavailable_dev',
      subscribed: false,
      message: 'Push notifications require a production PWA service worker.'
    });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    expect(await screen.findByText(/production PWA service worker/i)).toBeInTheDocument();
    expect(screen.getByTestId('push-notification-toggle')).toHaveAttribute('aria-disabled', 'true');
  });

  it('reverts switch to off on service worker unavailable error', async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValue(new Error('Service worker is unavailable. Reload the app and try again.'));
    mockResolvePushNotificationStatus
      .mockResolvedValueOnce({ status: 'permission_granted_not_subscribed', subscribed: false })
      .mockResolvedValue({ status: 'registration_failed', subscribed: false });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    await screen.findByTestId('push-notification-toggle');
    await user.click(screen.getByTestId('push-notification-toggle'));

    // After subscribe fails the toggle must be disabled (registration_failed status).
    await waitFor(() => {
      expect(screen.getByTestId('push-notification-toggle')).toHaveAttribute('aria-disabled', 'true');
    });

    // Error message alert must be visible somewhere in the rendered output.
    const alerts = screen.getAllByRole('alert');
    const hasSwError = alerts.some((el) => /service worker/i.test(el.textContent ?? ''));
    expect(hasSwError).toBe(true);
  });

  it('shows actionable troubleshooting alert on push_service_error', async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValue(new Error('push_service_error: Registration failed - push service error'));
    mockResolvePushNotificationStatus
      .mockResolvedValueOnce({ status: 'permission_granted_not_subscribed', subscribed: false })
      .mockResolvedValue({ status: 'permission_granted_not_subscribed', subscribed: false });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    await screen.findByTestId('push-notification-toggle');
    await user.click(screen.getByTestId('push-notification-toggle'));

    // The dedicated troubleshooting alert must appear
    const troubleshootAlert = await screen.findByTestId('push-service-error-alert');
    expect(troubleshootAlert).toBeInTheDocument();
    expect(troubleshootAlert.textContent).toMatch(/clear site data/i);
    expect(troubleshootAlert.textContent).toMatch(/localhost/i);
    expect(troubleshootAlert.textContent).toMatch(/VITE_VAPID_PUBLIC_KEY/i);
  });

  it('shows vapid_key_error alert on VAPID key failure', async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValue(new Error('VITE_VAPID_PUBLIC_KEY is missing or invalid.'));
    mockResolvePushNotificationStatus
      .mockResolvedValueOnce({ status: 'permission_granted_not_subscribed', subscribed: false })
      .mockResolvedValue({ status: 'permission_granted_not_subscribed', subscribed: false });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    await screen.findByTestId('push-notification-toggle');
    await user.click(screen.getByTestId('push-notification-toggle'));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      const hasVapidError = alerts.some((el) => /VAPID key error/i.test(el.textContent ?? ''));
      expect(hasVapidError).toBe(true);
    });
  });

  it('distinguishes backend subscription failure from browser push service failure', async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValue(new Error('Failed to save push subscription on the server.'));
    mockResolvePushNotificationStatus
      .mockResolvedValueOnce({ status: 'permission_granted_not_subscribed', subscribed: false })
      .mockResolvedValue({ status: 'permission_granted_not_subscribed', subscribed: false });

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    await screen.findByTestId('push-notification-toggle');
    await user.click(screen.getByTestId('push-notification-toggle'));

    // Should NOT show the push_service_error troubleshooting alert
    await waitFor(() => {
      const errorAlerts = screen.queryByTestId('push-service-error-alert');
      expect(errorAlerts).toBeNull();
    });

    // Should show a generic error message
    await waitFor(() => {
      const alerts = screen.getAllByRole('alert');
      const hasBackendError = alerts.some((el) => /subscription/i.test(el.textContent ?? ''));
      expect(hasBackendError).toBe(true);
    });
  });

  it('blocks push actions while offline', async () => {
    mockIsOnline = false;

    render(
      <MemoryRouter>
        <ProfileNotificationSettingsCard />
      </MemoryRouter>
    );

    expect(await screen.findByText(/require an active network connection/i)).toBeInTheDocument();
    expect(screen.getByTestId('push-notification-toggle')).toHaveAttribute('aria-disabled', 'true');
  });
});
