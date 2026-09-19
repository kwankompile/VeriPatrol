# Profile Module M6 — Backend Change Email Flow

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M6  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M5 — Backend Change Password Flow](m5-profile-backend-change-password-flow.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone implements a **secure two-phase backend change-email flow** for authenticated users. Phase one verifies step-up credentials and sends a confirmation token to the requested new email. Phase two confirms the token, updates the account email, and forces re-authentication.

M6 is **backend-only**. The frontend change-email dialog remains deferred to **M11.2**.

---

## 2. Scope

| Item | Status |
|---|---|
| `POST /api/profile/email/start` | **Implemented** |
| `POST /api/profile/email/confirm` | **Implemented** |
| `StartEmailChangeRequest` / `ConfirmEmailChangeRequest` | **Implemented** |
| `ProfileEmailService` | **Implemented** |
| `ProfileEmailChangeVerificationMail` | **Implemented** |
| Profile change token lifecycle (`email_change`) | **Implemented** |
| Session revocation + stale JWT invalidation on confirm | **Implemented** |
| Audit events `email_change_started`, `email_changed`, `email_change_failed` | **Implemented** |
| Feature tests (`ProfileEmailChangeTest`) | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| Frontend change-email dialog | M11.2 |
| 2FA reconfiguration | M7 |
| Profile page / Account Settings UI | M8 |
| Profile blockchain proof (`user_profile` / `profile_email_changed`) | **M13** |
| PWA offline queue | M12 |

---

## 4. Architecture Summary

```
POST /api/profile/email/start
        │
        ▼
StartEmailChangeRequest
        │
        ▼
ProfileEmailService::startEmailChange
 ├── ProfileSecurityService::verifyStepUp
 ├── Invalidate prior active email_change tokens
 ├── ProfileSecurityService::createChangeToken (TYPE_EMAIL_CHANGE)
 ├── Mail verification token to pending email
 └── Audit: email_change_started

POST /api/profile/email/confirm
        │
        ▼
ConfirmEmailChangeRequest
        │
        ▼
ProfileEmailService::confirmEmailChange
 ├── Validate token ownership + consume atomically
 ├── Update email + email_verified_at
 ├── last_security_changed_at + profile_version += 1
 ├── RefreshTokenService::revokeAllForUser
 └── Audit: email_changed
        │
        ▼
Response + forget refresh cookie + requires_reauthentication
```

---

## 5. Endpoint Contract

| Method | URI | Middleware | Route name |
|---|---|---|---|
| `POST` | `/api/profile/email/start` | `auth:api`, `active.user` | `profile.email.start` |
| `POST` | `/api/profile/email/confirm` | `auth:api`, `active.user` | `profile.email.confirm` |

Both endpoints are self-scoped (no user ID parameter).

---

## 6. Request Payloads

### Start

```json
{
  "current_password": "CurrentPassword123",
  "otp": "123456",
  "new_email": "new.email@example.com"
}
```

`new_email` is trimmed and lowercased before validation.

### Confirm

```json
{
  "token": "plain-token-from-email"
}
```

The plain token is **never** returned in JSON responses.

---

## 7. Success Responses

### Start — **200 OK**

```json
{
  "success": true,
  "message": "Email change verification sent.",
  "data": {
    "expires_in": 600,
    "masked_email": "n***@example.com"
  }
}
```

### Confirm — **200 OK**

```json
{
  "success": true,
  "message": "Email changed successfully. Please sign in again.",
  "data": {
    "requires_reauthentication": true,
    "revoked_sessions_count": 1
  }
}
```

Confirm clears the refresh cookie and does not issue a new access token.

---

## 8. Validation and Error Responses

| Condition | Status | Message |
|---|---|---|
| Missing/invalid fields | **422** | `Validation failed.` + `data.errors` |
| Same email as current | **422** | Field error on `new_email` |
| Email already taken | **422** | Field error on `new_email` |
| Step-up failure | **422** | `Step-up verification failed.` |
| Step-up rate limit | **429** | `Too many step-up verification attempts.` |
| Invalid/expired/used/wrong-user token | **422** | `Invalid profile change token.` |
| Unauthenticated | **401** | `Unauthenticated.` |

Wrong password and wrong OTP share the same step-up failure message.

---

## 9. Security Behavior

| Control | Implementation |
|---|---|
| Step-up required on start | Password + TOTP via M4 service |
| No factor leak | Generic step-up failure message |
| Email unchanged until confirm | Pending email only in encrypted token payload |
| Token hash only in DB | Plain token sent by email only |
| Self-scope only | Token must belong to authenticated user |
| Prior tokens invalidated | Active `email_change` tokens marked used on new start |
| Secret exclusion | No raw email/token/password/OTP in audit metadata; top-level audit `email` column suppressed for profile email events |
| Email hashes in audit | SHA-256 hashes only (`target_email_hash`, `old_email_hash`, `new_email_hash`) |

---

## 10. Token Lifecycle

| Stage | Behavior |
|---|---|
| Create | `ProfileChangeToken::TYPE_EMAIL_CHANGE`, TTL from `profile.change_tokens.ttl_minutes` |
| Payload | Encrypted `pending_email`, `requested_at` |
| Replace | Previous active tokens for user marked `used_at` |
| Confirm | Atomic consume via conditional update inside DB transaction after availability re-check |
| Unavailable email on confirm | Returns **422** (`Invalid profile change token.`); token not consumed; `email_change_failed` with `reason=email_unavailable` |
| Reuse | Rejected with `InvalidProfileChangeTokenException` |

Token `$type` must use model constants only (never request-controlled strings).

---

## 11. Email Delivery

| Component | Role |
|---|---|
| `ProfileEmailChangeVerificationMail` | Sends plain verification token to **new** email |
| View | `resources/views/emails/profile-email-change-verification.blade.php` |

Email contains the verification code and expiry minutes only. No password, OTP, or session tokens.

---

## 12. Session Invalidation Behavior

On **confirm** only:

1. `email` updated to pending value
2. `email_verified_at = now()`
3. `last_security_changed_at = now()`
4. `profile_version += 1`
5. All refresh sessions revoked
6. Refresh cookie cleared
7. Existing JWTs rejected via `active.user`

Start does **not** revoke sessions or change the live email.

---

## 13. Audit Behavior

| Event | When | Safe metadata |
|---|---|---|
| `email_change_started` | Start success | `source`, `target_user_id`, `target_email_hash`, `profile_version`, `token_expires_at` |
| `email_changed` | Confirm success | `source`, `target_user_id`, `changed_by_user_id`, `old_email_hash`, `new_email_hash`, `profile_version`, `revoked_count` |
| `email_change_failed` | Invalid token / mismatch | `source`, `target_user_id`, `reason`, `profile_version` |

Raw emails, tokens, passwords, and OTP values are never logged in **audit metadata**. Profile email-change events also pass `email: null` so the top-level `auth_audit_logs.email` column is not populated with raw addresses for these events.

---

## 14. Blockchain Behavior — Deferred to M13

Profile blockchain proof creation is **not implemented in M6**.

Future proof (M13):

```text
entity_type = user_profile
proof_type = profile_email_changed
```

`BlockchainHashService` currently supports ANPR entities only. Profile proof integration requires M13 service extensions.

---

## 15. Files Created / Updated

| File | Change |
|---|---|
| `app/Http/Requests/Profile/StartEmailChangeRequest.php` | **Created** |
| `app/Http/Requests/Profile/ConfirmEmailChangeRequest.php` | **Created** |
| `app/Services/Profile/ProfileEmailService.php` | **Created** |
| `app/Mail/ProfileEmailChangeVerificationMail.php` | **Created** |
| `resources/views/emails/profile-email-change-verification.blade.php` | **Created** |
| `app/Http/Controllers/Api/ProfileController.php` | `startEmailChange`, `confirmEmailChange` |
| `app/Services/Auth/AuthAuditService.php` | Email audit constants; allow `*_hash` metadata values |
| `routes/api.php` | Email start/confirm routes |
| `tests/Feature/Profile/ProfileEmailChangeTest.php` | **Created** |

---

## 16. Test Coverage

`ProfileEmailChangeTest` — **24 tests**

| Area | Covered |
|---|---|
| Auth / validation | 401, required fields, same email, taken email |
| Step-up | Wrong password/OTP, rate limit |
| Start success | Hashed token, encrypted payload, mail sent, audit |
| Confirm failure | Invalid, expired, used, wrong type, wrong user, email claimed by another user |
| Confirm success | Email update, timestamps, version, sessions, cookie, re-login |
| Roles | Admin, Security Operator, Guard |
| Secrets | Response/audit sanitization |

### Commands run

```bash
php artisan test --filter=ProfileEmailChangeTest
php artisan test --filter=ProfileSecurityServiceTest
php artisan test --filter=ProfilePasswordChangeTest
php artisan test --filter=Profile
php artisan test --filter=Auth
```

### Results

| Suite | Tests | Result |
|---|---|---|
| `ProfileEmailChangeTest` | 24 | **Passed** |
| `ProfileSecurityServiceTest` | 18 | **Passed** |
| `ProfilePasswordChangeTest` | 18 | **Passed** |
| `Profile` (combined) | 119 | **Passed** |
| `Auth` (combined) | 186 | **Passed** |

---

## 17. Known Limitations

| Limitation | Notes |
|---|---|
| No blockchain proof in M6 | Deferred to M13 |
| No frontend UI | M11.2 must call start/confirm and clear auth after confirm |
| Same-second JWT edge | Re-login after confirm should occur in the next second; frontend must clear auth immediately |
| Text-only email | HTML template optional in future milestones |

---

## 18. Final M6 Statement

Profile Module **M6 is complete**. Authenticated users can start and confirm email changes through a secure two-phase backend flow with step-up verification, encrypted pending tokens, email delivery, session revocation, and sanitized audit logging. Frontend email UI and blockchain profile proofs remain deferred per the architecture plan.
