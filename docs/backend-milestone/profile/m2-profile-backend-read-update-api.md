# Profile Module M2 — Backend Profile Read and Non-Sensitive Update API

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M2  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M1 — Backend Data Foundation](m1-profile-backend-data-foundation.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone implements the **authenticated self-service profile API** for reading and updating non-sensitive contact fields (`phone`, `address`). All fully initialized roles — Admin, Security Operator, and Guard — may access their **own** profile only.

M2 is **backend-only**. No frontend profile UI, routes, or navigation changes were made.

---

## 2. Scope

| Item | Status |
|---|---|
| `GET /api/profile` | **Implemented** |
| `PATCH /api/profile` | **Implemented** |
| `ProfileController` | **Implemented** |
| `ProfileResource` | **Implemented** |
| `UpdateProfileRequest` | **Implemented** |
| `ProfileService` | **Implemented** |
| Optimistic `profile_version` concurrency | **Implemented** |
| Audit events `profile_updated` / `profile_update_failed` | **Implemented** |
| Feature tests | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| Frontend `feature/profile` | M8 |
| Route `/account/profile` | M8 |
| Account Settings menu navigation | M8 |
| Profile picture upload/delete | M3, M10 |
| Password/email/2FA self-service flows | M5–M7, M11 |
| `last_security_changed_at` middleware wiring | M4+ |
| Profile change token issuance/confirmation | M6–M7 |
| PWA profile offline queue | M12 |
| Blockchain profile anchoring | M13 |

---

## 4. Implemented API Endpoints

| Method | URI | Middleware | Purpose |
|---|---|---|---|
| `GET` | `/api/profile` | `auth:api`, `active.user` | Read own profile |
| `PATCH` | `/api/profile` | `auth:api`, `active.user` | Update `phone` / `address` |

Routes are **not** inside the `admin` middleware group.

---

## 5. Request and Response Contracts

### `GET /api/profile` — 200 OK

```json
{
  "success": true,
  "message": "Profile retrieved successfully.",
  "data": {
    "user": {}
  }
}
```

`data.user` is a `ProfileResource` payload.

### `PATCH /api/profile` — 200 OK

```json
{
  "success": true,
  "message": "Profile updated successfully.",
  "data": {
    "user": {}
  }
}
```

**Allowed body fields:**

```json
{
  "phone": "0123456789",
  "address": "Kuala Lumpur",
  "profile_version": 4
}
```

At least one of `phone` or `address` must be present. `profile_version` is optional for optimistic concurrency.

### `PATCH /api/profile` — 409 Conflict

Returned when submitted `profile_version` does not match the current database value.

```json
{
  "success": false,
  "message": "Profile has been modified. Please refresh and try again.",
  "data": {
    "code": "profile_version_conflict",
    "current_profile_version": 5,
    "user": {}
  }
}
```

### `PATCH /api/profile` — 422 Unprocessable Entity

Validation failures use the project envelope:

```json
{
  "success": false,
  "message": "Validation failed.",
  "data": {
    "errors": {}
  }
}
```

### `GET` / `PATCH` — 401 / 403

- **401** — unauthenticated
- **403** — blocked by `active.user` (setup incomplete, 2FA incomplete, soft-deleted, stale JWT vs `last_password_changed_at`)

---

## 6. Validation Rules (`UpdateProfileRequest`)

| Field | Rules |
|---|---|
| `phone` | `sometimes`, `nullable`, `string`, `max:30` |
| `address` | `sometimes`, `nullable`, `string`, `max:1000` |
| `profile_version` | `sometimes`, `integer`, `min:0` |

**Prohibited (422 if present):** Any key other than `phone`, `address`, and `profile_version` is rejected via an explicit allow-list in `UpdateProfileRequest` (for example `email`, `password`, `role_id`, and other sensitive/admin fields).

A payload with **only** `profile_version` (no `phone` or `address`) returns **422**.

### No-op updates

If submitted `phone` / `address` values match the current database values, the API returns **200** with the current profile but does **not** increment `profile_version` and does **not** write a `profile_updated` audit log. This supports future offline-queue conflict handling by avoiding artificial version bumps on unchanged data.

---

## 7. `ProfileResource` Fields

Exposed: `id`, `name`, `email`, `phone`, `address`, `profile_picture_url`, `profile_version`, `two_factor_enabled`, `two_factor_confirmed_at`, `email_verified_at`, `last_password_changed_at`, `last_security_changed_at`, `role` (`id`, `name` only), `created_at`, `updated_at`.

**Not exposed:** `password`, `two_factor_secret`, `remember_token`, refresh/token hashes, profile change tokens, `deleted_at`.

`UserResource` is **not** reused for self-service profile responses.

---

## 8. Security Controls

| Control | Implementation |
|---|---|
| Self-scope only | Controller uses `$request->user('api')`; no user ID parameter |
| Middleware | `auth:api` + `active.user` on route group |
| Field allow-list | `UpdateProfileRequest` allow-list (`phone`, `address`, `profile_version` only) + `ProfileService` dirty-field detection |
| Prohibited fields | Unknown keys rejected with **422** |
| Fail-closed controller guard | `ProfileController@show` and `@update` return **401** if authenticated user is not a `User` instance |
| No 2FA disable | Not exposed or writable |
| Optimistic concurrency | Optional `profile_version` check with **409** |
| No-op detection | Matching values do not bump `profile_version` or write audit |
| Row lock | `lockForUpdate()` inside transaction |
| Audit sanitization | Field names and version only; no raw phone/address in metadata |

---

## 9. Audit Logging

Constants added to `AuthAuditService`:

| Event | Status | When |
|---|---|---|
| `profile_updated` | `success` | Successful phone/address update |
| `profile_update_failed` | `failure` | Stale `profile_version` conflict |

**Success metadata example:**

```json
{
  "changed_fields": ["phone", "address"],
  "profile_version": 5,
  "source": "self_profile"
}
```

**Failure metadata example:**

```json
{
  "reason": "profile_version_conflict",
  "submitted_profile_version": 4,
  "current_profile_version": 5,
  "source": "self_profile"
}
```

Failure audit is recorded **outside** the rolled-back transaction.

---

## 10. Optimistic Concurrency

1. Client may send current `profile_version`.
2. If omitted, update proceeds without version check.
3. If supplied and mismatched, no mutation occurs; **409** returned with current profile snapshot.
4. On success with at least one **changed** field, `profile_version` increments by 1.
5. If all submitted values match current data, profile is returned unchanged (no version bump, no audit).

---

## 11. Files Created

| File |
|---|
| `app/Http/Controllers/Api/ProfileController.php` |
| `app/Http/Resources/ProfileResource.php` |
| `app/Http/Requests/Profile/UpdateProfileRequest.php` |
| `app/Services/Profile/ProfileService.php` |
| `app/Support/Profile/ProfileVersionConflictException.php` |
| `tests/Feature/Profile/ProfileReadUpdateTest.php` |
| `docs/profile/m2-profile-backend-read-update-api.md` |

---

## 12. Files Updated

| File | Change |
|---|---|
| `routes/api.php` | `GET` / `PATCH` `/api/profile` |
| `app/Services/Auth/AuthAuditService.php` | `EVENT_PROFILE_UPDATED`, `EVENT_PROFILE_UPDATE_FAILED` |
| `documentation.md` | API table + M2 note |
| `frontend/documentation.md` | Brief M2 backend-only note |

---

## 13. Testing and Verification

### Commands run

```bash
php artisan test --filter=ProfileReadUpdateTest
php artisan test --filter=ProfileDataFoundationTest
php artisan test --filter=AuthRouteGuardHardeningTest
php artisan test --filter=AuthSecuritySettingsTest
php artisan test --filter=AuthAuditLogTest
```

### Results

| Suite | Tests | Result |
|---|---|---|
| `ProfileReadUpdateTest` | 21 | **Passed** |
| `ProfileDataFoundationTest` | 11 | **Passed** |
| `AuthRouteGuardHardeningTest` | 25 | **Passed** |
| `AuthSecuritySettingsTest` | 18 | **Passed** |
| `AuthAuditLogTest` | 16 | **Passed** |

---

## 14. M2 Passing Criteria

| Criterion | Status |
|---|---|
| `GET /api/profile` protected by `auth:api` + `active.user` | **Met** |
| All initialized roles can read own profile | **Met** |
| Unauthenticated → 401 | **Met** |
| Setup/2FA incomplete → 403 | **Met** |
| `PATCH` updates only `phone`/`address` | **Met** |
| Prohibited fields → 422, unchanged in DB | **Met** |
| `profile_version` increments on success | **Met** |
| Stale `profile_version` → 409 | **Met** |
| Sanitized audit on success | **Met** |
| No secrets in `ProfileResource` | **Met** |
| No frontend profile UI | **Met** |
| M1 tests still pass | **Met** |

---

## 15. Deferred Work for M3+

| Area | Milestone |
|---|---|
| Profile picture upload/delete | M3 |
| Step-up verification foundation | M4 |
| Password/email/2FA profile endpoints | M5–M7 |
| Frontend profile page | M8 |
| PWA offline queue | M12 |
| Blockchain `user_profile` proofs | M13 |

---

## 16. Final M2 Statement

Profile Module **M2 is complete**. Authenticated users can read and update their own non-sensitive profile contact fields through dedicated profile endpoints. Sensitive identity changes, profile picture upload, frontend UI, and session-security middleware extensions remain deferred per the frozen architecture plan.

**No frontend profile feature or `/account/profile` route was implemented in M2.**
