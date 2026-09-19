# Profile Module M9 — Frontend Profile View and Non-Sensitive Update

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../documentation.md`](../../documentation.md) and [`../../../docs/system-update/m6-account-settings-two-tab-redesign.md`](../../../docs/system-update/m6-account-settings-two-tab-redesign.md).

**Milestone:** M9  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M8 — Frontend Profile Foundation](m8-frontend-profile-foundation.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone extends the M8 profile foundation into a functional Account Settings experience. Authenticated users can view a non-sensitive profile summary and update contact fields (`phone`, `address`) through the existing backend profile API with optimistic `profile_version` concurrency, validation feedback, conflict recovery, `auth_user` synchronization, and cross-tab profile events.

M9 is **frontend-only**. Sensitive profile actions remain deferred to later milestones.

---

## 2. Scope

| Item | Status |
|---|---|
| `ProfileSummaryCard` read-only summary UI | **Implemented** |
| `ProfileContactForm` phone/address editor | **Implemented** |
| `profile_version` included in `PATCH /api/profile` | **Implemented** |
| Backend validation error display | **Implemented** |
| `409 profile_version_conflict` handling | **Implemented** |
| `auth_user` merge/update after successful save | **Implemented** |
| Cross-tab profile sync (`profileSyncEvents`) | **Implemented** |
| Header auth display refresh via `useAuthController` | **Implemented** |
| Focused Vitest / RTL tests | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| Profile picture upload/remove UI | M10 |
| Change password dialog | M11.1 |
| Change email dialog | M11.2 |
| 2FA reconfiguration dialog | M11.3 |
| Offline profile queue | M12 |
| Profile blockchain proof UI | M13 |
| User-controlled 2FA disablement | **Never** |

---

## 4. Frontend Architecture Summary

```
ProfilePage
 ├── ProfileSummaryCard
 ├── ProfileContactForm
 └── Security link → /account/profile?tab=security (at M9: `/account/security`; M6 redirect)
        │
        ▼
useProfileController
 ├── GET /api/profile on mount + refresh
 ├── PATCH /api/profile on save
 ├── auth_user sync (profileAuthSync)
 └── publish/subscribe profile sync events
        │
        ▼
ProfileRepository → profileService → api.js
```

Cross-tab/header consumers:

```
publishProfileUpdated()
 ├── CustomEvent (same tab)
 ├── BroadcastChannel (other tabs)
 └── localStorage fallback (other tabs)

useAuthController.subscribeToProfileUpdates()
 └── updates header currentUser
```

---

## 5. Route Contract

| Path | Guard | Roles | Component |
|---|---|---|---|
| `/account/profile` | `ProtectedRoute` → `RoleProtectedRoute` | `ALL_ROLES` | `ProfilePage` |

Unchanged from M8. At M9, `/account/security` was still the session-management surface; **System Update M6** moved sessions to `/account/profile?tab=security` (`/account/security` → redirect).

---

## 6. Backend API Contract Used by M9

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/profile` | Load profile summary and contact fields |
| `PATCH` | `/api/profile` | Update `phone`, `address`, optional `profile_version` |

**Update payload example:**

```json
{
  "phone": "0123456789",
  "address": "Kuala Lumpur",
  "profile_version": 4
}
```

**Success envelope:** `data.user` normalized by `ProfileRepository`.

**Validation error:** `422` with `data.errors` or nested `data.data.errors`.

**Conflict:** `409` with `data.code = profile_version_conflict` and latest `data.user` snapshot.

M9 does **not** call picture, password, email, or 2FA endpoints from UI.

---

## 7. UI Behavior

### Profile Summary

Displays:

- Avatar (picture URL or initials)
- Name, email, role
- Email verification chip
- 2FA status chip
- Profile version
- Last password change, last security change, last profile update timestamps

### Contact Information

- Editable `phone` and `address` only
- Client-side max-length checks (phone 30, address 1000)
- Save disabled while submitting or when unchanged
- Discard changes resets to server truth
- Success, validation, conflict, and general error alerts

### Security Section

- **Manage Sessions** link to `/account/profile?tab=security` (at M9: `/account/security`; M6 redirect)

---

## 8. Contact Update Flow

1. User edits phone/address.
2. Controller validates client limits.
3. `PATCH /api/profile` sends only `phone`, `address`, `profile_version`.
4. On success:
   - Controller profile state updates from response
   - `auth_user` merged via `syncAuthUserFromProfile()`
   - `publishProfileUpdated()` notifies other tabs/header
   - Success alert shown
5. On `422`:
   - Field errors mapped to form helpers
   - General save error alert shown
6. On `409 profile_version_conflict`:
   - Latest profile snapshot applied
   - Conflict alert shown
   - Form reset to server truth
   - User may edit and save again

---

## 9. Conflict Handling Behavior

When backend returns `409 profile_version_conflict`:

- Repository normalizes `data.user` from conflict payload
- Controller replaces in-memory profile with latest snapshot
- Form re-initializes from updated `profile_version`, phone, and address
- User sees: *“This profile was updated elsewhere. The latest profile has been loaded. Review and save again.”*
- Stale edits are not treated as saved

---

## 10. Cross-Tab Sync Behavior

`profileSyncEvents.js` provides:

- `publishProfileUpdated(payload)`
- `subscribeToProfileUpdates(callback)` with cleanup

Mechanisms:

1. Same-tab `CustomEvent`
2. `BroadcastChannel` for cross-tab delivery when supported
3. `localStorage` `storage` event fallback only when `BroadcastChannel` is unavailable

Each published event includes a unique `eventId`. Subscribers deduplicate by `eventId` to avoid duplicate refetches when multiple transport paths would otherwise deliver the same update.

`useProfileController` refetches profile on external sync events (with self-publish guard). `useAuthController` updates header `currentUser` from published `authUser` or normalized profile payload.

Logout/session-clear behavior remains unchanged.

---

## 11. Security Considerations

| Control | Implementation |
|---|---|
| No secrets in UI | Summary excludes OTP/TOTP/token/password data |
| PATCH field allow-list | Only `phone`, `address`, `profile_version` sent |
| No 2FA disable UI | Not rendered |
| API routing | All calls via `profileService` → `api.js` |
| Auth merge | Preserves `setup_required`, `two_factor_enabled`, and other auth-only fields |
| Route guards | `/account/profile` remains `ALL_ROLES` with initialized-session checks |

---

## 12. Test Coverage

| Test file | Coverage |
|---|---|
| `ProfilePage.test.jsx` | Summary, form init, save payload, auth_user sync, validation, conflict, refresh, security link |
| `ProfileRepository.test.js` | Normalization, conflict parsing |
| `profileSyncEvents.test.js` | Publish/subscribe/cleanup/localStorage fallback |
| `profileAuthSync.test.js` | Auth merge without losing auth-only fields |
| `useAuthController.profileSync.test.jsx` | Header user refresh on profile event |
| `AccountProfileRoute.test.jsx` | Route guard regression |
| `ProfileSection.test.jsx` | Menu navigation regression |

---

## 13. Files Created / Updated

### Created

| Path |
|---|
| `frontend/src/feature/profile/components/ProfileSummaryCard.jsx` |
| `frontend/src/feature/profile/components/ProfileContactForm.jsx` |
| `frontend/src/feature/profile/utils/profileValidation.js` |
| `frontend/src/feature/profile/utils/profileAuthSync.js` |
| `frontend/src/feature/profile/utils/profileSyncEvents.js` |
| `frontend/src/feature/profile/utils/profileSyncEvents.test.js` |
| `frontend/src/feature/profile/utils/profileAuthSync.test.js` |
| `frontend/src/feature/authentication/controllers/useAuthController.profileSync.test.jsx` |
| `backend/docs/profile/m9-frontend-profile-view-and-non-sensitive-update.md` |

### Updated

| Path | Change |
|---|---|
| `useProfileController.js` | Save flow, conflict/validation handling, sync subscription |
| `ProfileRepository.js` | Conflict error normalization |
| `profileErrors.js` | Validation extraction + conflict helpers |
| `profileFormatters.js` | Date, email verification, initials formatters |
| `ProfilePage.jsx` | Composed M9 layout |
| `ProfilePage.test.jsx` | Expanded M9 coverage |
| `ProfileRepository.test.js` | Conflict profile normalization |
| `useAuthController.js` | Profile sync subscription |
| `frontend/documentation.md` | M9 status + route table |
| `backend/documentation.md` | M9 doc link |

---

## 14. Passing Criteria

| Criterion | Status |
|---|---|
| `/account/profile` shows complete non-sensitive summary | Met |
| User can update phone and address | Met |
| `profile_version` sent on PATCH | Met |
| Validation errors visible | Met |
| Stale conflict handled safely | Met |
| `auth_user` and header state update after success | Met |
| Cross-tab sync events implemented | Met |
| Security Settings / logout unchanged | Met |
| M10/M11/M12 not implemented early | Met |
| Focused frontend tests pass | Met |

---

## 15. Next Milestones

| Milestone | Focus |
|---|---|
| M10 | Profile picture upload/remove UI |
| M11.1 | Change password dialog |
| M11.2 | Change email dialog |
| M11.3 | 2FA reconfiguration dialog |
| M12 | Offline profile queue |
| M13 | Profile blockchain proof integration |

---

## 16. Completion Statement

Profile Module **M9** is complete on the frontend. `/account/profile` now provides a full non-sensitive profile summary and contact update workflow with optimistic concurrency, safe conflict recovery, auth storage synchronization, and cross-tab/header refresh events. Profile picture UI and sensitive-change dialogs remain deferred to **M10–M11**.
