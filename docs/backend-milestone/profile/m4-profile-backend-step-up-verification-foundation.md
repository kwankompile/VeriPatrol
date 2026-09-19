# Profile Module M4 — Backend Step-Up Verification Foundation

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M4  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M3 — Backend Profile Picture Upload](m3-profile-backend-profile-picture-upload.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone implements **reusable backend security foundations** for future sensitive profile changes (password, email, 2FA reconfiguration). M4 provides services and middleware updates that M5–M7 will call. **No new profile HTTP endpoints** are added in M4.

---

## 2. Scope

| Item | Status |
|---|---|
| `ProfileSecurityService` | **Implemented** |
| `ProfileStepUpRateLimiter` | **Implemented** |
| Step-up verification (`verifyStepUp`) | **Implemented** |
| Profile change token helpers | **Implemented** |
| Sensitive-change session revocation helper | **Implemented** |
| `EnsureUserIsActive` stale-JWT hardening | **Implemented** |
| `config/profile.php` step-up settings | **Implemented** |
| Unit + feature tests | **Implemented** |

---

## 3. Non-Scope / Deferred Work

| Deferred item | Milestone |
|---|---|
| `POST /api/profile/password/change` | M5 |
| `POST /api/profile/email/start` / `confirm` | M6 |
| `POST /api/profile/2fa/reconfigure/start` / `verify` | M7 |
| Frontend `feature/profile`, `/account/profile` | M8 |
| Profile picture UI | M10 |
| Email sending | M6 |
| Blockchain profile proofs | M13 |
| PWA offline profile queue | M12 |

---

## 4. Architecture Summary

```
M5–M7 controllers (future)
        │
        ▼
ProfileSecurityService
 ├── verifyStepUp()              → password + TOTP, rate-limited
 ├── createChangeToken()         → hashed pending-change tokens
 ├── validateChangeToken()
 ├── consumeChangeToken()        → atomic single-use consumption
 └── revokeSessionsAfterSensitiveChange()
        │
        ├── RefreshTokenService::revokeAllForUser()
        └── users.last_security_changed_at = now()

EnsureUserIsActive (active.user)
 └── Rejects JWT when iat <= max(last_password_changed_at, last_security_changed_at)
```

M4 is **backend-only**. No routes, controllers, or frontend UI were added.

---

## 5. Services and Classes Added

| File | Role |
|---|---|
| `app/Services/Profile/ProfileSecurityService.php` | Core step-up, token, and revocation orchestration |
| `app/Services/Profile/ProfileStepUpRateLimiter.php` | Per-user/IP failed step-up attempt tracking |
| `app/Support/Profile/ProfileStepUpVerificationException.php` | Generic step-up failure |
| `app/Support/Profile/ProfileStepUpRateLimitedException.php` | Rate-limit failure with `retryAfterSeconds` |
| `app/Support/Profile/InvalidProfileChangeTokenException.php` | Invalid/expired/used/wrong-type token |

### Updated

| File | Change |
|---|---|
| `app/Http/Middleware/EnsureUserIsActive.php` | Stale JWT check uses later of password + security timestamps |
| `config/profile.php` | `step_up.max_attempts`, `step_up.decay_seconds` |
| `.env.example` | `PROFILE_STEP_UP_MAX_ATTEMPTS`, `PROFILE_STEP_UP_DECAY_SECONDS` |

---

## 6. Step-Up Verification Policy

### `ProfileSecurityService::verifyStepUp`

```php
public function verifyStepUp(
    User $user,
    string $currentPassword,
    string $otp,
    ?Request $request = null
): void
```

| Step | Behavior |
|---|---|
| Rate-limit check | Throws `ProfileStepUpRateLimitedException` when locked |
| 2FA readiness | Requires `two_factor_enabled`, secret, and `two_factor_confirmed_at` |
| Password check | `Hash::check` against stored hash |
| TOTP check | `TwoFactorService::verifyForUser` |
| Failure | Increments rate limiter; throws `ProfileStepUpVerificationException` |
| Success | Clears rate limiter state |

**Public failure message (password or OTP):**

```text
Step-up verification failed.
```

Wrong password and wrong OTP produce the **same** message. Rate-limit failures use a distinct exception for retry-after handling.

### Configuration

| Key | Default | Env |
|---|---|---|
| `profile.step_up.max_attempts` | `5` | `PROFILE_STEP_UP_MAX_ATTEMPTS` |
| `profile.step_up.decay_seconds` | `300` | `PROFILE_STEP_UP_DECAY_SECONDS` |

---

## 7. Profile Change Token Lifecycle

### Create

```php
[
    'token' => $plainToken,   // returned once to caller; never persisted
    'model' => $profileChangeToken,
]
```

- Plain token generated with `bin2hex(random_bytes(32))`
- Only `ProfileChangeToken::hashToken($plainToken)` stored in DB
- TTL from `config('profile.change_tokens.ttl_minutes')` (default 10)
- `ip_address` and `user_agent` captured when request provided
- `pending_payload` stored encrypted via model cast

### Validate

`validateChangeToken($plainToken, $type)` returns active token or throws `InvalidProfileChangeTokenException`.

### Consume (atomic)

`consumeChangeToken($plainToken, $type)` uses transaction + row lock + conditional update (`whereNull('used_at')`, `expires_at > now()`). Used tokens cannot be consumed twice.

Supported types (from M1 model):

- `ProfileChangeToken::TYPE_EMAIL_CHANGE`
- `ProfileChangeToken::TYPE_TWO_FACTOR_RECONFIGURE`

**M5–M7 controller rule:** Pass only model constants to token helpers — never request-controlled `$type` strings. Unsupported types throw `InvalidArgumentException` (internal/programmer error). Wiring a user-supplied type into the service would surface that as an accidental **500** instead of a controlled client error.

---

## 8. Sensitive-Change Session Revocation

### `revokeSessionsAfterSensitiveChange`

```php
[
    'user' => $user,
    'revoked_count' => $count,
]
```

| Action | Behavior |
|---|---|
| Row lock | `lockForUpdate()` on user |
| Timestamp | Sets `last_security_changed_at = now()` via `forceFill` |
| Refresh sessions | `RefreshTokenService::revokeAllForUser()` |
| Audit | **None in M4** — M5–M7 write action-specific audit events |

`revoked_count` is available for future audit metadata in M5–M7.

---

## 9. Stale-JWT Invalidation

`EnsureUserIsActive` now computes:

```text
invalidation_at = max(last_password_changed_at, last_security_changed_at)
```

| Condition | Result |
|---|---|
| No security timestamps | JWT allowed (existing behavior) |
| `iat` missing or non-numeric | **403** fail-closed |
| JWT payload unreadable | **403** fail-closed |
| `iat <= invalidation_at` | **403** |
| `iat > invalidation_at` | Allowed |

Existing password-change invalidation behavior is preserved. `last_security_changed_at` updates from `revokeSessionsAfterSensitiveChange` also invalidate outstanding JWTs on `active.user` routes.

---

## 10. Security Controls

| Control | Implementation |
|---|---|
| No factor-specific leak | Same message for wrong password or OTP |
| No plain token persistence | SHA-256 hash only |
| No secret logging | Service does not log password, OTP, or plain tokens |
| Atomic token consumption | Prevents double-use races |
| Rate limiting | Per user + IP cache keys |
| Session revocation | All refresh rows revoked; JWT blocked via middleware |
| Self-scope preserved | No new user-ID profile routes |
| No 2FA disablement | Not introduced in M4 |

---

## 11. Tests Added and Results

### Files

| File | Tests |
|---|---|
| `tests/Unit/Profile/ProfileSecurityServiceTest.php` | 18 |
| `tests/Feature/Profile/ProfileStepUpVerificationTest.php` | 9 |

### Commands run

```bash
php artisan test --filter=ProfileSecurityServiceTest
php artisan test --filter=ProfileStepUpVerificationTest
php artisan test --filter=ProfileDataFoundationTest
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
| `ProfileSecurityServiceTest` | 18 | **Passed** |
| `ProfileStepUpVerificationTest` | 9 | **Passed** |
| `ProfileDataFoundationTest` | 11 | **Passed** |
| `ProfileReadUpdateTest` | 21 | **Passed** |
| `ProfilePictureTest` | 18 | **Passed** |
| `AuthSecuritySettingsTest` | 18 | **Passed** |
| `AuthSessionMonitoringTest` | 10 | **Passed** |
| `AuthAuditLogTest` | 16 | **Passed** |
| `Profile` (combined) | 77 | **Passed** |
| `Auth` (combined) | 182 | **Passed** |

---

## 12. Acceptance Criteria

| Criterion | Status |
|---|---|
| `verifyStepUp` validates password + TOTP without factor leak | **Met** |
| Rate limiting on repeated failures | **Met** |
| Token create/validate/consume lifecycle | **Met** |
| Atomic single-use token consumption | **Met** |
| Supported token type allow-list on create/validate/consume | **Met** |
| Blank plain token rejected on consume | **Met** |
| Session revocation + `last_security_changed_at` update | **Met** |
| Stale JWT blocked via `active.user` | **Met** |
| M0–M3 behavior unchanged | **Met** |
| No new profile HTTP endpoints | **Met** |
| No frontend scope creep | **Met** |

---

## 13. Known Limitations / Deferred M5–M7 Work

| Limitation | Notes |
|---|---|
| No HTTP API yet | M5–M7 expose step-up through profile endpoints |
| Storage inside DB transaction | File operations in M3 remain unchanged; future hardening may defer file deletion until after commit |
| No M4 audit events | Action-specific audit logging deferred to M5–M7 |
| Token `$type` parameter | Controllers must use `ProfileChangeToken::TYPE_*` constants only; never pass request input as `$type` (unsupported types throw `InvalidArgumentException`) |
| Same-second JWT edge case | JWT `iat` equal to invalidation timestamp is rejected (`<=`); new login in the next second succeeds (existing M8 policy). M5–M7 frontends should clear auth immediately after a sensitive change succeeds and route to login with a clear message rather than reusing the current token. |

---

## 14. Final M4 Statement

Profile Module **M4 is complete**. The backend now has reusable step-up verification, profile change token management, sensitive-change session revocation, and expanded stale-JWT protection. Password change, email change, and 2FA reconfiguration HTTP flows remain deferred to M5–M7.
