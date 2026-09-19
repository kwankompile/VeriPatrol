# Profile Module M11 — Frontend Sensitive Change Flows

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../documentation.md`](../../documentation.md) and [`../../../docs/system-update/m6-account-settings-two-tab-redesign.md`](../../../docs/system-update/m6-account-settings-two-tab-redesign.md).

**Milestone:** M11  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M10 — Frontend Profile Picture UI](m10-frontend-profile-picture-ui.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone implements the React frontend for self-service **password change**, **email change**, and **2FA reconfiguration** on `/account/profile`. Each flow uses the existing backend APIs delivered in Profile M5–M7, requires step-up verification where applicable, and forces re-authentication after successful completion.

M11 is **frontend-only**. Backend password, email, and 2FA endpoints were implemented in earlier milestones.

---

## 2. Scope

| Item | Status |
|---|---|
| Security Actions section on `/account/profile` | **Implemented** |
| `ChangePasswordDialog` | **Implemented** |
| `ChangeEmailDialog` (start + confirm) | **Implemented** |
| `TwoFactorReconfigureDialog` (start + verify) | **Implemented** |
| Focused controller hooks per sensitive flow | **Implemented** |
| Repository normalization for sensitive responses | **Implemented** |
| Client-side validation helpers | **Implemented** |
| Offline disablement for sensitive actions | **Implemented** |
| Local auth clear + redirect to `/login` on success | **Implemented** |
| Focused Vitest / RTL tests | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| Offline profile queue for sensitive actions | M12 |
| Profile blockchain proof UI | M13 |
| User-controlled 2FA disablement | **Never** |

---

## 4. Architecture Summary

```
ProfilePage
 ├── ProfileSummaryCard
 ├── ProfilePictureUploader
 ├── ProfileContactForm
 └── ProfileSecurityActions
      ├── ChangePasswordDialog → useChangePasswordController
      ├── ChangeEmailDialog → useChangeEmailController
      └── TwoFactorReconfigureDialog → useTwoFactorReconfigureController
              │
              ▼
      ProfileRepository → profileService → api.js
```

| Layer | Responsibility |
|---|---|
| `ProfileSecurityActions` | Security action buttons, offline warning, dialog orchestration |
| Dialog components | Form UI, step display, accessible labels |
| Controller hooks | Validation, submission, error handling, session end on success |
| `ProfileRepository` | Normalizes sensitive success envelopes |
| `profileSensitiveSession.js` | Clears `auth_user` / access token and redirects to `/login` |

Non-sensitive M9/M10 behavior (`useProfileController`, contact update, picture upload/remove, `auth_user` sync, cross-tab events) is unchanged.

---

## 5. Backend API Contract Used

### Change password — `POST /api/profile/password/change`

```json
{
  "current_password": "old-password",
  "otp": "123456",
  "password": "new-password",
  "password_confirmation": "new-password"
}
```

Success: `requires_reauthentication: true`, `revoked_sessions_count`. No new access token.

### Change email — `POST /api/profile/email/start`

```json
{
  "current_password": "current-password",
  "otp": "123456",
  "new_email": "new.email@example.com"
}
```

Success: `expires_in`, `masked_email`.

### Change email confirm — `POST /api/profile/email/confirm`

```json
{ "token": "plain-token-from-email" }
```

Success: `requires_reauthentication: true`, `revoked_sessions_count`.

### 2FA reconfigure start — `POST /api/profile/2fa/reconfigure/start`

```json
{
  "current_password": "current-password",
  "otp": "123456"
}
```

Success: `two_factor_reconfigure_token`, `manual_key`, `otpauth_uri`, `expires_in`.

### 2FA reconfigure verify — `POST /api/profile/2fa/reconfigure/verify`

```json
{
  "two_factor_reconfigure_token": "short-lived-token",
  "otp": "654321"
}
```

Success: `requires_reauthentication: true`, `revoked_sessions_count`.

### Error handling

| Status | Behavior |
|---|---|
| `422` | Step-up failure message and/or field validation under `errors` or `data.errors` |
| `429` | `retry_after_seconds` displayed when present |

---

## 6. UI Behavior

### Security Actions

- Buttons: **Change Password**, **Change Email**, **Reconfigure 2FA**, **Manage Sessions** (`/account/profile?tab=security`; at M11: `/account/security`; M6 redirect)
- Sensitive buttons disabled when offline via `useNetworkStatus()`
- Offline warning: “Sensitive account changes require an active network connection.”

### Change Password

- Fields: current password, OTP, new password, confirmation
- Minimum password length hint (12 characters, matching backend default)
- Sign-out warning before submit
- Success → clear local session → redirect `/login`

### Change Email

- **Step 1:** new email, current password, OTP → start API
- **Step 2:** check-email message, masked email, expiry hint, dev/test token input → confirm API
- Email validation errors shown under the email field
- Token is never persisted to `localStorage` / `sessionStorage`

### 2FA Reconfiguration

- **Step 1:** current password + current OTP → start API
- **Step 2:** QR code (`qrcode.react`), manual key, new OTP → verify API
- Sign-out warning on verify step
- **No disable 2FA control** anywhere in the UI
- Sensitive tokens/keys cleared when the dialog closes

---

## 7. Security Considerations

- All requests go through `profileService` → `api.js`; dialogs do not call `api.js` directly
- Backend remains authoritative for validation and step-up
- Sensitive actions are **never queued** offline (M12 deferred)
- No user-controlled 2FA disable path
- No secrets, tokens, or OTP values stored in persistent browser storage
- Successful sensitive actions rely on backend session revocation; frontend clears local auth without a follow-up logout request

---

## 8. State and Session Handling

On password change, email confirm, or 2FA verify success:

1. `broadcastService.disconnect()` tears down the same-tab Reverb/Echo client (matching logout teardown)
2. `clearAuthSession()` removes access token and `auth_user`
3. `navigate('/login', { replace: true })`
4. PWA IndexedDB queues are untouched
5. No sensitive values passed in route state

---

## 9. Test Coverage

| Area | Tests |
|---|---|
| `ProfilePage` | Security Actions render, offline disablement, password/email/2FA dialog flows, auth clear + redirect, no 2FA disable control |
| `profileValidation` | Password, email, and 2FA client validators |
| `ProfileRepository` | Sensitive response normalization |
| Regression | M9 contact/conflict/sync, M10 picture upload/remove |

---

## 10. Files Created / Updated

**Created**

- `frontend/src/feature/profile/components/ProfileSecurityActions.jsx`
- `frontend/src/feature/profile/components/ChangePasswordDialog.jsx`
- `frontend/src/feature/profile/components/ChangeEmailDialog.jsx`
- `frontend/src/feature/profile/components/TwoFactorReconfigureDialog.jsx`
- `frontend/src/feature/profile/controllers/useChangePasswordController.js`
- `frontend/src/feature/profile/controllers/useChangeEmailController.js`
- `frontend/src/feature/profile/controllers/useTwoFactorReconfigureController.js`
- `frontend/src/feature/profile/utils/profileSensitiveSession.js`
- `backend/docs/profile/m11-frontend-sensitive-change-flows.md`

**Updated**

- `frontend/src/feature/profile/views/ProfilePage.jsx`
- `frontend/src/feature/profile/repositories/ProfileRepository.js`
- `frontend/src/feature/profile/utils/profileValidation.js`
- `frontend/src/feature/profile/utils/profileErrors.js`
- `frontend/src/feature/profile/views/ProfilePage.test.jsx`
- `frontend/src/feature/profile/utils/profileValidation.test.js`
- `frontend/src/feature/profile/repositories/ProfileRepository.test.js`
- `frontend/documentation.md`
- `backend/documentation.md`

---

## 11. Passing Criteria

- Password change UI works with current password + OTP + new password
- Email change supports start and token confirmation
- 2FA reconfiguration supports step-up, new QR/manual key, and verify OTP
- Sensitive success clears local session and redirects to `/login`
- Sensitive actions disabled offline; never queued
- No user-facing 2FA disable path
- M9/M10 profile behavior unchanged
- Focused tests pass

---

## 12. Known Limitations

- Email confirmation depends on receiving the token via email (dev/test token input supports local mail logs/Mailtrap)
- Client validation is UX-only; backend enforces final rules
- Blockchain anchoring for profile security events remains deferred to M13

---

## 13. Next Milestones

| Milestone | Focus |
|---|---|
| **M12** | Offline profile queue |
| **M13** | Profile blockchain proof UI |

---

## 14. Completion Statement

Profile Module **M11 — Frontend Sensitive Change Flows** is complete. `/account/profile` now exposes password change, email change, and 2FA reconfiguration dialogs wired to existing M5–M7 backend APIs, with offline guards, normalized repository responses, session clearing on success, and comprehensive frontend tests.
