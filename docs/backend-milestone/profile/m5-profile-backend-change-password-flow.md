# Profile Module M5 — Backend Change Password Flow

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M5  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M4 — Backend Step-Up Verification Foundation](m4-profile-backend-step-up-verification-foundation.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone implements the **backend self-service password change API** for authenticated users. Changes require **current password + TOTP step-up verification**. On success, the user must sign in again — all refresh sessions are revoked, JWTs are invalidated, and the refresh cookie is cleared.

M5 is **backend-only**. The frontend change-password dialog remains deferred to **M11.1**.

---

## 2. Scope

| Item | Status |
|---|---|
| `POST /api/profile/password/change` | **Implemented** |
| `ChangePasswordRequest` | **Implemented** |
| `ProfilePasswordService` | **Implemented** |
| Step-up via `ProfileSecurityService::verifyStepUp` | **Implemented** |
| Session revocation + stale JWT invalidation | **Implemented** |
| `password_changed` audit log | **Implemented** |
| Feature tests (`ProfilePasswordChangeTest`) | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| Frontend change-password dialog | M11.1 |
| Email change | M6 |
| 2FA reconfiguration | M7 |
| Profile page / Account Settings UI | M8 |
| Profile blockchain proof (`user_profile` / `profile_password_changed`) | **M13** |
| PWA offline queue | M12 |

---

## 4. Architecture Summary

```
POST /api/profile/password/change
        │
        ▼
ChangePasswordRequest (validation)
        │
        ▼
ProfileController@changePassword
        │
        ▼
ProfilePasswordService::changePassword
 ├── ProfileSecurityService::verifyStepUp
 ├── Update password (hashed cast)
 ├── last_password_changed_at = now()
 ├── last_security_changed_at = now()
 ├── profile_version += 1
 ├── RefreshTokenService::revokeAllForUser
 └── AuthAuditService::EVENT_PASSWORD_CHANGED
        │
        ▼
Response + RefreshTokenService::forgetCookie()
```

---

## 5. Endpoint Contract

| Method | URI | Middleware | Route name |
|---|---|---|---|
| `POST` | `/api/profile/password/change` | `auth:api`, `active.user` | `profile.password.change` |

Self-scoped only — no user ID parameter.

---

## 6. Request Payload

```json
{
  "current_password": "CurrentPassword123",
  "otp": "123456",
  "password": "NewPassword12345",
  "password_confirmation": "NewPassword12345"
}
```

| Field | Rules |
|---|---|
| `current_password` | Required string |
| `otp` | Required string (6-digit TOTP) |
| `password` | Required, confirmed, min length from `auth_security.password_min_length` (default 12) |
| `password_confirmation` | Required string; must match `password` |

---

## 7. Success Response

**200 OK**

```json
{
  "success": true,
  "message": "Password changed successfully. Please sign in again.",
  "data": {
    "requires_reauthentication": true,
    "revoked_sessions_count": 1
  }
}
```

The response attaches a **forget refresh cookie** when possible. No new access token is issued.

---

## 8. Validation and Error Responses

| Condition | Status | Message / shape |
|---|---|---|
| Missing/invalid fields | **422** | `Validation failed.` + `data.errors` |
| Step-up failure (wrong password or OTP) | **422** | `Step-up verification failed.` |
| Rate-limited step-up | **429** | `Too many step-up verification attempts.` + `data.retry_after_seconds` |
| Unauthenticated | **401** | `Unauthenticated.` |

Wrong password and wrong OTP return the **same** step-up failure message.

---

## 9. Security Behavior

| Control | Implementation |
|---|---|
| Step-up required | Current password + TOTP via M4 service |
| No factor leak | Generic step-up failure message |
| Password hashing | Laravel `hashed` cast on `User` |
| Self-scope only | Authenticated user only; no user ID route |
| Secret exclusion | No password/OTP/tokens in response or audit metadata |
| Rate limiting | M4 `ProfileStepUpRateLimiter` |

---

## 10. Session Invalidation Behavior

On successful change:

1. `last_password_changed_at` and `last_security_changed_at` are set to `now()`.
2. `profile_version` increments by exactly **1**.
3. All refresh sessions for the user are revoked.
4. `EnsureUserIsActive` rejects existing JWTs (`iat <= max(password, security)` timestamps).
5. Refresh cookie is cleared on the response.

The frontend must **clear auth state and redirect to `/login`** after success — do not reuse the current token (same-second JWT edge case documented in M4).

---

## 11. Audit Behavior

Event: `password_changed` (`AuthAuditService::EVENT_PASSWORD_CHANGED`)

| Metadata field | Value |
|---|---|
| `source` | `self_profile` |
| `target_user_id` | Authenticated user UUID |
| `changed_by_user_id` | Same user UUID |
| `profile_version` | Post-change version |
| `revoked_count` | Revoked refresh session count |

Passwords, OTP, and tokens are never logged.

---

## 12. Blockchain Behavior — Deferred to M13

Profile blockchain proof creation is **not implemented in M5**.

**Reason:** `BlockchainHashService` and `BlockchainRecordService` currently support ANPR entities only. The `blockchain_records` unique constraint `(entity_type, entity_id, proof_type, canonical_version, environment)` requires schema and service extensions to support repeated `user_profile` / `profile_password_changed` events across multiple password changes.

M13 will add `ProfileBlockchainService` and `user_profile` proof integration per the Profile Module design.

---

## 13. Files Created / Updated

| File | Change |
|---|---|
| `app/Http/Requests/Profile/ChangePasswordRequest.php` | **Created** |
| `app/Services/Profile/ProfilePasswordService.php` | **Created** |
| `app/Http/Controllers/Api/ProfileController.php` | `changePassword()` |
| `routes/api.php` | Password change route |
| `tests/Feature/Profile/ProfilePasswordChangeTest.php` | **Created** |
| `docs/profile/m5-profile-backend-change-password-flow.md` | **Created** |
| `documentation.md` | API table + M5 note |
| `frontend/documentation.md` | Backend-only M5 note |

---

## 14. Test Coverage

`ProfilePasswordChangeTest` — **18 tests**

| Area | Covered |
|---|---|
| Auth / validation | 401, 422 missing fields, 422 weak password |
| Step-up failures | Wrong password, wrong OTP, same message |
| Success path | Password updated, timestamps, version bump |
| Login flows | Old password fails; new password + OTP works |
| Sessions | Refresh revoked; old JWT blocked |
| Audit | `password_changed` with `self_profile`; no secrets |
| Roles | Admin, Security Operator, Guard |
| Self-scope | Other users unchanged |
| Cookie | Refresh cookie cleared |
| Rate limit | 429 after repeated failures |

### Commands run

```bash
php artisan test --filter=ProfilePasswordChangeTest
php artisan test --filter=ProfileSecurityServiceTest
php artisan test --filter=ProfileStepUpVerificationTest
php artisan test --filter=ProfileReadUpdateTest
php artisan test --filter=ProfilePictureTest
php artisan test --filter=AuthSecuritySettingsTest
php artisan test --filter=AuthSessionMonitoringTest
php artisan test --filter=AuthAuditLogTest
php artisan test --filter=Profile
php artisan test --filter=Auth
```

### Results

| Suite | Tests | Result |
|---|---|---|
| `ProfilePasswordChangeTest` | 18 | **Passed** |
| `ProfileSecurityServiceTest` | 18 | **Passed** |
| `ProfileStepUpVerificationTest` | 9 | **Passed** |
| `ProfileReadUpdateTest` | 21 | **Passed** |
| `ProfilePictureTest` | 18 | **Passed** |
| `AuthSecuritySettingsTest` | 18 | **Passed** |
| `AuthSessionMonitoringTest` | 10 | **Passed** |
| `AuthAuditLogTest` | 16 | **Passed** |
| `Profile` (combined) | 95 | **Passed** |
| `Auth` (combined) | 184 | **Passed** |

---

## 15. Known Limitations

| Limitation | Notes |
|---|---|
| No blockchain proof in M5 | Deferred to M13 |
| No frontend UI | M11.1 must call this endpoint and handle re-auth |
| Same-second JWT edge | New login should occur after success; clear auth immediately |
| Failed step-up audit | `password_change_failed` audit events deferred to M14 hardening |
| Storage in single transaction | Password + revocation are atomic; no partial success state |

---

## 16. Final M5 Statement

Profile Module **M5 is complete**. Authenticated users can change their own password through a secure step-up-protected backend endpoint. Sessions are revoked, JWTs are invalidated, audit logs are written, and the client is instructed to re-authenticate. Frontend password UI and blockchain profile proofs remain deferred per the architecture plan.
