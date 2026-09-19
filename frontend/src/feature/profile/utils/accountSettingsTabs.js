export const ACCOUNT_SETTINGS_TABS = {
  PROFILE: 'profile',
  SECURITY: 'security'
};

export const DEFAULT_ACCOUNT_SETTINGS_TAB = ACCOUNT_SETTINGS_TABS.PROFILE;

export const VALID_ACCOUNT_SETTINGS_TABS = new Set([ACCOUNT_SETTINGS_TABS.PROFILE, ACCOUNT_SETTINGS_TABS.SECURITY]);

/**
 * @param {string | null | undefined} tabParam
 * @returns {'profile' | 'security'}
 */
export function resolveAccountSettingsTab(tabParam) {
  if (tabParam && VALID_ACCOUNT_SETTINGS_TABS.has(tabParam)) {
    return tabParam;
  }

  return DEFAULT_ACCOUNT_SETTINGS_TAB;
}
