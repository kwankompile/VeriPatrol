# Profile Module M0 — Audit and Architecture Freeze

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M0  
**Status:** Frozen (documentation-only)  
**Date:** 2026-06-29  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This document records the **Profile Module M0 audit and architecture freeze** for the High-Security Surveillance Platform FYP. M0 confirms what already exists in `backend` and `frontend`, identifies profile-specific gaps, freezes security decisions before implementation, and defines acceptance criteria for milestones M1 onward.

**M0 does not implement Profile Module runtime features.** No `ProfileController`, profile API routes, frontend `feature/profile`, profile migrations, profile services, or profile UI pages were added in this milestone.

---

## 2. Source Material Reviewed

| Source | Path / scope |
|---|---|
| Profile Module architecture plan | `profile-module.md` (repository root) |
| Backend technical documentation | `backend/documentation.md` |
| Frontend technical documentation | `frontend/documentation.md` |
| API routes | `backend/routes/api.php` |
| Auth controllers | `AuthController`, `AuthSessionController`, `AuthAuditLogController`, `UserController` |
| Auth middleware | `EnsureUserIsActive`, `EnsureUserIsAdmin` |
| Domain models | `User`, `RefreshToken`, `AuthAuditLog`, `BlockchainRecord` |
| API resources | `UserResource`, `AuthSessionResource`, `AuthAuditLogResource`, `BlockchainRecordResource` |
| Admin form requests | `StoreUserRequest`, `UpdateUserRequest` |
| Auth services | `app/Services/Auth/*` |
| Blockchain services | `app/Services/Blockchain/*` |
| User-related migrations | Base `users` table and login-module migrations |
| Auth/session/audit/blockchain tests | `tests/Feature/Auth*.php`, related feature tests |
| Frontend API client | `frontend/src/api/api.js`, `authRefreshQueue.js` |
| Frontend auth utilities | `frontend/src/utils/auth.js` |
| Frontend routing | `frontend/src/routes/MainRoutes.jsx`, `routes/guards/*` |
| Profile menu | `layout/MainLayout/Header/ProfileSection/index.jsx` |
| Account Security feature | `feature/account-security/*` |
| Auth Monitoring feature | `feature/auth-monitoring/*` |
| PWA layer | `frontend/src/pwa/*` |

---

## 3. M0 Scope and Non-Scope

### In scope (M0)

- Codebase inspection of existing auth, user, session, audit, and blockchain foundations.
- Documentation of reusable components and profile-specific gaps.
- Frozen security decisions, acceptance matrix, and HTTP status expectations.
- Lightweight verification via `git diff` on documentation artifacts.

### Out of scope (M0) — deferred to M1+

| Prohibited in M0 | Deferred milestone |
|---|---|
| `ProfileController` and `/api/profile*` routes | M2–M7 |
| `ProfileResource`, profile form requests | M2–M7 |
| `ProfileChangeToken` model/table | M1 |
| Profile service classes (`ProfileService`, etc.) | M2–M7 |
| `config/profile.php` | M1 |
| Frontend `feature/profile` folder | M8 |
| Route `/account/profile` | M8 |
| Wiring Account Settings menu to `/account/profile` | M8 |
| Password/email/2FA self-service profile flows | M5–M7, M11 |
| Profile picture upload | M3, M10 |
| PWA profile offline queue | M12 |
| Blockchain `user_profile` entity hashing | M13 |
| Changes to existing auth/session behavior | N/A |

---

## 4. Current Backend Baseline

### 4.1 Existing Authentication Foundation

| Item | State | Evidence |
|---|---|---|
| JWT `auth:api` guard | **Implemented** | `routes/api.php`; protected group uses `middleware(['auth:api', 'active.user'])` |
| `active.user` middleware (`EnsureUserIsActive`) | **Implemented** | Blocks unauthenticated (`401`), soft-deleted/setup-incomplete/2FA-incomplete users (`403`), and JWTs issued before `last_password_changed_at` |
| Admin-only middleware (`EnsureUserIsAdmin`) | **Implemented** | `admin` middleware group separates admin APIs (users, audit logs, blockchain mutations, etc.) |
| Login with mandatory TOTP 2FA | **Implemented** | `AuthController` login branches; `TwoFactorService`, `AuthLoginChallengeService` |
| Refresh-token sessions | **Implemented** | `RefreshToken` model, `RefreshTokenService`, HttpOnly cookie rotation |
| `GET /api/auth/me` | **Implemented** | Returns authenticated user via `UserResource` |
| Admin 2FA reset | **Implemented** | `POST /api/auth/2fa/reset/{user}` under `admin` middleware |

**Finding:** Protected APIs are grouped under `auth:api` and `active.user`. Admin-only APIs are further separated by the `admin` middleware.

### 4.2 Existing User Data Model

**`users` table fields verified in migrations and `User` model:**

| Field | State | Migration / model |
|---|---|---|
| `phone` | **Implemented** | `2026_05_06_235400_create_users_table.php` |
| `address` | **Implemented** | Same |
| `profile_picture_url` | **Implemented** | Same |
| `profile_version` | **Implemented** | Same; default `1`; cast to `integer` on model |
| `two_factor_enabled` | **Implemented** | Same; cast to `boolean` |
| `two_factor_secret` | **Implemented** | Same; widened in `2026_06_30_100000_widen_two_factor_secret_column_on_users_table.php` |
| `two_factor_confirmed_at` | **Implemented** | `2026_06_29_100000_add_two_factor_confirmed_at_to_users_table.php` |
| `setup_required` | **Implemented** | `2026_06_28_120000_add_setup_required_to_users_table.php` |
| `last_password_changed_at` | **Implemented** | Base `users` migration |
| `last_security_changed_at` | **Missing** | Not present in codebase (optional future M1 decision) |

**`User` model security:**

- **Hidden:** `password`, `two_factor_secret`, `remember_token` — **Implemented**
- **Fillable** includes profile-adjacent fields (`phone`, `address`, `profile_picture_url`, `profile_version`) but not security-controlled fields (`two_factor_enabled`, etc.)

**`UserResource` (admin/user management API):**

- Exposes: `id`, `name`, `email`, `phone`, `address`, `profile_picture_url`, `two_factor_enabled`, `two_factor_confirmed_at`, `setup_required`, `last_password_changed_at`, `email_verified_at`, `role`, timestamps, `deleted_at`
- Does **not** expose: `password`, `two_factor_secret`, `profile_version`
- **Partially Present:** Safe for admin CRUD but **not** the Profile Module self-service contract; `profile_version` is omitted

**Admin form requests (`StoreUserRequest`, `UpdateUserRequest`):**

- Admin-scoped validation for user CRUD under `UserController`
- Prohibit client control of `setup_required`, `two_factor_enabled`, `two_factor_secret`, `last_password_changed_at`
- **Must not be reused** as self-service Profile Module request classes (different authorization scope and field policy)

**Finding:** No dedicated `ProfileController`, `ProfileResource`, or `ProfileChangeToken` exists.

### 4.3 Existing Session Management Foundation

| Item | State | Evidence |
|---|---|---|
| `refresh_tokens` table | **Implemented** | `2026_06_27_120000_create_refresh_tokens_table.php` |
| `RefreshToken` model | **Implemented** | `app/Models/RefreshToken.php` with `isActive()`, `revoke()`, scopes |
| `RefreshTokenService` | **Implemented** | `app/Services/Auth/RefreshTokenService.php` |
| `GET /api/auth/sessions` | **Implemented** | `AuthSessionController@index` |
| `scope=mine` query support | **Implemented** | Validated `scope` in `['mine']`; filters to authenticated user |
| `DELETE /api/auth/sessions/{session}` | **Implemented** | `AuthSessionController@destroy`; non-admin limited to own sessions |
| `POST /api/auth/logout-all` | **Implemented** | `AuthSessionController@logoutAll`; revokes all refresh sessions for authenticated user |
| `AuthSessionResource` | **Implemented** | Safe session metadata; `is_current` flag; no token hashes exposed |

**Tests:** `tests/Feature/AuthSessionMonitoringTest.php` covers `scope=mine` and `logout-all`.

**Finding:** `AuthSessionController` supports session listing and revocation. Profile Module will **reuse** these endpoints for own-session management rather than duplicating session tables.

### 4.4 Existing Audit Log Foundation

| Item | State | Evidence |
|---|---|---|
| `auth_audit_logs` table | **Implemented** | `2026_07_01_100000_create_auth_audit_logs_table.php`, status column migration |
| `AuthAuditLog` model | **Implemented** | `app/Models/AuthAuditLog.php` |
| `AuthAuditService` | **Implemented** | `app/Services/Auth/AuthAuditService.php` |
| Metadata sanitization | **Implemented** | Sensitive key filtering (`password`, `otp`, `secret`, `refresh_token`, etc.) |
| Admin audit API | **Implemented** | `GET /api/auth/audit-logs` under `admin` middleware |
| `AuthAuditLogResource` | **Implemented** | Safe audit serialization |
| Profile-specific audit events | **Missing** | No `profile_updated`, `email_changed`, etc. constants yet |

**Tests:** `tests/Feature/AuthAuditLogTest.php`, `AuthSecuritySettingsTest.php`.

### 4.5 Existing Blockchain Foundation

| Item | State | Evidence |
|---|---|---|
| `blockchain_records` table and read APIs | **Implemented** | `BlockchainRecordController`, `BlockchainRecordService` |
| Deterministic hashing (`BlockchainHashService`) | **Implemented** | `BlockchainCanonicalJson` + SHA-256 |
| Supported entity types for hashing | **ANPR only** | `buildCanonicalPayloadForEntity()` accepts `AnprEvent` and `AnprImage` only |
| `entity_type = user_profile` | **Missing** | No payload builder, integration service, or verification path |
| Verification service entity support | **ANPR only** | `BlockchainVerificationService` matches `anpr_event`, `anpr_image` |
| Queue anchoring job | **Implemented** | `AnchorBlockchainRecordJob` (reusable for future profile proofs) |

**Finding:** Blockchain hashing currently supports **ANPR entities only** (`anpr_event`, `anpr_image`). This is an **M0 gap** for Profile Module blockchain anchoring, not a defect in existing ANPR tests. Extension is planned for **M13**.

### 4.6 Backend Gaps for Profile Module

| Gap | State | Target milestone |
|---|---|---|
| `ProfileController` and `/api/profile*` routes | **Missing** | M2–M7 |
| `ProfileResource` (self-service safe contract incl. `profile_version`) | **Missing** | M2 |
| `profile_change_tokens` table / `ProfileChangeToken` model | **Missing** | M1 |
| `config/profile.php` | **Missing** | M1 |
| Profile service layer (`ProfileService`, `ProfileSecurityService`, etc.) | **Missing** | M2–M7 |
| Profile-specific audit event constants | **Missing** | M2, M14 |
| `user_profile` blockchain canonical payloads | **Missing** | M13 |
| `last_security_changed_at` (optional stale-JWT gate) | **Missing** | M1 (decision pending) |
| Self-service password/email/2FA change endpoints | **Missing** | M5–M7 |
| Profile picture upload endpoint | **Missing** | M3 |
| Profile feature tests | **Missing** | M2–M14 |

---

## 5. Current Frontend Baseline

### 5.1 Existing Auth Client and Route Guards

| Item | State | Evidence |
|---|---|---|
| Central `api.js` fetch wrapper | **Implemented** | `src/api/api.js` |
| `credentials: 'include'` | **Implemented** | `executeFetch()` passes refresh cookie |
| Refresh-on-401 with single retry | **Implemented** | `runAuthRefresh()` via `authRefreshQueue.js`; `isRetry` guard |
| `utils/auth.js` token/user helpers | **Implemented** | `getAuthToken`, `setAuthUser`, `getAuthSessionState`, role constants |
| `ProtectedRoute` | **Implemented** | `routes/guards/ProtectedRoute.jsx` |
| `RoleProtectedRoute` | **Implemented** | Role-aligned access for admin/operator routes |
| `ALL_ROLES` guard helper | **Implemented** | Used for `/patrol`, `/account/security` |

**Tests:** `api.test.js`, `authRefreshQueue.test.js`, `ProtectedRoute.test.jsx`, `RoleProtectedRoute.test.jsx`, `AccountSecurityRoute.test.jsx`.

### 5.2 Existing Account Security Feature

| Item | State | Evidence |
|---|---|---|
| Route `/account/security` | **Implemented** | `MainRoutes.jsx` — `allRoles(<AccountSecurity />)` |
| `feature/account-security` | **Implemented** | View + `useAccountSecurityController` |
| Own-session scope (`scope=mine`) | **Implemented** | Controller passes `{ scope: 'mine' }` to `useAuthSessionController` |
| Session list/revoke/logout-all | **Implemented** | Reuses `auth-monitoring` repository, service, `AuthSessionTable` |
| Admin session monitoring | **Implemented** | `/admin/auth-monitoring` without `scope=mine` |

**Tests:** `AccountSecurityPage.test.jsx`, `useAuthSessionController.test.jsx` (scope=mine case).

### 5.3 Existing Profile Menu State

| Menu item | State | Behavior |
|---|---|---|
| Security Settings | **Implemented** | Navigates to `/account/security` |
| Account Settings | **Partially Present** | Visible in `ProfileSection/index.jsx` but **no navigation handler**; not wired to `/account/profile` |
| Social Profile | **Placeholder** | Berry template remnant; out of Profile Module scope |
| Logout | **Implemented** | `useAuthController.handleLogout()` |

**Finding:** Account Settings is visible but is a **placeholder**. Wiring to `/account/profile` is deferred to **M8**.

### 5.4 Existing Feature Architecture Pattern

Established convention (verified in `management-user`, `auth-monitoring`, `account-security`):

```text
views → controllers → repositories → datasources → shared api.js
```

- Views do not call `fetch` directly.
- Datasources use relative API paths through `api.js`.
- Controllers own UI state and orchestration.

**Finding:** No `src/feature/profile` folder exists.

### 5.5 Frontend Gaps for Profile Module

| Gap | State | Target milestone |
|---|---|---|
| `feature/profile` folder | **Missing** | M8 |
| Route `/account/profile` | **Missing** | M8 |
| Account Settings menu navigation | **Missing** | M8 |
| Profile page UI (summary, contact form, dialogs) | **Missing** | M9–M11 |
| Profile datasource/repository | **Missing** | M8 |
| Cross-tab profile sync (`profileSyncEvents`) | **Missing** | M9 |
| PWA offline queue for phone/address | **Missing** | M12 |
| Profile-related frontend tests | **Missing** | M8–M12 |

**PWA note:** `src/pwa/` supports `location_log` sync only. No profile update queue types exist.

---

## 6. Reusable Components

### Backend — reuse without duplication

| Component | Reuse for Profile Module |
|---|---|
| `auth:api` + `active.user` middleware stack | All profile routes |
| `RefreshTokenService::revokeAllForUser()` | Sensitive change session invalidation |
| `AuthSessionController` session APIs | Own session list/revoke/logout-all (no new session table) |
| `TwoFactorService` | TOTP verification for step-up flows |
| `AuthAuditService` (+ sanitization) | Profile audit events via extension or thin wrapper |
| `BlockchainRecordService` + `AnchorBlockchainRecordJob` | Profile blockchain records after M13 hashing support |
| `User` model profile columns | Read/update target for profile data |
| `EnsureUserIsActive` JWT `iat` vs `last_password_changed_at` | Stale-token gate (may extend with `last_security_changed_at` in M1) |

### Backend — do not reuse as-is

| Component | Reason |
|---|---|
| `UserController` | Admin manages other users; different authorization |
| `StoreUserRequest` / `UpdateUserRequest` | Admin CRUD rules; not self-service step-up policy |
| `UserResource` | Missing `profile_version`; includes admin fields (`deleted_at`); not profile contract |

### Frontend — reuse without duplication

| Component | Reuse for Profile Module |
|---|---|
| `api.js` + `authRefreshQueue.js` | All profile API calls |
| `utils/auth.js` | Update `auth_user` after profile changes |
| `ProtectedRoute` / `RoleProtectedRoute` / `ALL_ROLES` | `/account/profile` access |
| `feature/auth-monitoring` session components | Link from profile page to `/account/security` |
| `feature/account-security` | Existing Security Settings page (no duplication) |
| PWA `useNetworkStatus` | Disable sensitive actions offline |

---

## 7. Frozen Security Decisions

The following decisions are **final for M0** and govern all Profile Module implementation from M1 onward.

### 7.1 Mandatory 2FA (no user disable)

- Users **cannot** disable 2FA from the Profile Module.
- Profile UI **must never** include a “Disable 2FA” user action.
- Admin 2FA reset remains **recovery-only** (existing Login M9 policy).

### 7.2 Step-up verification for sensitive changes

Password change, email change, and 2FA reconfiguration require:

- Current password
- Current TOTP (OTP)
- For email change: additional new-email confirmation (two-phase flow)

### 7.3 Sensitive changes revoke sessions

After password, email, or 2FA reconfiguration:

- All refresh sessions are revoked
- Stale JWTs are blocked (via `last_password_changed_at` and/or future `last_security_changed_at`)
- User must complete full login + 2FA again
- Backend is the **source of truth** for session invalidation

### 7.4 Separate Profile and Admin User Management domains

| Domain | Controller | Scope | Middleware |
|---|---|---|---|
| Admin User Management | `UserController` | Other users | `auth:api` + `active.user` + `admin` |
| Self-service Profile | `ProfileController` (future) | Own account only | `auth:api` + `active.user` |

### 7.5 Limited offline support

| Allowed offline (future) | Online-only |
|---|---|
| Phone update | Password change |
| Address update | Email change |
| | 2FA reconfiguration |
| | Profile picture upload |
| | Session revocation |

### 7.6 Blockchain anchoring scope

Anchor **only** critical identity changes:

- `profile_password_changed`
- `profile_email_changed`
- `profile_2fa_reconfigured`

Routine phone/address changes are **not** anchored by default.

### 7.7 No secret leakage

Never expose in API responses, audit metadata, logs, or blockchain payloads:

- Passwords, OTP values, TOTP secrets
- Verification tokens, refresh tokens, authorization headers
- Raw sensitive payloads

---

## 8. Sensitive vs Non-Sensitive Change Policy

| Change type | Examples | Verification | Offline | Session revoke | Blockchain |
|---|---|---|:---:|:---:|:---:|
| Non-sensitive profile | Phone, address | JWT only | Yes (M12) | No | No (default) |
| Profile picture | Avatar upload | JWT only | No | No | No |
| Password | New password | Password + TOTP | No | Yes | Yes (M13) |
| Email | New email | Password + TOTP + confirm | No | Yes | Yes (M13) |
| 2FA reconfigure | Replace TOTP secret | Password + current TOTP + new TOTP | No | Yes | Yes (M13) |
| 2FA disable | — | **Not available** | — | — | — |

---

## 9. Offline and PWA Policy

**Current state:** PWA offline queue supports `location_log` payloads via `POST /api/pwa/sync` only. **No profile offline queue exists.**

**Frozen policy (future M12):**

- Queue type: `profile_update_contact` (phone/address only)
- Must include `profile_version` for conflict detection
- Flush through shared `api.js` (refresh-on-401 preserved)
- Sensitive action UI controls disabled when offline

---

## 10. Session Invalidation Policy

**Current implementation (Login M9):**

- `EnsureUserIsActive` rejects JWTs where `iat <= last_password_changed_at`
- `RefreshTokenService::revokeAllForUser()` revokes refresh rows
- `POST /api/auth/logout-all` clears current refresh cookie

**Frozen Profile Module policy:**

- Password, email, and 2FA reconfiguration **must** revoke all refresh sessions including current
- Frontend clears local auth and redirects to `/login` after sensitive success
- Session management UI remains at `/account/security` (reuse existing APIs)

**Open item:** Whether to add `last_security_changed_at` as a dedicated stale-JWT gate for email/2FA changes (M1 decision). Interim option: update `last_password_changed_at` for all sensitive identity changes.

---

## 11. Audit and Blockchain Policy

### Audit

- Reuse `auth_audit_logs` table and `AuthAuditService`
- Add profile event constants in future milestones (e.g. `profile_updated`, `email_changed`, `password_changed` with `source=self_profile`)
- Sanitize metadata; never store secrets

### Blockchain

- Reuse `blockchain_records`, `BlockchainRecordService`, queue jobs
- `entity_type = user_profile`, `entity_id = user UUID`
- Proof types: `profile_email_changed`, `profile_password_changed`, `profile_2fa_reconfigured`
- Safe canonical payload only (user ID, profile_version, changed_at, action — no PII/secrets)
- User-facing API does **not** wait for on-chain confirmation
- **M0 gap:** `user_profile` hashing not implemented; **M13** extends `BlockchainHashService`

---

## 12. Acceptance Matrix for Future Milestones

| Area | Current State | Future Target | M0 Decision | Future Milestone |
|---|---|---|---|---|
| Backend profile read API | **Missing** | `GET /api/profile` returns safe self-service profile | Defer implementation; freeze contract | M2 |
| Backend non-sensitive profile update | **Missing** | `PATCH /api/profile` for phone/address with `profile_version` | Defer; require optimistic concurrency | M2 |
| Profile picture upload | **Missing** | `POST/DELETE /api/profile/picture` | Online-only; server MIME validation | M3 |
| Password change (self-service) | **Missing** | Step-up + session revoke + audit | Freeze security policy | M5 |
| Email change (self-service) | **Missing** | Two-phase flow with token table | Freeze security policy | M6 |
| 2FA reconfiguration | **Missing** | Replace secret; no disable endpoint | Mandatory 2FA preserved | M7 |
| Own session management | **Implemented** | Reuse `GET/DELETE /api/auth/sessions`, `POST /api/auth/logout-all` | Reuse; do not duplicate | M8 (link only) |
| Audit logging | **Partially Present** | Extend `AuthAuditService` with profile events | Reuse infrastructure | M2, M14 |
| Blockchain anchoring | **Missing** (`user_profile`) | Anchor sensitive identity changes | ANPR-only today; extend in M13 | M13 |
| PWA offline phone/address update | **Missing** | IndexedDB queue + flush via `api.js` | Non-sensitive only | M12 |
| Cross-tab profile refresh | **Missing** | BroadcastChannel + refetch | Defer | M9 |
| Frontend `/account/profile` | **Missing** | Protected route for all roles | Defer | M8 |
| Profile menu Account Settings | **Partially Present** | Navigate to `/account/profile` | Placeholder only in M0 | M8 |
| Security Settings `/account/security` | **Implemented** | Retain as separate feature | No change in M0 | — |
| Documentation | **Partially Present** | M0 freeze doc + milestone updates | This document | M0, M15 |

---

## 13. Expected HTTP Status Matrix

Future Profile Module endpoints (not implemented in M0) should use the following status conventions, aligned with existing Laravel API patterns:

| Status | Meaning | Typical endpoints |
|---:|---|---|
| **200 OK** | Successful read or mutation with body | `GET /api/profile`, `PATCH /api/profile`, password/email/2FA success |
| **201 Created** | Resource/token created (if used) | Optional: token issuance flows |
| **204 No Content** | Success without body | Optional: `DELETE /api/profile/picture` |
| **400 Bad Request** | Malformed sensitive-flow state | Invalid step-up session state |
| **401 Unauthorized** | Missing/invalid JWT or refresh session | All protected profile routes |
| **403 Forbidden** | `active.user` rejection, step-up failure, policy denial | Setup-incomplete, wrong password/TOTP policy |
| **404 Not Found** | Missing token/resource | Expired/unknown profile change token |
| **409 Conflict** | Stale `profile_version` | `PATCH /api/profile` optimistic concurrency |
| **422 Unprocessable Entity** | Validation errors | Field rules, file validation |
| **423 Locked** or **429 Too Many Requests** | Rate-limited sensitive attempts | Password/email/2FA/upload throttling (project convention TBD in M14) |

---

## 14. Architecture Decisions Confirmed in M0

| ID | Decision | Rationale |
|---|---|---|
| ADR-P01 | Dedicated `ProfileController` (not `UserController`) | Different authorization and validation for self-service vs admin CRUD |
| ADR-P02 | Mandatory 2FA cannot be disabled by users | High-security platform requirement |
| ADR-P03 | Step-up verification for sensitive changes | Session alone is insufficient proof |
| ADR-P04 | Sensitive changes revoke all sessions | Compromised sessions must not persist |
| ADR-P05 | Blockchain anchoring for critical identity changes only | Avoid queue noise on routine edits |
| ADR-P06 | Offline queue limited to phone/address | Sensitive flows require live verification |
| ADR-P07 | Reuse session and audit infrastructure | Avoid duplicate tables and services |
| ADR-P08 | `user_profile` blockchain support deferred to M13 | Current hash service is ANPR-scoped |

---

## 15. Risks, Constraints, and Open Items

| Item | Type | Notes |
|---|---|---|
| `last_security_changed_at` column | **Open (M1)** | Decide dedicated stale-JWT gate vs reusing `last_password_changed_at` for email/2FA |
| `UserResource` omits `profile_version` | **Constraint** | Future `ProfileResource` must include it; admin resource unchanged unless separately required |
| Account Settings placeholder visible | **UX risk** | Users may expect navigation; wire in M8 |
| Blockchain `user_profile` not in hash service | **Gap** | M13 must extend `BlockchainHashService` and verification paths |
| Email delivery for change confirmation | **Constraint** | M6 must handle dev/test mail strategy |
| Rate-limit HTTP code convention | **Open (M14)** | Choose `423` vs `429` consistently with Login Module |
| `profile-module.md` references `AuthController@logout-all` | **Doc drift** | Implementation uses `AuthSessionController@logoutAll` — reuse actual route |

---

## 16. M0 Passing Criteria

| Criterion | Status |
|---|---|
| Reusable backend/frontend components identified | **Met** |
| Profile-specific gaps documented | **Met** |
| Security decisions frozen (7 policies) | **Met** |
| Acceptance matrix defined | **Met** |
| HTTP status matrix defined | **Met** |
| No duplicate session/audit architecture planned | **Met** |
| No Profile Module runtime code added | **Met** |
| M0 documentation published | **Met** |

---

## 17. Verification Notes

**Verification attempted:**

```bash
git diff -- backend/docs/profile backend/documentation.md frontend/documentation.md
```

**Tests:** Not run — documentation-only M0 audit/freeze change.

**Code inspection highlights:**

- `routes/api.php`: No `/api/profile` routes; session routes under `auth:api` + `active.user`
- `grep ProfileController|ProfileResource|user_profile` in backend: **no matches**
- `glob feature/profile` in frontend: **no matches**
- `AuthSessionMonitoringTest.php`: confirms `scope=mine` and `logout-all`
- `BlockchainHashService.php`: throws on non-ANPR entities

---

## 18. Final M0 Freeze Statement

As of **2026-06-29**, the Profile Module architecture is **frozen at M0**. The codebase provides a strong authentication, session, audit, and ANPR-blockchain foundation suitable for extension. Profile-specific APIs, services, tokens, frontend feature folder, `/account/profile` route, PWA profile queue, and `user_profile` blockchain hashing are **explicitly deferred** to milestones M1–M15 per `profile-module.md`.

**No M1+ Profile Module implementation was performed in this milestone.**

Implementation may proceed from **M1 (Backend Data Foundation)** without re-opening the security decisions recorded in Section 7.
