import { describe, expect, it } from 'vitest';

import {
  ACCOUNT_SETTINGS_TABS,
  DEFAULT_ACCOUNT_SETTINGS_TAB,
  resolveAccountSettingsTab
} from './accountSettingsTabs';

describe('accountSettingsTabs', () => {
  it('defaults missing tab to profile', () => {
    expect(resolveAccountSettingsTab(null)).toBe(DEFAULT_ACCOUNT_SETTINGS_TAB);
    expect(resolveAccountSettingsTab(undefined)).toBe(DEFAULT_ACCOUNT_SETTINGS_TAB);
    expect(resolveAccountSettingsTab('')).toBe(DEFAULT_ACCOUNT_SETTINGS_TAB);
  });

  it('resolves valid tabs', () => {
    expect(resolveAccountSettingsTab(ACCOUNT_SETTINGS_TABS.PROFILE)).toBe('profile');
    expect(resolveAccountSettingsTab(ACCOUNT_SETTINGS_TABS.SECURITY)).toBe('security');
  });

  it('falls back invalid tab values to profile', () => {
    expect(resolveAccountSettingsTab('invalid')).toBe('profile');
    expect(resolveAccountSettingsTab('sessions')).toBe('profile');
  });
});
