# M6 — Account Settings Two-Tab Redesign

**Milestone:** M6  
**Status:** Complete  
**Completion Date:** 2026-07-02  
**Previous Milestone:** M5 — UI/UX Standardization (system update)

---

## 1. Purpose

M6 consolidates account management into a single, coherent **Account Settings** experience with two query-driven tabs: **Profile Summary** and **Security Settings**. The milestone relocates push notification controls from the header demo dropdown into Account Settings while preserving all existing security, offline, and session-management behavior.

---

## 2. Scope

### In Scope

- Two-tab Account Settings page at `/account/profile` with `tab=profile` and `tab=security`.
- Compatibility redirect from `/account/security` to `/account/profile?tab=security`.
- Profile Summary tab: summary card, profile picture, contact form, offline conflict handling, push notification settings.
- Security Settings tab: password/email/2FA actions, active session list, revoke session actions.
- Header profile menu route updates.
- Header notification dropdown cleanup (remove misleading demo content).
- Focused Vitest coverage and milestone documentation.

### Out of Scope

- Backend API changes (profile, auth sessions, push subscriptions).
- New auth/session/push service implementations.
- 2FA disablement or security policy changes.
- Patrol PWA notification controls on the patrol page (unchanged).
- Unrelated dashboard, patrol, camera, ANPR, or blockchain modules.

---

## 3. Implementation Summary

The canonical Account Settings route remains `/account/profile`. `ProfilePage.jsx` now renders Material UI tabs controlled by the `tab` query parameter via `useSearchParams`. Invalid or missing `tab` values default to **Profile Summary**.

`/account/security` is preserved as a thin compatibility route that redirects to `/account/profile?tab=security`.

Session management UI was extracted from `AccountSecurityPage.jsx` into `AccountSecuritySessionPanel.jsx` and embedded in the Security Settings tab. Push notification enablement was added as `ProfileNotificationSettingsCard.jsx`, reusing `pushNotificationService.js` without duplicating API calls.

The header notification dropdown no longer shows fake users, unread counts, or template settings. It now displays a short operational message with a link to Account Settings notification controls.

---

## 4. Route Model

| Route | Behavior |
| ----- | -------- |
| `/account/profile` | Canonical Account Settings page; defaults to Profile Summary tab |
| `/account/profile?tab=profile` | Profile Summary tab |
| `/account/profile?tab=security` | Security Settings tab |
| `/account/security` | Redirects to `/account/profile?tab=security` |

All routes remain available to initialized **Admin**, **Security Operator**, and **Guard** roles through existing `RoleProtectedRoute` guards.

---

## 5. Tab Behavior

- Tab selection is stored in the URL query string and survives page refresh.
- Clicking a tab updates the query parameter (`tab` is omitted when Profile Summary is active).
- Invalid `tab` values safely fall back to Profile Summary.
- Initial profile load uses skeleton placeholders on the Profile Summary tab (M5 UI state convention).
- Security tab session list maintains its own loading state via `useAccountSecurityController`.

---

## 6. Profile Summary Tab Features

- **Profile summary card** — name, email, role, 2FA status, email verification, profile version, security timestamps.
- **Profile picture upload/removal** — online-only; syncs `auth_user` and header avatar.
- **Phone/address contact form** — online update or offline queue (M12 behavior preserved).
- **Offline conflict alert** — conflict detection, keep-server, and reapply flows.
- **Notification settings card** — subscribe, unsubscribe, send test notification via existing PWA push service.
- **Refresh / retry sync** controls where applicable.

---

## 7. Security Settings Tab Features

- **Change password** — current password + OTP; success clears session and redirects to `/login`.
- **Change email** — current password + OTP + email confirmation token; success clears session.
- **Reconfigure 2FA** — current password + current OTP + new OTP; no disable option.
- **Active sessions panel** — list, revoke single session, revoke all sessions.
- **Security explanatory copy** — step-up verification and re-login requirements.

---

## 8. Notification Relocation Details

Push notification controls moved from the header `NotificationSection` demo dropdown to `ProfileNotificationSettingsCard` on the Profile Summary tab.

The card surfaces:

- Unsupported browser state
- Permission default / not requested
- Permission denied (with browser/site settings guidance)
- Permission granted but not subscribed
- Subscribed state
- Loading, subscribing, unsubscribing, and testing states
- Safe error and success messages

Actions use `isPushNotificationSupported`, `getNotificationPermission`, `getExistingPushSubscription`, `subscribeToPushNotifications`, `unsubscribeFromPushNotifications`, and `sendTestNotification` from `pushNotificationService.js`. Push subscription changes require online mode.

---

## 9. Security Controls Preserved

- **2FA remains mandatory** — no user-facing disable action.
- **Password change** requires current password + OTP.
- **Email change** requires current password + OTP + confirmation token.
- **2FA reconfiguration** requires current password + current OTP + new OTP verification.
- **Sensitive success** clears local auth/session state and redirects to `/login`.
- **Session management** never exposes raw refresh tokens, JWTs, cookies, or secrets.
- All sensitive API calls continue through `api.js` and existing service/repository layers.

---

## 10. Offline Behavior Rules

| Action | Offline behavior |
| ------ | ---------------- |
| Phone/address update | Queued locally (M12); flush on reconnect |
| Profile picture upload/removal | Blocked (online-only) |
| Password/email/2FA changes | Blocked (online-only) |
| Push subscribe/unsubscribe/test | Blocked (online-only) |
| Session revoke | Blocked (online-only); revoke actions disabled with warning |

---

## 11. Files Changed

### Profile feature

- `frontend/src/feature/profile/views/ProfilePage.jsx` — two-tab Account Settings layout
- `frontend/src/feature/profile/views/ProfilePage.test.jsx` — tab, notification, and security tab tests
- `frontend/src/feature/profile/components/ProfileNotificationSettingsCard.jsx` (new)
- `frontend/src/feature/profile/components/ProfileNotificationSettingsCard.test.jsx` (new)
- `frontend/src/feature/profile/components/ProfileSecurityActions.jsx` — optional `hideSessionLink` prop
- `frontend/src/feature/profile/utils/accountSettingsTabs.js` (new)
- `frontend/src/feature/profile/utils/accountSettingsTabs.test.js` (new)

### Account security feature

- `frontend/src/feature/account-security/views/AccountSecurityPage.jsx` — redirect wrapper
- `frontend/src/feature/account-security/views/AccountSecurityPage.test.jsx` — redirect test
- `frontend/src/feature/account-security/components/AccountSecuritySessionPanel.jsx` (new)
- `frontend/src/feature/account-security/components/AccountSecuritySessionPanel.test.jsx` (new)

### Layout and routes

- `frontend/src/layout/MainLayout/Header/ProfileSection/index.jsx` — menu routes; removed demo Social Profile item
- `frontend/src/layout/MainLayout/Header/ProfileSection/ProfileSection.test.jsx`
- `frontend/src/layout/MainLayout/Header/NotificationSection/index.jsx` — operational message + settings link
- `frontend/src/routes/guards/AccountSecurityRoute.test.jsx` — compatibility redirect coverage

### Documentation

- `docs/system-update/m6-account-settings-two-tab-redesign.md` (this file)
- `frontend/documentation.md` — route and M6 cross-reference updates

---

## 12. Tests Run and Results

```bash
npx vitest run src/feature/profile src/feature/account-security
npx vitest run src/layout/MainLayout/Header/ProfileSection
npx vitest run src/routes/guards
npm run build
```

| Command | Result |
| ------- | ------ |
| Profile + account-security Vitest | **143 passed** (19 files) |
| ProfileSection Vitest | **4 passed** |
| Route guards Vitest | included above |
| `npm run build` | **Passed** |

---

## 13. Acceptance Criteria Checklist

- [x] `/account/profile` is the canonical Account Settings page
- [x] `tab=profile` and `tab=security` work and survive refresh
- [x] `/account/security` redirects safely to `/account/profile?tab=security`
- [x] Profile Summary includes profile, picture, contact, notification, offline conflict behavior
- [x] Security Settings includes password/email/2FA actions and active session management
- [x] Notification controls removed from misleading header demo dropdown
- [x] No user-facing 2FA disablement
- [x] Sensitive flows require step-up verification and force re-login after success
- [x] Offline restrictions remain correct
- [x] Focused Vitest tests pass
- [x] M6 documentation exists under `docs/system-update`

---

## 14. Known Limitations

- The header notification bell remains as an entry point only; it does not display a live in-app notification inbox (no backend notification feed exists).
- Push notification permission recovery after browser-level denial requires manual user action in browser/site settings.
- Patrol page `PatrolPwaStatusPanel` still exposes patrol-context push controls for field operations; Account Settings is the canonical user preference surface.
- Push unsubscribe may leave a stale backend subscription record if `localStorage` is cleared while a browser push subscription still exists (pre-existing `pushNotificationService` behavior).

### Post-review polish (M6 follow-up)

- `PaginationFooter` is hidden when the session list total is zero.
- Session revoke/revoke-all controls are disabled offline with an explicit warning, matching sensitive-action UX.
- `/account/security` compatibility tests assert the redirect lands on `tab=security`.

---

## 15. Completion Statement

M6 delivers a polished two-tab Account Settings experience that unifies profile, notification, security, 2FA, and session controls under `/account/profile` while maintaining backward-compatible routing and all existing high-security behaviors.
