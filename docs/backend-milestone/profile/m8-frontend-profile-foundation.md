# Profile Module M8 — Frontend Profile Foundation

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../documentation.md`](../../documentation.md) and [`../../../docs/system-update/m6-account-settings-two-tab-redesign.md`](../../../docs/system-update/m6-account-settings-two-tab-redesign.md).

**Milestone:** M8  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M7 — Backend 2FA Reconfiguration](m7-profile-backend-2fa-reconfiguration.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone introduces the **frontend Profile feature foundation** for self-service Account Settings. It establishes the layered `feature/profile` module, a protected `/account/profile` route for all initialized roles, and header menu wiring so **Account Settings** navigates to the new page.

M8 proves the frontend can load server profile truth through shared `api.js` without implementing later edit, picture, or sensitive-change dialogs.

---

## 2. Scope

| Item | Status |
|---|---|
| `frontend/src/feature/profile/` module skeleton | **Implemented** |
| `profileService.js` datasource (all profile endpoints) | **Implemented** |
| `ProfileRepository.js` normalization layer | **Implemented** |
| `useProfileController.js` load/refresh hook | **Implemented** |
| `ProfilePage.jsx` foundation view | **Implemented** |
| Protected route `/account/profile` (`ALL_ROLES`) | **Implemented** |
| Header **Account Settings** → `/account/profile` | **Implemented** |
| Focused Vitest / RTL tests | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| Phone/address edit form UI | M9 |
| Profile picture upload/remove UI | M10 |
| Change password dialog | M11.1 |
| Change email dialog | M11.2 |
| 2FA reconfiguration dialog | M11.3 |
| Offline profile queue (PWA) | M12 |
| Profile blockchain proof UI | M13 |
| User-controlled 2FA disablement | **Never** |

M8 does **not** duplicate session tables. At M8, `/account/security` was still a standalone page; **System Update M6** later consolidated session management on `/account/profile?tab=security` (`/account/security` → redirect).

---

## 4. Frontend Architecture Summary

```
ProfilePage (view)
    └── useProfileController (controller)
            └── ProfileRepository (repository)
                    └── profileService (datasource)
                            └── api.js → Laravel /api/profile*
```

Supporting utilities:

- `utils/profileErrors.js` — structured service error mapping
- `utils/profileFormatters.js` — read-only display helpers
- `components/ProfileFoundationCard.jsx` — minimal summary card

---

## 5. Route Contract

| Path | Guard | Roles | Component |
|---|---|---|---|
| `/account/profile` | `ProtectedRoute` → `MainLayout` → `RoleProtectedRoute` | `ALL_ROLES` (Admin, Security Operator, Guard) | `ProfilePage` |

Unauthenticated or incomplete sessions redirect to `/login` through existing guards. Wrong role redirects to `/forbidden`.

---

## 6. Layer Responsibilities

### Datasource — `profileService.js`

Calls shared `api.js` only. Exposes:

- `getProfile()`
- `updateProfile(payload)`
- `uploadProfilePicture(formData)`
- `deleteProfilePicture()`
- `changePassword(payload)`
- `startEmailChange(payload)`
- `confirmEmailChange(payload)`
- `startTwoFactorReconfigure(payload)`
- `verifyTwoFactorReconfigure(payload)`

Errors preserve `status` and backend `data` for future M9–M11 UI.

### Repository — `ProfileRepository.js`

- Normalizes `data.user` to frontend-friendly camelCase fields
- Defensively supports direct user payloads
- Throws on `success === false`
- Passes through `409 profile_version_conflict` service errors for M9

### Controller — `useProfileController.js`

- Loads profile on mount
- Tracks `profile`, `loading`, `refreshing`, `error`, `reload`
- No contact edit, sensitive dialogs, or offline queue

### View — `ProfilePage.jsx`

- `MainCard` titled **Account Settings**
- Foundation message and minimal read-only summary (name, email, role, 2FA status, profile version)
- Loading/error states, **Refresh** button
- **Manage Sessions** link to `/account/profile?tab=security` (at M8: `/account/security`; superseded by M6 redirect model)

---

## 7. Profile Menu Behavior

| Menu item | Route / action |
|---|---|
| Security Settings | `/account/profile?tab=security` (at M8: `/account/security`; M6 redirect) |
| Account Settings | `/account/profile` (**M8**) |
| Social Profile | Placeholder (unchanged) |
| Logout | Existing `useAuthController.handleLogout` (unchanged) |

---

## 8. Security Considerations

- No direct `fetch`; auth and refresh-on-401 remain centralized in `api.js`
- No secrets, OTPs, tokens, or manual keys stored in `localStorage` / `sessionStorage`
- Normalized profile model does not expose TOTP secrets or password material
- No **Disable 2FA** UI or API wiring
- Sensitive profile methods exist in the service/repository for future milestones but are not invoked from M8 UI

---

## 9. Test Coverage

| Test file | Coverage |
|---|---|
| `profileService.test.js` | Endpoint wiring, FormData upload, error preservation |
| `ProfileRepository.test.js` | Normalization, fallbacks, `success: false`, 409 passthrough |
| `ProfilePage.test.jsx` | Loading, summary, error, refresh, security link |
| `AccountProfileRoute.test.jsx` | `ALL_ROLES` access, unauthenticated redirect |
| `ProfileSection.test.jsx` | Account Settings / Security Settings navigation, logout unchanged |

---

## 10. Passing Criteria

- `/account/profile` accessible to Admin, Security Operator, and Guard with valid initialized sessions
- Account Settings menu navigates to `/account/profile`
- Security Settings and logout behavior unchanged
- Profile loads from `GET /api/profile` through repository normalization
- No M9–M12 UI implemented early
- Frontend tests pass for profile-focused suites

---

## 11. Files Changed

### Created (frontend)

| Path |
|---|
| `frontend/src/feature/profile/datasources/profileService.js` |
| `frontend/src/feature/profile/datasources/profileService.test.js` |
| `frontend/src/feature/profile/repositories/ProfileRepository.js` |
| `frontend/src/feature/profile/repositories/ProfileRepository.test.js` |
| `frontend/src/feature/profile/controllers/useProfileController.js` |
| `frontend/src/feature/profile/components/ProfileFoundationCard.jsx` |
| `frontend/src/feature/profile/views/ProfilePage.jsx` |
| `frontend/src/feature/profile/views/ProfilePage.test.jsx` |
| `frontend/src/feature/profile/utils/profileErrors.js` |
| `frontend/src/feature/profile/utils/profileFormatters.js` |
| `frontend/src/routes/guards/AccountProfileRoute.test.jsx` |
| `frontend/src/layout/MainLayout/Header/ProfileSection/ProfileSection.test.jsx` |

### Updated (frontend)

| Path | Change |
|---|---|
| `frontend/src/routes/MainRoutes.jsx` | `/account/profile` route |
| `frontend/src/layout/MainLayout/Header/ProfileSection/index.jsx` | Account Settings navigation |
| `frontend/documentation.md` | M8 status note |

### Created (documentation)

| Path |
|---|
| `backend/docs/profile/m8-frontend-profile-foundation.md` |

### Updated (documentation)

| Path | Change |
|---|---|
| `backend/documentation.md` | M8 doc link in profile progress section |

---

## 12. Next Milestones

| Milestone | Focus |
|---|---|
| M9 | Contact update UI (phone/address) with optimistic concurrency |
| M10 | Profile picture upload/remove UI |
| M11.1–M11.3 | Password, email, and 2FA reconfiguration dialogs |
| M12 | Offline profile queue |
| M13 | Profile blockchain proof integration |

---

## 13. M8 Completion Statement

Profile Module **M8** delivers the frontend profile foundation: layered service/repository/controller/view structure, protected `/account/profile` for all initialized roles, and Account Settings menu wiring. The page loads and displays a minimal read-only profile summary while deferring edit, picture, sensitive-change, offline, and disable-2FA functionality to later milestones.
