# Profile Module M1 — Backend Data Foundation

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M1  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M0 — Profile Module Audit and Architecture Freeze](m0-profile-module-audit-and-architecture-freeze.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone prepares **backend database, model, and configuration foundations** for the Profile Module. M1 enables future self-service email change and 2FA reconfiguration flows (M6–M7) without implementing profile APIs, controllers, or frontend UI.

M1 follows the frozen M0 architecture decisions. No M0 security policies were reopened.

---

## 2. Scope

| Item | Status |
|---|---|
| Confirm existing `users` profile fields | **Preserved** |
| Add nullable `users.last_security_changed_at` | **Implemented** |
| Create `profile_change_tokens` table | **Implemented** |
| Create `ProfileChangeToken` model | **Implemented** |
| Create `ProfileChangeTokenFactory` | **Implemented** |
| Add `config/profile.php` | **Implemented** |
| Add optional `.env.example` profile keys | **Implemented** |
| Backend data foundation tests | **Implemented** |

---

## 3. Non-Scope

M1 explicitly does **not** include:

| Deferred item | Milestone |
|---|---|
| `ProfileController` and `/api/profile*` routes | M2+ |
| `ProfileResource` and profile form requests | M2+ |
| Profile service classes | M2–M7 |
| Password/email/2FA change endpoints | M5–M7 |
| Profile picture upload endpoint | M3 |
| `EnsureUserIsActive` wiring for `last_security_changed_at` | M4+ |
| Frontend `feature/profile` | M8 |
| Route `/account/profile` | M8 |
| Account Settings menu navigation | M8 |
| PWA profile offline queue | M12 |
| Blockchain `user_profile` hashing | M13 |

**M1 does not create profile APIs.** **M1 does not create frontend routes or UI.**

---

## 4. Baseline From M0

M0 confirmed the following reusable foundations (unchanged by M1):

- Existing `users` profile columns: `phone`, `address`, `profile_picture_url`, `profile_version`, security timestamps, 2FA fields
- `RefreshToken`, `AuthAuditLog`, login/session/2FA services
- Account security session APIs at `/api/auth/sessions` and `/api/auth/logout-all`
- Frontend `/account/security` remains implemented; `/account/profile` remains deferred

M0 open item **resolved in M1:** `last_security_changed_at` column added as data foundation only (middleware wiring deferred).

---

## 5. Backend Data Changes

### 5.1 User Security Timestamp Foundation

**Migration:** `database/migrations/2026_07_03_100000_add_last_security_changed_at_to_users_table.php`

| Field | Type | Purpose |
|---|---|---|
| `last_security_changed_at` | `timestamp` nullable | Future stale-JWT gate for email/2FA sensitive changes |

**`User` model changes:**

- Cast: `'last_security_changed_at' => 'datetime'`
- **Not** added to `$fillable` (not client-controllable)
- Existing `last_password_changed_at` behavior and middleware logic **unchanged**

### 5.2 Profile Change Tokens Table

**Migration:** `database/migrations/2026_07_03_100100_create_profile_change_tokens_table.php`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → `users.id` | cascade delete |
| `type` | string, indexed | `email_change`, `two_factor_reconfigure` |
| `token_hash` | string, **unique** | SHA-256 hash only |
| `pending_payload` | text nullable | encrypted at model layer |
| `expires_at` | timestamp, indexed | TTL from `config/profile.php` |
| `used_at` | timestamp nullable, indexed | single-use marker |
| `ip_address` | string(45) nullable | |
| `user_agent` | text nullable | |
| `created_at`, `updated_at` | timestamps | |

**Indexes:** `user_id`, `type`, `expires_at`, `used_at`, composite `(user_id, type, used_at)`.

### 5.3 ProfileChangeToken Model

**File:** `app/Models/ProfileChangeToken.php`

| Feature | Implementation |
|---|---|
| UUID primary key | `HasUuids` |
| Factory support | `ProfileChangeTokenFactory` |
| Relationship | `belongsTo(User)` |
| Type constants | `TYPE_EMAIL_CHANGE`, `TYPE_TWO_FACTOR_RECONFIGURE` |
| Casts | `pending_payload` → `encrypted:array`; datetime casts for `expires_at`, `used_at` |
| Helpers | `isExpired()`, `isUsed()`, `isActive()`, `markUsed(): bool`, `hashToken()` |
| Scopes | `scopeActive`, `scopeOfType` |

**Security:** Plain tokens are never persisted. Only `ProfileChangeToken::hashToken($plain)` output is stored in `token_hash`.

### 5.4 ProfileChangeToken Factory

**File:** `database/factories/ProfileChangeTokenFactory.php`

| State | Behavior |
|---|---|
| Default | `type = email_change`, SHA-256 `token_hash`, TTL from config |
| `emailChange()` | `type = email_change` |
| `twoFactorReconfigure()` | `type = two_factor_reconfigure` |
| `expired()` | `expires_at` in the past |
| `used()` | `used_at` set |
| `withPendingPayload(array)` | sets encrypted pending payload |

### 5.5 Profile Configuration

**File:** `config/profile.php`

| Section | Keys |
|---|---|
| `profile_picture` | `disk`, `directory`, `max_size_kb`, `allowed_mimes` |
| `change_tokens` | `ttl_minutes` (default 10) |
| `security` | `allow_user_two_factor_disable` = **false**; step-up and session-revoke flags = **true** |

**`.env.example` optional keys added:**

- `PROFILE_PICTURE_DISK`
- `PROFILE_PICTURE_DIRECTORY`
- `PROFILE_PICTURE_MAX_SIZE_KB`
- `PROFILE_PICTURE_ALLOWED_MIMES`
- `PROFILE_CHANGE_TOKEN_TTL_MINUTES`

### 5.6 User Model Relationship

**`User::profileChangeTokens()`** — `hasMany(ProfileChangeToken::class)` added.

---

## 6. Security Controls

| Control | M1 implementation |
|---|---|
| Token hash only | `token_hash` stores SHA-256; plain tokens rejected by tests |
| Encrypted pending payload | `encrypted:array` cast on `text` column |
| No secret exposure | Model not exposed via API in M1 |
| `last_security_changed_at` not mass assignable | Excluded from `$fillable`; test enforced |
| User 2FA disable prohibited | `config('profile.security.allow_user_two_factor_disable')` = `false` |
| Middleware unchanged | `EnsureUserIsActive` still uses `last_password_changed_at` only |

### Future implementation notes (M4+)

**Atomic token consumption (M6/M7):** `ProfileChangeToken::markUsed()` is sufficient for M1 tests. When email and 2FA confirmation endpoints are implemented, token consumption must be **atomic** — either inside a database transaction or via a conditional update such as `whereNull('used_at')->where('expires_at', '>', now())->update(['used_at' => now()])` — so concurrent confirmation requests cannot both succeed on the same token.

**Stale JWT gate for `last_security_changed_at` (M4+):** The column is data-only in M1. In M4 and later, `EnsureUserIsActive` (or a shared helper) should reject JWTs issued before **either** `last_password_changed_at` **or** `last_security_changed_at`, whichever is more recent. This must preserve existing `last_password_changed_at` behavior and keep `AuthSecuritySettingsTest` / password-change regression tests passing. See `profile-module.md` §11.4.

---

## 7. Testing and Verification

### Commands run

```bash
php artisan test --filter=ProfileDataFoundationTest
php artisan test --filter=AuthPasswordSetupTest
php artisan test --filter=AuthTwoFactorTest
php artisan test --filter=AuthSecuritySettingsTest
```

### Results

| Suite | Tests | Result |
|---|---|---|
| `ProfileDataFoundationTest` | 11 | **Passed** |
| `AuthPasswordSetupTest` | 15 | **Passed** |
| `AuthTwoFactorTest` | 15 | **Passed** |
| `AuthSecuritySettingsTest` | 18 | **Passed** |

### `ProfileDataFoundationTest` coverage

1. Required `users` profile/security columns exist  
2. `User` model casts (`profile_version`, datetime/boolean security fields)  
3. `last_security_changed_at` not mass assignable  
4. `profile_change_tokens` table schema  
5. Factory creates valid records  
6. Plain tokens not persisted (hash only)  
7. `pending_payload` encrypted at rest  
8. Token status helpers (`isActive`, `isExpired`, `isUsed`, `markUsed`)  
9. `User::profileChangeTokens()` relationship  
10. `config/profile.php` readable  
11. Factory states (`emailChange`, `twoFactorReconfigure`)

---

## 8. Files Created

| File |
|---|
| `database/migrations/2026_07_03_100000_add_last_security_changed_at_to_users_table.php` |
| `database/migrations/2026_07_03_100100_create_profile_change_tokens_table.php` |
| `app/Models/ProfileChangeToken.php` |
| `database/factories/ProfileChangeTokenFactory.php` |
| `config/profile.php` |
| `tests/Feature/ProfileDataFoundationTest.php` |
| `docs/profile/m1-profile-backend-data-foundation.md` |

---

## 9. Files Updated

| File | Change |
|---|---|
| `app/Models/User.php` | `last_security_changed_at` cast; `profileChangeTokens()` relationship |
| `.env.example` | Optional `PROFILE_*` environment keys |
| `documentation.md` | M1 profile module note |
| `frontend/documentation.md` | Concise M1 backend-only note |

---

## 10. Deferred Work

| Item | Milestone |
|---|---|
| `ProfileController@show` / `GET /api/profile` | M2 |
| `ProfileResource` | M2 |
| `ProfileSecurityService` and step-up verification | M4 |
| Wire `last_security_changed_at` into JWT stale-token middleware | M4+ — check both `last_password_changed_at` and `last_security_changed_at`; preserve existing password-change tests |
| Atomic profile change token consumption in confirmation flows | M6/M7 — replace naive `markUsed()` with transactional/conditional update |
| Email/2FA token issuance services | M6–M7 |
| Frontend profile UI and `/account/profile` | M8+ |

---

## 11. M1 Passing Criteria

| Criterion | Status |
|---|---|
| Migration runs successfully | **Met** |
| `User` casts include `profile_version`, security timestamps | **Met** |
| `last_security_changed_at` exists and is not mass assignable | **Met** |
| `profile_change_tokens` table and model created | **Met** |
| Plain tokens never persisted | **Met** |
| `pending_payload` encrypted | **Met** |
| `config/profile.php` readable in tests | **Met** |
| Existing auth tests still pass | **Met** |
| No profile APIs or frontend changes | **Met** |

---

## 12. Final M1 Statement

Profile Module **M1 backend data foundation is complete**. The database and model layer now support future profile change-token flows and a dedicated security timestamp column. **`ProfileController` is deferred to M2+.** The frontend `/account/profile` route and `feature/profile` folder remain deferred to **M8**. No profile HTTP endpoints were added. Existing login, 2FA, refresh-token, session, patrol, ANPR, blockchain, and admin user management behavior is preserved.
