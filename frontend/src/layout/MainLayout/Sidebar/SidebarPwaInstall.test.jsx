import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import SidebarPwaInstall from './SidebarPwaInstall';

describe('SidebarPwaInstall', () => {
  it('renders install button when prompt is available', () => {
    render(
      <SidebarPwaInstall
        downMD
        drawerOpen
        showInstallButton
        isInstalled={false}
        isStandalone={false}
        hasDeferredPrompt
        promptInstall={vi.fn()}
        showUnsupportedHint={false}
      />
    );

    expect(screen.getByRole('button', { name: /install veripatrol/i })).toBeInTheDocument();
  });

  it('clicking install triggers prompt handler', async () => {
    const user = userEvent.setup();
    const promptInstall = vi.fn().mockResolvedValue(undefined);
    render(
      <SidebarPwaInstall
        downMD={false}
        drawerOpen
        showInstallButton
        isInstalled={false}
        isStandalone={false}
        hasDeferredPrompt
        promptInstall={promptInstall}
        showUnsupportedHint={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /install veripatrol/i }));
    expect(promptInstall).toHaveBeenCalledTimes(1);
  });

  it('renders non-disruptive unsupported hint without button', () => {
    render(
      <SidebarPwaInstall
        downMD
        drawerOpen
        showInstallButton={false}
        isInstalled={false}
        isStandalone={false}
        hasDeferredPrompt={false}
        promptInstall={vi.fn()}
        showUnsupportedHint
      />
    );

    expect(screen.queryByRole('button', { name: /install veripatrol/i })).not.toBeInTheDocument();
    expect(screen.getByText(/install prompt is unavailable/i)).toBeInTheDocument();
  });
});
