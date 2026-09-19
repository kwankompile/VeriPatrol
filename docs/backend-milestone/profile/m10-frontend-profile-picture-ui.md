# Profile Module M10 — Frontend Profile Picture UI

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../documentation.md`](../../documentation.md) and [`../../../docs/system-update/m6-account-settings-two-tab-redesign.md`](../../../docs/system-update/m6-account-settings-two-tab-redesign.md).

**Milestone:** M10  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M9 — Frontend Profile View and Non-Sensitive Update](m9-frontend-profile-view-and-non-sensitive-update.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone adds self-service profile picture upload and removal to `/account/profile`. Authenticated users can preview a selected image, upload it through the existing M3 backend API, remove the current picture, and see immediate UI updates across the profile page, summary card, `auth_user`, header avatar, and cross-tab subscribers.

M10 is **frontend-only**. No backend runtime changes were required.

---

## 2. Scope

| Item | Status |
|---|---|
| `ProfilePictureUploader` component | **Implemented** |
| Client-side file type and size validation (UX only) | **Implemented** |
| `POST /api/profile/picture` upload via `FormData` field `image` | **Implemented** |
| `DELETE /api/profile/picture` removal | **Implemented** |
| Normalized repository responses for upload/remove | **Implemented** |
| `useProfileController` picture state and actions | **Implemented** |
| Profile page composition (Summary → Picture → Contact → Security) | **Implemented** |
| Header avatar from `currentUser.profile_picture_url` | **Implemented** |
| `auth_user` sync and cross-tab profile events after upload/remove | **Implemented** |
| Focused Vitest / RTL tests | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
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
 ├── ProfilePictureUploader
 ├── ProfileContactForm
 └── Security link → /account/profile?tab=security (at M10: `/account/security`; M6 redirect)
        │
        ▼
useProfileController
 ├── uploadPicture(file) → FormData(image)
 ├── deletePicture()
 ├── applyProfileUpdate()
 ├── auth_user sync (profileAuthSync)
 └── publish/subscribe profile sync events
        │
        ▼
ProfileRepository → profileService → api.js
```

| Layer | Responsibility |
|---|---|
| `ProfilePage` | Composes summary, picture uploader, contact form, and security link |
| `ProfilePictureUploader` | Avatar display, file selection, preview, validation hints, upload/cancel/remove controls |
| `useProfileController` | Picture-specific loading/error/success state; orchestrates upload/remove and sync |
| `ProfileRepository` | Normalizes `data.user` from upload/delete envelopes to `NormalizedProfileUser` |
| `profileService` | `uploadProfilePicture(formData)`, `deleteProfilePicture()` |
| `api.js` | Shared HTTP client; preserves multipart `FormData` without forcing JSON `Content-Type` |

---

## 5. Backend API Contract Used

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/profile/picture` | Upload or replace current user profile picture |
| `DELETE` | `/api/profile/picture` | Remove current user profile picture |

**Upload request**

- `Content-Type`: multipart form data (set by browser; not manually overridden)
- Field name: `image`
- Accepted types: `jpg`, `jpeg`, `png`, `webp`
- Max size: **2048 KB** (backend config)

**Successful response shape**

```json
{
  "success": true,
  "message": "Profile picture uploaded successfully.",
  "data": {
    "user": {
      "id": "...",
      "name": "...",
      "email": "...",
      "profile_picture_url": "https://...",
      "profile_version": 5
    }
  }
}
```

**Validation behavior**

- Backend remains the source of truth for file validation.
- `422` responses return structured `errors.image` messages displayed in the uploader.
- Delete is idempotent when no picture exists (backend M3 behavior).

---

## 6. UI Behavior

| Behavior | Description |
|---|---|
| **Current avatar** | Shows `profile.profilePictureUrl` or initials fallback |
| **Preview** | Valid selected file renders a blob preview before upload |
| **Cancel** | Clears selected file and revokes preview object URL |
| **Upload** | Explicit button click; sends `FormData` with `image` only after user confirmation |
| **Remove** | Calls delete API; button hidden when no current picture |
| **Validation hints** | JPG/PNG/WebP; maximum 2 MB |
| **Disabled/loading states** | Upload, remove, and file selection disabled while a picture request is in progress |

Accessible labels are used for file selection (`Select profile picture`), upload (`Upload picture`), cancel (`Cancel selection`), and remove (`Remove picture`) so RTL tests can query controls reliably.

---

## 7. State Synchronization

After successful upload or remove:

1. **Profile state** — `useProfileController` updates in-memory profile via `applyProfileUpdate()`.
2. **`auth_user`** — `syncAuthUserFromProfile()` merges `profile_picture_url` and `profile_version` into local storage.
3. **Header avatar** — `useAuthController` reflects `currentUser.profile_picture_url` in `ProfileSection`.
4. **Cross-tab sync** — `publishProfileUpdated()` reuses M9 `profileSyncEvents` (CustomEvent, BroadcastChannel, localStorage fallback with dedupe).

Profile picture operations are **online-only**. No offline queue was added in M10.

---

## 8. Security Considerations

- **No direct `fetch`** — all requests go through `profileService` → `api.js`.
- **Backend is authoritative** — frontend validation is UX assistance only.
- **No offline upload queue** — picture changes require an active session and network.
- **No user-controlled paths** — only multipart file upload via backend-managed storage.
- **No secrets/tokens in UI** — picture responses expose only public profile fields.
- **No 2FA disable UI** — sensitive security flows remain deferred to M11.

---

## 9. Test Coverage

| Area | Tests |
|---|---|
| `profileValidation` | Valid JPG/PNG/WebP, invalid MIME, oversized file, missing file, `formatFileSize` |
| `ProfileRepository` | `uploadProfilePicture()` and `deleteProfilePicture()` normalize `data.user` |
| `ProfilePage` | Picture section render, preview, invalid/oversized blocking, cancel, FormData upload, auth sync, remove, backend `422` image errors |
| `ProfileSection` | Header avatar uses `profile_picture_url` when present |
| Regression | M9 contact update, conflict handling, profile sync dedupe, auth header sync, route guard |

---

## 10. Files Created / Updated

**Created**

- `frontend/src/feature/profile/components/ProfilePictureUploader.jsx`
- `frontend/src/feature/profile/utils/profileValidation.test.js`
- `backend/docs/profile/m10-frontend-profile-picture-ui.md`

**Updated**

- `frontend/src/feature/profile/utils/profileValidation.js`
- `frontend/src/feature/profile/repositories/ProfileRepository.js`
- `frontend/src/feature/profile/controllers/useProfileController.js`
- `frontend/src/feature/profile/views/ProfilePage.jsx`
- `frontend/src/layout/MainLayout/Header/ProfileSection/index.jsx`
- `frontend/src/feature/profile/views/ProfilePage.test.jsx`
- `frontend/src/feature/profile/repositories/ProfileRepository.test.js`
- `frontend/src/layout/MainLayout/Header/ProfileSection/ProfileSection.test.jsx`
- `frontend/documentation.md`
- `backend/documentation.md`

---

## 11. Passing Criteria

- `/account/profile` shows a **Profile Picture** section between summary and contact form.
- Current picture or initials are visible; valid files preview before upload.
- Invalid type and oversized files are blocked in the UI.
- Upload sends `FormData` with field `image` to `POST /api/profile/picture`.
- Successful upload/remove updates profile page avatar, summary avatar, `auth_user`, header avatar, and cross-tab subscribers.
- Backend `422` image validation errors display clearly.
- M9 phone/address update and conflict behavior remain unchanged.
- Security Settings and logout behavior remain unchanged.
- Focused frontend tests pass.

---

## 12. Next Milestones

| Milestone | Focus |
|---|---|
| **M11.1** | Change password dialog |
| **M11.2** | Change email dialog |
| **M11.3** | 2FA reconfiguration dialog |
| **M12** | Offline profile queue |
| **M13** | Profile blockchain proof UI |

---

## 13. Completion Statement

Profile Module **M10 — Frontend Profile Picture UI** is complete. The React frontend provides upload, preview, cancel, and remove flows for profile pictures on `/account/profile`, synchronizes picture state with `auth_user` and the header avatar, and reuses existing cross-tab profile sync infrastructure without backend changes.
