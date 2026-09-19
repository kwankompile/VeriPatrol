# Profile Module M3 — Backend Profile Picture Upload

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M3  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M2 — Backend Profile Read and Non-Sensitive Update API](m2-profile-backend-read-update-api.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone implements **secure backend profile picture upload, replacement, and deletion** for the authenticated user's own profile. All initialized roles (Admin, Security Operator, Guard) may use these endpoints. M3 is **backend-only** — no frontend profile UI or `/account/profile` route.

---

## 2. Scope

| Item | Status |
|---|---|
| `POST /api/profile/picture` | **Implemented** |
| `DELETE /api/profile/picture` | **Implemented** |
| `UploadProfilePictureRequest` | **Implemented** |
| `ProfilePictureService` | **Implemented** |
| `ProfilePictureUrlResolver` | **Implemented** |
| `ProfileResource` public URL resolution | **Implemented** |
| `UserResource` public URL resolution (auth/me, login payloads) | **Implemented** |
| Audit events `profile_picture_uploaded`, `profile_picture_removed` | **Implemented** |
| Feature tests (`ProfilePictureTest`) | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| Frontend `feature/profile` | M8 |
| Route `/account/profile` | M8 |
| Profile picture UI uploader | M10 |
| Password/email/2FA profile flows | M5–M7, M11 |
| PWA profile offline queue | M12 |
| Blockchain profile anchoring | M13 |
| `last_security_changed_at` middleware wiring | M4+ |

---

## 4. Endpoints Added

| Method | URI | Middleware | Route name |
|---|---|---|---|
| `POST` | `/api/profile/picture` | `auth:api`, `active.user` | `profile.picture.upload` |
| `DELETE` | `/api/profile/picture` | `auth:api`, `active.user` | `profile.picture.delete` |

Routes are self-scoped (no user ID parameter) and outside the `admin` middleware group.

---

## 5. Request and Response Contracts

### `POST /api/profile/picture`

**Content-Type:** `multipart/form-data`  
**Field:** `image` (required file)

**200 OK:**

```json
{
  "success": true,
  "message": "Profile picture uploaded successfully.",
  "data": {
    "user": {}
  }
}
```

### `DELETE /api/profile/picture`

**200 OK:**

```json
{
  "success": true,
  "message": "Profile picture removed successfully.",
  "data": {
    "user": {}
  }
}
```

`data.user` uses `ProfileResource`. Managed storage paths are exposed as public disk URLs, not absolute filesystem paths.

**422** — invalid MIME, spoofed content, oversized file, or missing `image`.  
**401** — unauthenticated.  
**403** — blocked by `active.user`.

---

## 6. Validation Rules (`UploadProfilePictureRequest`)

| Rule | Value |
|---|---|
| `image` | `required`, `file`, `image`, `mimes` from config, `max` from config |

Defaults from `config/profile.php`:

| Setting | Default |
|---|---|
| `allowed_mimes` | `jpg`, `jpeg`, `png`, `webp` |
| `max_size_kb` | `2048` |

The `image` rule uses server-side content inspection (`getimagesize`); extension alone is not trusted.

---

## 7. Storage Strategy

| Aspect | Implementation |
|---|---|
| Disk | `config('profile.profile_picture.disk')` (default `public`) |
| Directory | `config('profile.profile_picture.directory')` (default `profile-pictures`) |
| DB value | Disk-relative path, e.g. `profile-pictures/{user-id}/{uuid}.jpg` |
| Filename | Server-generated UUID + safe extension from MIME |
| API exposure | `ProfilePictureUrlResolver::resolvePublicUrl()` → `Storage::disk()->url()` |
| Legacy URLs | `http://`, `https://`, or `/` prefixes preserved unchanged |
| Replacement | Old **managed** file deleted after successful upload |
| Deletion | Managed files deleted only when path is under configured directory (no `..`) |

External/legacy URLs are never deleted as filesystem files.

---

## 8. Security Controls

| Control | Implementation |
|---|---|
| Self-scope only | No user ID in route; uses authenticated user |
| Fail-closed controller guard | Returns **401** if auth user is not a `User` instance |
| Server-side image validation | `image` + `mimes` + size limit |
| Safe filenames | UUID-based; original client filename not stored |
| Path traversal prevention | Rejects `..` in managed paths |
| No absolute paths in API | `ProfileResource` resolves public URLs only |
| No secret leakage | Audit metadata excludes filenames, paths, raw content |
| Version bump policy | Increments only on real upload/delete mutation |

---

## 9. Delete Behavior

| Scenario | File delete | DB `profile_picture_url` | `profile_version` | Audit |
|---|---|---|---|---|
| Managed picture exists | Yes (if in configured directory) | `null` | +1 | `profile_picture_removed` |
| No picture | No | unchanged (`null`) | unchanged | none |
| External/legacy URL | No | `null` | +1 | `profile_picture_removed` |

Delete when no picture exists returns **200** (idempotent success) without version bump.

---

## 10. Audit Events

| Event | When | Safe metadata |
|---|---|---|
| `profile_picture_uploaded` | Successful upload | `file_size`, `mime_type`, `profile_version`, `source=self_profile` |
| `profile_picture_removed` | Actual removal mutation | `profile_version`, `source=self_profile` |

---

## 11. Files Created

| File |
|---|
| `app/Http/Requests/Profile/UploadProfilePictureRequest.php` |
| `app/Services/Profile/ProfilePictureService.php` |
| `app/Support/Profile/ProfilePictureUrlResolver.php` |
| `tests/Feature/Profile/ProfilePictureTest.php` |
| `tests/Fixtures/minimal.jpg` |
| `docs/profile/m3-profile-backend-profile-picture-upload.md` |

---

## 12. Files Updated

| File | Change |
|---|---|
| `app/Http/Controllers/Api/ProfileController.php` | `uploadPicture`, `deletePicture` |
| `app/Http/Resources/ProfileResource.php` | Public URL resolution |
| `app/Http/Resources/UserResource.php` | Same `ProfilePictureUrlResolver` for managed paths |
| `app/Services/Auth/AuthAuditService.php` | Picture audit constants |
| `routes/api.php` | Picture upload/delete routes |
| `documentation.md` | API table + M3 note |
| `frontend/documentation.md` | Backend-only M3 note |

---

## 13. Testing and Verification

### Commands run

```bash
php artisan test --filter=ProfilePictureTest
php artisan test --filter=ProfileReadUpdateTest
php artisan test --filter=ProfileDataFoundationTest
php artisan test --filter=AuthAuditLogTest
php artisan test --filter=Profile
```

### Results

| Suite | Tests | Result |
|---|---|---|
| `ProfilePictureTest` | 18 | **Passed** |
| `ProfileReadUpdateTest` | 21 | **Passed** |
| `ProfileDataFoundationTest` | 11 | **Passed** |
| `AuthAuditLogTest` | 16 | **Passed** |
| `Profile` (combined) | 50 | **Passed** |

---

## 14. M3 Passing Criteria

| Criterion | Status |
|---|---|
| Upload/delete routes protected by `auth:api` + `active.user` | **Met** |
| All initialized roles can upload/delete own picture | **Met** |
| Invalid/spoofed/oversized files return **422** | **Met** |
| Server-generated filenames; no absolute paths in API | **Met** |
| Managed old files deleted on replace/remove | **Met** |
| External URLs not deleted as files | **Met** |
| `profile_version` bumps only on real mutation | **Met** |
| Idempotent delete when no picture | **Met** |
| Sanitized audit logs | **Met** |
| M2 read/update tests still pass | **Met** |
| No frontend profile UI | **Met** |

---

## 15. Deferred Work

| Area | Milestone |
|---|---|
| Frontend profile page and picture uploader | M8, M10 |
| Password/email/2FA sensitive flows | M5–M7 |
| PWA offline profile queue | M12 |
| Blockchain `user_profile` proofs | M13 |

---

## 16. Final M3 Statement

Profile Module **M3 is complete**. Authenticated users can upload and remove their own profile pictures through dedicated backend endpoints with secure storage, safe URL exposure, and sanitized auditing. Frontend profile picture UI and `/account/profile` remain deferred per the architecture plan.
