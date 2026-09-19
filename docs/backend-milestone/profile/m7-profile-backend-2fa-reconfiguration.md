# Profile Module M7 — Backend 2FA Reconfiguration Without Disablement

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M7  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M6 — Backend Change Email Flow](m6-profile-backend-change-email-flow.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone implements **backend-only self-service 2FA reconfiguration** for authenticated users. Users may replace their authenticator app setup only after proving control of the current account with **current password** and **current TOTP code**. The new TOTP secret does not replace the old secret until the user verifies a code generated from the new authenticator setup.

**2FA remains mandatory.** No endpoint, service method, or documentation path allows users to disable 2FA.

M7 is **backend-only**. Frontend reconfiguration UI remains deferred to **M11.3**.

---

## 2. Scope

| Item | Status |
|---|---|
| `POST /api/profile/2fa/reconfigure/start` | **Implemented** |
| `POST /api/profile/2fa/reconfigure/verify` | **Implemented** |
| `StartTwoFactorReconfigureRequest` / `VerifyTwoFactorReconfigureRequest` | **Implemented** |
| `ProfileTwoFactorReconfigureService` | **Implemented** |
| Profile change token lifecycle (`two_factor_reconfigure`) | **Implemented** |
| Session revocation + stale JWT invalidation on verify | **Implemented** |
| Audit events `two_factor_reconfigure_started`, `two_factor_reconfigured`, `two_factor_reconfigure_failed` | **Implemented** |
| Verify OTP rate limiting (scoped cache limiter) | **Implemented** |
| Feature tests (`ProfileTwoFactorReconfigureTest`) | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| Frontend 2FA reconfiguration dialog | M11.3 |
| Profile page / Account Settings UI | M8 |
| Profile blockchain proof (`user_profile` / `profile_2fa_reconfigured`) | **M13** |
| User 2FA disablement | **Never** (platform policy) |
| PWA offline queue | M12 |

---

## 4. Architecture Summary

```
POST /api/profile/2fa/reconfigure/start
        │
        ▼
StartTwoFactorReconfigureRequest
        │
        ▼
ProfileTwoFactorReconfigureService::startReconfigure
 ├── ProfileSecurityService::verifyStepUp (password + current TOTP)
 ├── Invalidate prior active two_factor_reconfigure tokens
 ├── TwoFactorService::generateSecret (temporary pending secret)
 ├── ProfileSecurityService::createChangeToken (TYPE_TWO_FACTOR_RECONFIGURE)
 └── Audit: two_factor_reconfigure_started
        │
        ▼
Response: two_factor_reconfigure_token, manual_key, otpauth_uri, expires_in
(old authenticator remains valid; two_factor_enabled stays true)

POST /api/profile/2fa/reconfigure/verify
        │
        ▼
VerifyTwoFactorReconfigureRequest
        │
        ▼
ProfileTwoFactorReconfigureService::verifyReconfigure
 ├── Scoped OTP rate limit check
 ├── Validate token (hash, type, user, expiry, used) under row lock
 ├── Verify OTP against pending new secret (token NOT consumed on failure)
 ├── Atomically consume token + replace encrypted two_factor_secret
 ├── two_factor_enabled = true, two_factor_confirmed_at = now()
 ├── last_security_changed_at + profile_version += 1
 ├── RefreshTokenService::revokeAllForUser
 └── Audit: two_factor_reconfigured
        │
        ▼
Response + forget refresh cookie + requires_reauthentication
```

---

## 5. Endpoint Contract

| Method | URI | Middleware | Route name |
|---|---|---|---|
| `POST` | `/api/profile/2fa/reconfigure/start` | `auth:api`, `active.user` | `profile.2fa.reconfigure.start` |
| `POST` | `/api/profile/2fa/reconfigure/verify` | `auth:api`, `active.user` | `profile.2fa.reconfigure.verify` |

Both endpoints are self-scoped (no user ID parameter).

---

## 6. Request Payloads

### Start

```json
{
  "current_password": "current-password",
  "otp": "123456"
}
```

### Verify

```json
{
  "two_factor_reconfigure_token": "plain-short-lived-token",
  "otp": "654321"
}
```

The plain reconfiguration token is returned in JSON **only** on successful start. It is never stored in the database or audit logs.

---

## 7. Success Responses

### Start — **200 OK**

```json
{
  "success": true,
  "message": "Two-factor reconfiguration started.",
  "data": {
    "two_factor_reconfigure_token": "plain-short-lived-token",
    "manual_key": "NEWBASE32SECRET",
    "otpauth_uri": "otpauth://totp/...",
    "expires_in": 600
  }
}
```

### Verify — **200 OK**

```json
{
  "success": true,
  "message": "Two-factor authentication reconfigured successfully. Please sign in again.",
  "data": {
    "requires_reauthentication": true,
    "revoked_sessions_count": 1
  }
}
```

Verify clears the refresh cookie and does not issue a new access token.

---

## 8. Validation and Error Responses

| Condition | Status | Message |
|---|---|---|
| Missing/invalid fields | **422** | `Validation failed.` + `data.errors` |
| Step-up failure (start) | **422** | `Step-up verification failed.` |
| Step-up rate limit (start) | **429** | `Too many step-up verification attempts.` |
| Start failure audit | — | `two_factor_reconfigure_failed` with `step_up_failed`, `step_up_rate_limited`, or `missing_valid_2fa_setup` |
| User without valid 2FA setup (start) | **422** | `Step-up verification failed.` |
| Invalid/expired/used/wrong-user/wrong-type token (verify) | **422** | `Invalid profile change token.` |
| Invalid new OTP (verify) | **422** | `Two-factor reconfiguration verification failed.` |
| Verify OTP rate limit | **429** | `Too many step-up verification attempts.` |
| Unauthenticated | **401** | `Unauthenticated.` |

Wrong password and wrong current OTP share the same step-up failure message on start.

---

## 9. Security Behavior

| Control | Implementation |
|---|---|
| Step-up required on start | Password + current TOTP via M4 `ProfileSecurityService` |
| Old secret preserved until verify | `users.two_factor_secret` unchanged during start |
| Mandatory 2FA preserved | `two_factor_enabled` remains `true`; no disable path |
| Pending secret encrypted at rest | `pending_payload.pending_secret` via `encrypted:array` cast |
| Token hash only in DB | Plain token never persisted |
| Self-scope only | Token must belong to authenticated user |
| Prior tokens invalidated | Active `two_factor_reconfigure` tokens marked used on new start (transaction + user row lock) |
| Single active token invariant | Start runs in a DB transaction with user row lock before invalidate/create |
| Post-lock security re-check | After step-up, locked user row must still match captured 2FA/security snapshot |
| Verify sibling cleanup | Successful verify marks any remaining active reconfigure tokens as used |
| Invalid new OTP does not consume token | User may retry until expiry (subject to rate limit) |
| Race-safe verify | DB transaction + user row lock before token lock/update; up to 3 deadlock retries |
| Consistent lock order | Start and verify both acquire user row lock before profile change token updates |
| Secret exclusion | No password/OTP/secrets/tokens in audit metadata |
| Token type from constants only | Never accept token type from request input |

---

## 10. Token Lifecycle

| Stage | Behavior |
|---|---|
| Create | `ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE`, TTL from `profile.change_tokens.ttl_minutes` |
| Payload | Encrypted `pending_secret`, `requested_at` |
| Replace | Previous active tokens for user marked `used_at` on new start (inside user-locked transaction) |
| Verify sibling cleanup | Any other active reconfigure tokens marked used after successful verify |
| Verify | Atomic consume via conditional update inside DB transaction after new OTP validation |
| Invalid new OTP | Token remains active; scoped rate limiter increments |
| Reuse | Rejected with `InvalidProfileChangeTokenException` |

---

## 11. Session Invalidation Behavior

On **verify** success only:

1. `two_factor_secret` replaced with encrypted new secret
2. `two_factor_enabled = true` (unchanged semantically)
3. `two_factor_confirmed_at = now()`
4. `last_security_changed_at = now()`
5. `profile_version += 1`
6. All refresh sessions revoked
7. Refresh cookie cleared
8. Existing JWTs fail `active.user` stale-token check

Start does **not** revoke sessions or invalidate JWTs.

---

## 12. Audit Behavior

| Event | When | Safe metadata |
|---|---|---|
| `two_factor_reconfigure_started` | Start success | `source`, `target_user_id`, `profile_version`, `token_expires_at` |
| `two_factor_reconfigured` | Verify success | `source`, `target_user_id`, `changed_by_user_id`, `profile_version`, `revoked_count` |
| `two_factor_reconfigure_failed` | Start/verify failure | `source`, `target_user_id`, `reason`, `profile_version` |

Start failure `reason` values include: `step_up_failed`, `step_up_rate_limited`, `missing_valid_2fa_setup`, `security_state_changed`.
Verify failure `reason` values include: `invalid_token`, `expired`, `used`, `token_user_mismatch`, `invalid_new_otp`.

Never logged: current password, OTP, old/new TOTP secrets, manual key, otpauth URI, plain token, token hash, refresh token, Authorization header.

---

## 13. Blockchain Behavior

Profile blockchain proof for `user_profile` / `profile_2fa_reconfigured` is **deferred to M13**.

No partial blockchain integration was added in M7 to avoid impacting the current ANPR-oriented blockchain service layer.

---

## 14. Files Created / Updated

### Created

| Path | Role |
|---|---|
| `app/Http/Requests/Profile/StartTwoFactorReconfigureRequest.php` | Start validation |
| `app/Http/Requests/Profile/VerifyTwoFactorReconfigureRequest.php` | Verify validation |
| `app/Services/Profile/ProfileTwoFactorReconfigureService.php` | Business rules |
| `app/Support/Profile/ProfileTwoFactorReconfigureVerificationException.php` | Generic verify OTP failure |
| `tests/Feature/Profile/ProfileTwoFactorReconfigureTest.php` | Feature coverage |
| `docs/profile/m7-profile-backend-2fa-reconfiguration.md` | This document |

### Updated

| Path | Change |
|---|---|
| `app/Http/Controllers/Api/ProfileController.php` | `startTwoFactorReconfigure`, `verifyTwoFactorReconfigure` |
| `app/Services/Auth/AuthAuditService.php` | M7 audit event constants |
| `app/Services/Profile/ProfileStepUpRateLimiter.php` | Scoped rate limiting for verify OTP |
| `routes/api.php` | M7 profile routes |
| `documentation.md` | M7 progress note and route table |

---

## 15. Test Coverage

`tests/Feature/Profile/ProfileTwoFactorReconfigureTest.php` covers:

- Authentication and validation (401/422)
- Step-up protection and rate limiting on start
- Users without valid 2FA cannot start
- Start success: token fields, encrypted pending secret, old secret unchanged, audit safety
- Verify failures: invalid/expired/used/wrong-type/wrong-user tokens, invalid new OTP, OTP rate limit
- Verify success: secret replacement, metadata updates, session revocation, cookie clear, JWT invalidation, old/new authenticator login behavior, audit safety
- No user disable 2FA route

---

## 16. Commands Run

```bash
php artisan test --filter=ProfileTwoFactorReconfigureTest
php artisan test --filter=ProfileSecurityServiceTest
php artisan test --filter=ProfilePasswordChangeTest
php artisan test --filter=ProfileEmailChangeTest
php artisan test --filter=Profile
php artisan test --filter=Auth
```

---

## 17. Known Limitations

| Limitation | Notes |
|---|---|
| No frontend UI | Deferred to M11.3 |
| No blockchain profile proof | Deferred to M13 |
| Manual key exposed in start JSON | Required for authenticator enrollment; short-lived token bounds exposure window |
| Admin 2FA reset remains separate | Admin `POST /api/auth/2fa/reset/{user}` is not a user self-service disable path |

---

## 18. M7 Completion Statement

Profile Module **M7** is complete on the backend. Authenticated users can start and verify 2FA reconfiguration through self-scoped API endpoints with step-up verification, encrypted pending secrets, race-safe token consumption, session revocation, and sanitized audit logging. **2FA disablement is not implemented.** Frontend reconfiguration UI remains deferred to **M11.3**; profile blockchain proof remains deferred to **M13**.
