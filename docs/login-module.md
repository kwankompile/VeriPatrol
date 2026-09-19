# Login Module — Secure Authentication and Session Architecture

**Document name:** `login-module.md`  
**Target repositories:** `backend`, `frontend`  
**Primary backend:** Laravel PHP  
**Primary frontend:** React + Vite PWA  
**Status:** **Implemented** (Login Module M0–M10 complete in `backend` and `frontend`)  
**Architecture mode:** Incremental, milestone-by-milestone implementation  

> **Current contract** (last audited **2026-07-21**)
>
> | Field | Value |
> | --- | --- |
> | **Implementation status** | **M0–M10 complete** in `backend` and `frontend` |
> | **Canonical source precedence** | 1. [`backend/documentation.md`](../backend/documentation.md) §6 and `routes/api.php` → 2. [`backend/docs/login/m10-final-hardening-testing-and-documentation-freeze.md`](../backend/docs/login/m10-final-hardening-testing-and-documentation-freeze.md) → 3. This file |
> | **Historical-document policy** | Milestone structure and gap tables below are retained for traceability; §2.2 and similar sections describe **resolved** pre-implementation gaps |
> | **Known remaining manual tasks** | None blocking runtime; M10 demo checklist evidence is optional local capture |

---

## 1. Executive Summary

The Login Module is the controlled-access security gateway for the FYP surveillance platform. It must protect all operational modules, including **Patrolling**, **PWA Sync**, **ANPR Monitoring**, **Blockchain Monitoring**, **User Management**, and other administrative features.

The latest architecture decision is to keep the Login Module inside the existing application repositories:

```text
project-root/
├── backend/     # Laravel API, auth, refresh tokens, 2FA, audit logs, rate limiting
└── frontend/      # React login UI, OTP UI, session state, protected routes, token refresh client
```

There is **no separate login repository**. Authentication is a core cross-cutting backend/frontend capability.

The module replaces the current simple JWT-only login behavior with a high-security authentication architecture:

```text
Admin-created user
        ↓
First-login password setup + mandatory 2FA setup
        ↓
Normal login email/password
        ↓
OTP verification
        ↓
Short-lived JWT access token + DB-backed refresh session
        ↓
Automatic access-token refresh during active session
        ↓
Strict logout / refresh expiry / disabled-user invalidation
```

The main design goal is not only to login users, but to keep long-running surveillance workflows safe. In particular, the **Patrolling Module** must not lose authenticated sync capability merely because a short-lived JWT expires during a shift.

---

## 2. Current Baseline and Gap Summary

## 2.1 Current baseline (as implemented)

The Login Module is **fully implemented** in the backend and frontend:

- `AuthController` handles multi-step login: password setup → 2FA setup → OTP → JWT + refresh cookie.
- DB-backed refresh tokens with HttpOnly cookie, rotation, and family reuse detection (`RefreshTokenService`).
- Mandatory TOTP on every login (`TwoFactorService`, `AuthLoginChallengeService`).
- Session monitoring APIs (`AuthSessionController`), admin audit logs (`AuthAuditLogController`), rate limiting (`LoginRateLimiter`).
- Frontend refresh-on-401 via shared `api.js` queue; PWA sync uses the same client (`PatrolTokenExpiryTest`, `PwaSyncTest`).
- Middleware: `auth:api`, `active.user`, `admin`, `patrol.monitoring`.

## 2.2 Historical gaps (resolved)

The table below described gaps **before** M1–M10 implementation. All rows are now addressed in code unless noted.

| Area                 | Was missing (planning)                            | Current behavior (implemented)                                              |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Access token         | Long-lived JWT                                    | Short-lived JWT (`AUTH_ACCESS_TOKEN_TTL`, default 30 min)                 |
| Refresh token        | No frontend refresh flow                          | HttpOnly cookie + `POST /api/auth/refresh` with rotation                  |
| Token storage        | Access token in `localStorage` only               | Access token in memory + `localStorage` for route reload; refresh in cookie |
| 401 handling         | Clear session and redirect                        | Single refresh attempt, then session-expired UX                           |
| 2FA                  | Not enforced on login                             | Mandatory TOTP setup + OTP on every login                                 |
| First login          | No forced setup                                   | `setup_required` + password setup + 2FA setup gates                       |
| Audit logging        | Not centralized                                   | `auth_audit_logs` + `AuthAuditService`                                    |
| Rate limiting        | Not defined                                       | Login + OTP lockout (`LoginRateLimiter`)                                  |
| Patrol expiry safety | Token expiry could interrupt sync                 | PWA sync refreshes via shared `api.js` before retry                       |

**Not implemented (by design):** `two_factor_recovery_codes` table and public self-service 2FA reset. Admin 2FA reset only (`POST /api/auth/2fa/reset/{user}`).

---

## 3. Module Objectives

The Login Module must provide:

- **Admin-controlled identities** with no public registration.
- **Mandatory two-factor authentication** using TOTP.
- **Short-lived access tokens** for API authorization.
- **DB-backed refresh sessions** aligned with security shift duration.
- **Automatic token refresh** while the refresh session remains valid.
- **Reliable PWA patrol continuity** when access tokens expire mid-patrol.
- **Strict session expiry** when the refresh token expires or is revoked.
- **Immediate session invalidation** when a user is disabled or password is changed.
- **Role-based access control** for Admin, Security Operator, and Guard.
- **Audit logging** for authentication and sensitive account actions.
- **Rate limiting and lockout** for login and OTP attempts.
- **Device and IP tracking** for anomaly investigation.

---

## 4. Latest Architecture Decisions

## 4.1 Decision summary


| Decision               | Final choice                         | Reason                                                                       |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| Auth ownership         | Laravel backend                      | Backend owns identity, tokens, roles, sessions, audit logs, and lockouts.    |
| Frontend role          | React PWA client                     | Frontend owns UI, state, route guards, refresh retry, and session-expiry UX. |
| Access token           | JWT bearer token                     | Compatible with the existing `auth:api` middleware and API structure.        |
| Refresh token          | Opaque DB-backed token               | Supports revocation, rotation, device tracking, and session audit.           |
| Refresh token storage  | HttpOnly secure cookie (implemented) | Prevents JavaScript from reading long-lived tokens.                          |
| Access token storage   | Memory cache + `localStorage` for reload | Refresh remains HttpOnly-only; access token is short-lived.                |
| 2FA method             | TOTP                                 | Works with Google Authenticator and equivalent apps.                         |
| First-login activation | Mandatory password setup + 2FA setup | Ensures admin-created accounts become active only after initialization.      |
| PWA sync behavior      | Refresh before protected retry       | Prevents token expiry from breaking patrol sync.                             |
| Audit trail            | Central `auth_audit_logs` table      | Supports reporting, investigation, and FYP security justification.           |


## 4.2 Why the Login Module stays in Laravel and React

Authentication is not an isolated module. It protects every existing feature:

```text
React PWA / Dashboard
        ↓
Login + OTP + token refresh
        ↓
Laravel auth middleware
        ↓
Protected modules:
- Patrol
- PWA sync
- ANPR Monitoring
- Blockchain Monitoring
- User Management
- Zone / Checkpoint / Vehicle Management
```

Therefore:

- Laravel must own token creation, refresh validation, revocation, and audit logging.
- React must only request tokens and manage user experience.
- PWA storage must not become an independent authentication store.
- Service worker code must not store refresh tokens or bypass Laravel authentication.

---

## 5. Core Design Principles

## 5.1 Backend is the security authority

The frontend may guide the user experience, but Laravel decides:

- whether credentials are valid;
- whether OTP is required;
- whether a refresh session is still valid;
- whether a user is active;
- whether a role can access a route;
- whether suspicious login behavior should be locked or logged.

## 5.2 Short-lived trust

Access tokens are short-lived so a stolen access token has limited usefulness.

**Configured default** (`config/auth_security.php` → `AUTH_ACCESS_TOKEN_TTL`, falling back to `JWT_TTL`):

```text
30 minutes
```

During an active session, the frontend obtains a new access token through `POST /api/auth/refresh`.

## 5.3 Refresh sessions define the real login session

A refresh token represents the active session. In the implemented design it is:

- random and opaque;
- stored hashed in the database (`refresh_tokens.token_hash`);
- stored in an HttpOnly cookie on the browser;
- rotated on every refresh;
- revocable on logout / sensitive account changes;
- associated with device name, IP, user agent, and expiry.

**Configured default** (`AUTH_REFRESH_TOKEN_TTL_HOURS`):

```text
12 hours
```

This aligns with typical guard/operator shift duration.

## 5.4 2FA is mandatory, not optional

All users must complete TOTP setup during first login and must pass OTP verification during every normal login.

## 5.5 PWA patrol continuity is required

The patrol workflow is long-running. Token expiry must not automatically destroy the session during patrol while the refresh session is still valid.

Correct behavior:

```text
Protected request returns 401 because access token expired
        ↓
Frontend calls /auth/refresh using HttpOnly refresh cookie
        ↓
Laravel validates refresh session and returns new access token
        ↓
Frontend retries original request once
        ↓
Patrol sync continues
```

If refresh fails, the PWA keeps unsynced patrol records in IndexedDB and requires full login again.

---

## 6. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ React + Vite PWA                                             │
│                                                             │
│ Login UI → First Login UI → OTP UI → Protected Routes        │
│      ↓                                                      │
│ feature/authentication (controllers / repositories)         │
│      ↓                                                      │
│ api.js with refresh-on-401 retry                            │
│      ↓                                                      │
│ In-memory access token + auth user state                    │
│      ↓                                                      │
│ PWA sync queue calls protected APIs through same api.js      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Laravel API                                                  │
│                                                             │
│ Controllers                                                  │
│ - AuthController (login, password setup, 2FA setup, OTP,     │
│                   refresh, logout, me, admin 2FA reset)      │
│ - AuthSessionController (list / revoke / logout-all)         │
│ - AuthAuditLogController (admin audit log index)             │
│ - CameraAuthController (machine login; not user 2FA)         │
│      ↓                                                      │
│ app/Services/Auth/*                                          │
│ - RefreshTokenService                                        │
│ - TwoFactorService                                           │
│ - TwoFactorSetupService                                      │
│ - AuthLoginChallengeService                                  │
│ - PasswordSetupService                                       │
│ - AuthAuditService                                           │
│ - AuthAccountRecoveryService                                 │
│ - LoginRateLimiter                                           │
│ - CameraAuthService                                          │
│      ↓                                                      │
│ Database (auth-related)                                      │
│ - users                                                      │
│ - refresh_tokens                                             │
│ - password_setup_tokens                                      │
│ - two_factor_setup_sessions                                  │
│ - auth_login_challenges                                      │
│ - auth_audit_logs                                            │
└─────────────────────────────────────────────────────────────┘
```

> **Current implementation note:** There are no `TwoFactorController`, `PasswordSetupController`, `TokenService` / `AccessTokenService`, or `two_factor_recovery_codes` table. Password setup and TOTP setup/OTP live on `AuthController`. JWT issuance uses Laravel JWTAuth (`auth('api')`), not a dedicated token service class. Recovery codes are **not implemented by design** — admin 2FA reset only (`POST /api/auth/2fa/reset/{user}`).

---

## 7. Authentication Flows

## 7.1 Admin-created user flow

```text
Admin creates user
        ↓
Laravel creates inactive/pending-initialization account
        ↓
Laravel generates temporary password or setup token
        ↓
User receives temporary credential through approved channel
        ↓
User starts first-login initialization
```

### Rules

- Public registration stays disabled (no registration API; template Register UI is unused).
- Only Admin can create users.
- New accounts start with `setup_required = true` until password setup completes.
- Protected modules remain inaccessible until password setup and mandatory 2FA setup are complete (`setup_required` / `two_factor_enabled` gates).

## 7.2 First-login initialization flow

```text
User enters email + temporary password/setup token
        ↓
Laravel validates initialization eligibility
        ↓
User sets permanent password
        ↓
Laravel validates password policy and stores hashed password
        ↓
Laravel generates TOTP secret
        ↓
Frontend displays QR code and manual setup key
        ↓
User scans using authenticator app
        ↓
User enters OTP
        ↓
Laravel verifies OTP
        ↓
Laravel stores encrypted TOTP secret and enables 2FA
        ↓
Account becomes active
        ↓
User proceeds to normal login or receives login tokens after OTP confirmation
```

## 7.3 Normal login flow

```text
POST /api/auth/login
email + password
        ↓
Laravel validates credentials
        ↓
Laravel checks active status, lockout status, and 2FA setup status
        ↓
If password valid: return login_challenge_id and require OTP
        ↓
POST /api/auth/otp/verify
login_challenge_id + otp
        ↓
Laravel validates OTP
        ↓
Laravel issues short-lived JWT access token
        ↓
Laravel creates refresh session and sets HttpOnly refresh cookie
        ↓
Frontend stores access token in memory and user profile in auth state
        ↓
User enters role default route
```

## 7.4 Access-token refresh flow

```text
API request returns 401 because access token expired
        ↓
api.js calls POST /api/auth/refresh with credentials: include
        ↓
Laravel reads HttpOnly refresh cookie
        ↓
Laravel verifies hashed refresh token in refresh_tokens table
        ↓
Laravel checks user active status, session expiry, revoked state, and token family
        ↓
Laravel rotates refresh token
        ↓
Laravel returns new JWT access token
        ↓
api.js retries original request once
```

## 7.5 Logout flow

```text
User clicks logout
        ↓
Frontend calls POST /api/auth/logout
        ↓
Laravel revokes current refresh token/session
        ↓
Laravel clears refresh cookie
        ↓
Frontend clears access token and user state
        ↓
Reverb/Echo disconnects
        ↓
Frontend navigates to /login
```

## 7.6 Refresh expiry flow

```text
Refresh token expired or revoked
        ↓
POST /api/auth/refresh fails with 401
        ↓
Frontend clears access token and auth user state
        ↓
PWA keeps unsynced patrol records in IndexedDB
        ↓
Frontend shows session-expired message
        ↓
User performs full login + OTP again
        ↓
PWA sync resumes after authentication
```

---

## 8. Token Architecture

## 8.1 Access token


| Field     | Implemented behavior                                      |
| --------- | --------------------------------------------------------- |
| Type      | JWT                                                       |
| Lifetime  | `AUTH_ACCESS_TOKEN_TTL` minutes (default **30**)          |
| Storage   | `localStorage` key `access_token` + in-memory cache in `api.js` |
| Transport | `Authorization: Bearer <access_token>`                    |
| Purpose   | Protected Laravel API requests                            |
| Renewal   | `POST /api/auth/refresh`                                  |


### Access-token payload guidance

Keep JWT claims minimal. **Actual implementation** (`User::getJWTCustomClaims()`):

```json
{
  "principal_type": "user"
}
```

Standard JWT claims (`sub`, `iat`, `exp`) are added by the package. There is **no** `session_id` or `role` claim in the access token — role is loaded from the database on `auth/me` and login responses.

> **Planning note:** Earlier drafts suggested embedding `role` and `session_id` in the JWT; this was not implemented.

## 8.2 Refresh token


| Field               | Implemented behavior                                      |
| ------------------- | --------------------------------------------------------- |
| Type                | Opaque random token                                       |
| Lifetime            | `AUTH_REFRESH_TOKEN_TTL_HOURS` (default **12**)           |
| Storage in browser  | HttpOnly cookie (`AUTH_REFRESH_COOKIE_*`)                 |
| Storage in database | Hashed token only (`refresh_tokens.token_hash`)           |
| Rotation            | Rotate on every successful refresh                        |
| Revocation          | Logout, password/email/2FA change, admin disable (soft delete), reuse detection |


### Refresh-token cookie

**Configured defaults** (`config/auth_security.php`):

```text
Name: refresh_token          (AUTH_REFRESH_COOKIE_NAME)
HttpOnly: true
Secure: AUTH_REFRESH_COOKIE_SECURE (default false for local; true in HTTPS deploy)
SameSite: lax                (AUTH_REFRESH_COOKIE_SAME_SITE)
Path: /api/auth              (AUTH_REFRESH_COOKIE_PATH)
Max-Age: matches refresh TTL
```

For deployed HTTPS environments, set `AUTH_REFRESH_COOKIE_SECURE=true`.

## 8.3 Refresh token rotation

Each successful refresh (`RefreshTokenService`):

1. Verifies the current cookie token.
2. Marks the old token as rotated / revoked.
3. Creates a new token in the same token family.
4. Sets a new HttpOnly cookie.
5. Returns a new access JWT.

If a previously rotated token is reused, the family is revoked and the client must log in again; an audit event is recorded (`refresh_token_reuse_detected`).

---

## 9. Two-Factor Authentication Design

## 9.1 TOTP requirements


| Item           | Design                             |
| -------------- | ---------------------------------- |
| Method         | TOTP                               |
| App            | Google Authenticator or equivalent |
| Time step      | 30 seconds                         |
| Secret storage | Encrypted in Laravel database      |
| Enforcement    | Required for every normal login    |
| Setup          | Required during first login        |


## 9.2 TOTP setup process

```text
Laravel generates secret
        ↓
Laravel returns otpauth URI or QR payload
        ↓
Frontend displays QR code and manual setup key
        ↓
User scans authenticator app
        ↓
User submits OTP
        ↓
Laravel verifies OTP
        ↓
Laravel stores encrypted secret and enables 2FA
```

## 9.3 OTP verification rules

- Limit OTP attempts per login challenge.
- Reject reused OTP codes within the same time window where feasible.
- Expire login challenges quickly, for example after 5 minutes.
- Never return whether password or OTP was the specific failure reason in public error messages.
- Log failed OTP attempts with IP and user agent.

## 9.4 Lost 2FA device

Lost 2FA recovery must be admin-controlled:

```text
User reports lost device
        ↓
Admin verifies identity through offline process
        ↓
Admin resets 2FA for the user
        ↓
User must complete first-login-style 2FA setup again
```

Do not allow public self-service 2FA reset in the first implementation.

---

## 10. Authorization Model

## 10.1 Roles

The system uses the existing roles:


| Role              | Primary access                        |
| ----------------- | ------------------------------------- |
| Admin             | Full management and monitoring access |
| Security Operator | Monitoring and operator dashboards    |
| Guard             | Patrol PWA only                       |


## 10.2 Authorization layers

Use layered authorization:

```text
Laravel middleware / policies
        ↓
React route guards
        ↓
Sidebar menu filtering
        ↓
Component-level conditional rendering
```

The backend is authoritative. Frontend route guards improve UX but must not be treated as security enforcement.

---

## 11. PWA and Patrol Session Expiry Strategy

## 11.1 Problem being solved

A guard patrol can run longer than an access token. Access tokens remain short-lived for security; patrol and PWA sync continue while the refresh session is still valid.

## 11.2 Correct PWA behavior


| Situation                                       | Required behavior                                                     |
| ----------------------------------------------- | --------------------------------------------------------------------- |
| Access token valid                              | Protected request proceeds normally                                   |
| Access token expired                            | Refresh once, retry original request                                  |
| Refresh succeeds                                | Continue patrol/sync silently                                         |
| Refresh fails                                   | Keep local unsynced records, show session expired, require full login |
| Device offline                                  | Store logs locally and sync later                                     |
| Device returns online with expired access token | Refresh first, then flush queue                                       |
| User manually logs out                          | Stop protected sync, keep or clear local data based on business rule  |


## 11.3 PWA sync token flow

```text
IndexedDB sync_queue has pending location logs
        ↓
flushSyncQueue() starts
        ↓
api.js sends POST /api/pwa/sync
        ↓
401 returned
        ↓
api.js calls /auth/refresh
        ↓
If refresh succeeds: retry /pwa/sync
        ↓
If sync succeeds: mark queue item synced
        ↓
If refresh fails: keep queue item pending/failed and show session expired
```

## 11.4 Data protection rule

Patrol location logs are operational evidence. The frontend must not delete unsynced patrol logs merely because the access token expired.

---

## 12. Backend Folder Structure

> **Current runtime layout** (as implemented). An earlier planning tree listed `TwoFactorController`, `PasswordSetupController`, `AccessTokenService`, `AuthSessionInvalidator`, `TwoFactorRecoveryCode`, and a `two_factor_recovery_codes` migration — those were **never built**.

```text
backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/Api/
│   │   │   ├── AuthController.php
│   │   │   ├── AuthSessionController.php
│   │   │   ├── AuthAuditLogController.php
│   │   │   └── CameraAuthController.php
│   │   ├── Middleware/
│   │   │   ├── EnsureUserIsActive.php          # alias: active.user
│   │   │   ├── EnsureUserIsAdmin.php           # alias: admin
│   │   │   └── EnsureUserCanAccessPatrolMonitoring.php
│   │   └── Requests/
│   │       ├── CompletePasswordSetupRequest.php
│   │       ├── StartTwoFactorSetupRequest.php
│   │       ├── VerifyTwoFactorSetupRequest.php
│   │       ├── VerifyOtpRequest.php
│   │       └── CameraLoginRequest.php
│   │
│   ├── Models/
│   │   ├── User.php
│   │   ├── RefreshToken.php
│   │   ├── PasswordSetupToken.php
│   │   ├── TwoFactorSetupSession.php
│   │   ├── AuthLoginChallenge.php
│   │   └── AuthAuditLog.php
│   │
│   └── Services/Auth/
│       ├── RefreshTokenService.php
│       ├── TwoFactorService.php
│       ├── TwoFactorSetupService.php
│       ├── AuthLoginChallengeService.php
│       ├── PasswordSetupService.php
│       ├── AuthAuditService.php
│       ├── AuthAccountRecoveryService.php
│       ├── LoginRateLimiter.php
│       └── CameraAuthService.php
│
├── config/
│   └── auth_security.php
│
├── database/migrations/
│   ├── …_create_users_table.php
│   ├── …_create_refresh_tokens_table.php
│   ├── …_create_password_setup_tokens_table.php
│   ├── …_create_auth_login_challenges_table.php
│   ├── …_create_two_factor_setup_sessions_table.php
│   └── …_create_auth_audit_logs_table.php
│
├── routes/
│   └── api.php
│
└── tests/
    ├── Feature/   (Auth* flow / session / audit / hardening tests)
    └── Unit/Auth/ (RefreshTokenService, TwoFactorService, PasswordSetupService, …)
```

## 12.1 Backend structure rationale


| Folder                     | Rationale                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `Controllers/Api`          | Keep endpoint orchestration thin and consistent with current Laravel API style.        |
| `Requests`                 | Centralize validation and keep controllers readable.                                   |
| `Services/Auth`            | Token, 2FA, audit, and lockout logic are security business rules, not controller code. |
| `Models`                   | Keep refresh sessions, audit logs, and setup tokens queryable and testable.            |
| `config/auth_security.php` | Avoid scattering TTL, attempt limits, and cookie names across code.                    |
| `tests/Feature`            | Validate full endpoint behavior and middleware interaction.                            |
| `tests/Unit/Auth`          | Validate token rotation, OTP checks, and audit logging in isolation.                   |


---

## 13. Frontend Folder Structure

**Status: Implemented** (audited 2026-07-21). There is **no** `AuthContext.jsx`; session state uses `utils/auth.js` (localStorage + in-memory cache) and `feature/authentication/controllers/useAuthController.js`. There is **no** `feature/authentication/utils` directory.

The frontend follows the existing feature architecture:

```text
views → controllers → repositories → datasources → api.js → Laravel API
```

Actual structure (files that exist in the repository):

```text
frontend/
└── src/
    ├── api/
    │   ├── api.js
    │   └── authRefreshQueue.js
    │
    ├── feature/
    │   └── authentication/
    │       ├── components/
    │       │   ├── OtpInput.jsx
    │       │   ├── OtpVerificationForm.jsx
    │       │   ├── PasswordSetupForm.jsx
    │       │   ├── SessionExpiredDialog.jsx
    │       │   └── TwoFactorSetupCard.jsx
    │       │
    │       ├── controllers/
    │       │   ├── useAuthController.js
    │       │   ├── useOtpController.js
    │       │   ├── usePasswordSetupController.js
    │       │   └── useTwoFactorSetupController.js
    │       │
    │       ├── datasources/
    │       │   └── authService.js
    │       │
    │       ├── repositories/
    │       │   └── authRepository.js
    │       │
    │       └── views/
    │           ├── FirstLoginSetup.jsx
    │           ├── SetupTwoFactor.jsx
    │           └── VerifyOtp.jsx
    │
    ├── routes/
    │   └── guards/
    │       ├── ProtectedRoute.jsx
    │       ├── RoleProtectedRoute.jsx
    │       ├── GuestRoute.jsx
    │       └── RoleHomeRedirect.jsx
    │
    ├── utils/
    │   └── auth.js
    │
    └── views/pages/
        ├── authentication/
        │   ├── Login.jsx
        │   ├── Register.jsx          # template remnant; no public registration API
        │   ├── AuthWrapper1.jsx
        │   └── AuthCardWrapper.jsx
        └── auth-forms/
            ├── AuthLogin.jsx
            └── AuthRegister.jsx      # template remnant
```

Login UI: `views/pages/authentication/Login.jsx` renders `views/pages/auth-forms/AuthLogin.jsx`. First-login / 2FA / OTP screens live under `feature/authentication/views/`.

## 13.1 Frontend structure rationale


| Folder                         | Rationale                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `feature/authentication/views` | First-login setup, 2FA setup, OTP challenge screens.                                    |
| `controllers`                  | State, navigation, loading, and error behavior out of views (`useAuthController`, etc.). |
| `repositories`                 | Normalize Laravel response shapes and hide API details.                                 |
| `datasources`                  | Raw HTTP endpoint calls (`authService.js`).                                             |
| `components`                   | Reusable UI: OTP input/form, password setup, 2FA card, session-expired dialog.          |
| `utils/auth.js`                | Token/user localStorage helpers + role routing (`getDefaultRouteForRole`).              |
| `api/authRefreshQueue.js`      | Single-flight refresh when many requests receive 401 together.                          |
| `routes/guards`                | `ProtectedRoute`, `RoleProtectedRoute`, `GuestRoute`, role home redirect.               |


---

## 14. Database Design

## 14.1 `users` (current schema)

Account lifecycle uses Laravel **soft deletes**. There is **no** `users.is_active` boolean. Soft-deleted users (`deleted_at` set) are treated as disabled for login, refresh, and protected routes (`EnsureUserIsActive` / soft-delete checks).

Current auth-relevant columns (from migrations + `User` model):

```text
users
- id                            uuid primary key
- role_id                       uuid nullable FK → roles
- name
- email                         unique
- email_verified_at             timestamp nullable
- phone                         nullable
- address                       nullable
- password
- setup_required                boolean default false
- profile_picture_url           nullable
- two_factor_enabled            boolean default false
- two_factor_secret             text nullable (hidden)
- two_factor_confirmed_at       timestamp nullable
- profile_version               integer default 1
- last_password_changed_at      timestamp nullable
- last_security_changed_at      timestamp nullable
- created_at / updated_at
- deleted_at                    timestamp nullable (soft delete = disabled)
```

> **Not present on `users`:** `is_active`, `failed_login_attempts`, `locked_until`, `last_login_at`, `last_login_ip`, `last_login_user_agent`, `created_by`. Login lockout is tracked by `LoginRateLimiter` (cache keyed by email + IP), not user-table counters. Camera `last_login_at` lives on `cameras`, not `users`.

## 14.2 `refresh_tokens`

```text
refresh_tokens
- id                            uuid primary key
- user_id                       uuid foreign key → users (cascade)
- token_hash                    string indexed
- token_family                  uuid indexed
- device_name                   string nullable
- ip_address                    string nullable
- user_agent                    text nullable
- expires_at                    timestamp indexed
- revoked_at                    timestamp nullable indexed
- rotated_at                    timestamp nullable
- last_used_at                  timestamp nullable
- created_at / updated_at
```

Indexes created by the migration: `user_id`, `token_hash`, `token_family`, `expires_at`, `revoked_at`.

## 14.3 `auth_audit_logs`

```text
auth_audit_logs
- id                            uuid primary key
- user_id                       uuid nullable FK → users (null on delete)
- event_type                    string indexed
- status                        string nullable indexed
- email                         string nullable
- ip_address                    string nullable
- user_agent                    text nullable
- metadata                      json nullable
- occurred_at                   timestamp indexed
- created_at / updated_at
```

Event types are written by `AuthAuditService` (login, OTP, refresh, logout, password/2FA, session revoke, rate-limit, etc.).

## 14.4 `password_setup_tokens`

```text
password_setup_tokens
- id                            uuid primary key
- user_id                       uuid foreign key
- token_hash                    string indexed
- expires_at                    timestamp
- used_at                       timestamp nullable
- created_at
- updated_at
```

## 14.5 `auth_login_challenges`

Used for mandatory OTP after email/password on normal login (`AuthLoginChallengeService`).

```text
auth_login_challenges
- id                            uuid primary key
- user_id                       uuid foreign key (cascade)
- expires_at                    timestamp
- consumed_at                   timestamp nullable
- failed_attempts               unsigned integer (default 0)
- locked_at                     timestamp nullable
- ip_address                    string nullable
- user_agent                    text nullable
- created_at / updated_at
```

## 14.6 `two_factor_setup_sessions`

Used for first-login and reconfigure TOTP enrollment (`TwoFactorSetupService`).

```text
two_factor_setup_sessions
- id                            uuid primary key
- user_id                       uuid foreign key (cascade)
- token_hash                    string indexed
- pending_secret                text nullable
- expires_at                    timestamp
- verified_at                   timestamp nullable
- failed_attempts               unsigned integer (default 0)
- locked_at                     timestamp nullable
- created_at / updated_at
```

## 14.7 `two_factor_recovery_codes` — not implemented

> **Not implemented (by design).** There is no `two_factor_recovery_codes` table, model, or public self-service recovery-code API. Lost-device recovery is **admin-only** via `POST /api/auth/2fa/reset/{user}` (`AuthController@resetTwoFactor` + `AuthAccountRecoveryService`).

The planning sketch below is retained only for historical comparison and must not be treated as a current schema:

```text
# HISTORICAL / NOT BUILT
two_factor_recovery_codes
- id                            uuid primary key
- user_id                       uuid foreign key
- code_hash                     string
- used_at                       timestamp nullable
- created_at
- updated_at
```

---

## 15. API Design

## 15.1 Public or semi-public auth endpoints

These endpoints do not require an access token, but they must be rate-limited.


| Method | Endpoint                            | Purpose                                                                   |
| ------ | ----------------------------------- | ------------------------------------------------------------------------- |
| `POST` | `/api/auth/login`                   | Validate email/password and return OTP challenge or setup-required state. |
| `POST` | `/api/auth/otp/verify`              | Verify OTP and issue access token + refresh cookie.                       |
| `POST` | `/api/auth/refresh`                 | Rotate refresh token and issue new access token.                          |
| `POST` | `/api/auth/password-setup/complete` | Set permanent password and proceed to 2FA setup. |
| `POST` | `/api/auth/2fa/setup/start`         | Begin TOTP setup (returns `manual_key`, `otpauth_uri`).                  |
| `POST` | `/api/auth/2fa/setup/verify`        | Verify first OTP and enable 2FA; issues JWT + refresh cookie.            |


## 15.2 Protected auth endpoints

These require valid access token.


| Method   | Endpoint                     | Purpose                                              |
| -------- | ---------------------------- | ---------------------------------------------------- |
| `GET`    | `/api/auth/me`               | Return current authenticated user.                   |
| `POST`   | `/api/auth/logout`           | Revoke current refresh session and clear cookie.     |
| `POST`   | `/api/auth/logout-all`       | Revoke all user refresh sessions.                    |
| `GET`    | `/api/auth/sessions`         | List active refresh sessions for current user/admin. |
| `DELETE` | `/api/auth/sessions/{id}`    | Revoke a specific session.                           |
| `POST`   | `/api/auth/2fa/reset/{user}` | Admin reset of 2FA.                                  |
| `GET`    | `/api/auth/audit-logs`       | Admin audit log list.                                |


## 15.3 Response examples

### Password valid but OTP required

```json
{
  "success": true,
  "message": "OTP verification required.",
  "data": {
    "next_step": "otp_required",
    "login_challenge_id": "uuid",
    "expires_in": 300
  }
}
```

### First login setup required

```json
{
  "success": true,
  "message": "Account setup required.",
  "data": {
    "next_step": "password_setup_required",
    "setup_token_required": true
  }
}
```

### Login complete

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "access_token": "jwt-token",
    "token_type": "bearer",
    "expires_in": 1800,
    "user": {
      "id": "uuid",
      "name": "User Name",
      "email": "user@example.com",
      "role": {
        "id": "uuid",
        "name": "Guard"
      }
    }
  }
}
```

The refresh token is not returned in JSON when using HttpOnly cookies.

---

## 16. Frontend State and API Client Design

**Status: Implemented** (M1–M10). Prefer [`frontend/documentation.md`](frontend/documentation.md) §5–§6 for current behavior.

## 16.1 Auth state (as implemented)

There is no `AuthContext`. Auth state is split across:

```text
utils/auth.js
- getAuthToken / setAuthToken / clearAuthSession
- getAuthUser / setAuthUser / getAuthUserRole
- getDefaultRouteForRole / hasRole / hasAnyRole

useAuthController (feature/authentication/controllers/useAuthController.js)
- currentUser (from auth_user + storage sync)
- handleLogout
- cross-tab storage listener → disconnect Reverb + navigate /login
```

Login, OTP, and setup flows call `setAuthToken` + `setAuthUser` directly after successful verification (`AuthLogin`, `useOtpController`, `useTwoFactorSetupController`).

## 16.2 Access token storage (as implemented)

```text
accessToken: localStorage key access_token + in-memory cache in api.js
refreshToken: HttpOnly cookie (credentials: include on all API calls)
user: localStorage key auth_user (JSON) for route reload + header display
```

**Note:** Access token remains in `localStorage` for SPA reload resilience; refresh token is never readable from JavaScript.

## 16.3 Refresh queue

When multiple requests fail with `401`, the frontend must not call `/auth/refresh` many times in parallel.

Use a shared promise:

```text
Request A gets 401 → starts refresh
Request B gets 401 → waits for same refresh promise
Request C gets 401 → waits for same refresh promise
Refresh succeeds → A/B/C retry once
Refresh fails → A/B/C fail and session expires
```

## 16.4 API client behavior

**Implemented** `api.js` behavior:

```text
request()
  ↓
Send request with access token (credentials: include)
  ↓
If 2xx: return response
  ↓
If 401 and not already retried:
      call refreshSession() via shared authRefreshQueue promise
      retry original request once
  ↓
If refresh fails:
      clear auth session
      emit session-expired UX (SessionExpiredDialog / redirect to login)
```

## 16.5 PWA sync integration

`flushSyncQueue()` uses the shared API client and does **not** implement separate token logic.

Correct layering:

```text
flushSyncQueue()
    ↓
api.post('/pwa/sync', payload)
    ↓
api.js handles refresh and retry
    ↓
flushSyncQueue receives final success/failure
```

---

## 17. Security Controls

## 17.1 Password policy

**Configured** via `AUTH_PASSWORD_MIN_LENGTH` (default **12**) in `config/auth_security.php`. Password setup/change Form Requests enforce the configured minimum. Passwords are hashed with Laravel’s Hash facade (bcrypt by default).

## 17.2 Login rate limiting

**Configured** (`LoginRateLimiter` + `auth_security.php`):

```text
AUTH_LOGIN_MAX_ATTEMPTS = 5
AUTH_LOGIN_LOCK_MINUTES = 15
```

Lockout is keyed by normalized email + IP (cache), not `users.failed_login_attempts`. Soft-deleted users receive the same **401** as invalid credentials.

## 17.3 OTP protection

**Configured**:

```text
AUTH_OTP_MAX_ATTEMPTS = 5
AUTH_OTP_CHALLENGE_TTL = 5 minutes
```

Failed OTP attempts and locks are stored on `auth_login_challenges`. Successful OTP consumes the challenge.

## 17.4 Audit logging

`AuthAuditService` records auth and related security events to `auth_audit_logs` (`event_type`, `status`, email/IP/UA, metadata, `occurred_at`), including login/OTP/refresh/logout, setup and 2FA actions, rate-limit blocks, and session revocation.

## 17.5 Device and IP tracking

Refresh sessions store on `refresh_tokens`:

- IP address;
- user agent;
- optional device name;
- last used time;
- creation time;
- refresh-token family ID.

Audit rows also capture IP and user agent when available.

## 17.6 Disabled-user invalidation

When a user is **soft-deleted** (`deleted_at` set):

- new login is blocked (same generic **401** as invalid credentials);
- refresh fails;
- `EnsureUserIsActive` (`active.user`) rejects protected API access;
- refresh tokens for the user are revoked as part of disable/recovery flows.

There is **no** `users.is_active` boolean column. Account disablement uses Laravel soft deletes.

## 17.7 Password-change invalidation

When a user changes password (profile sensitive flow):

- refresh sessions are revoked;
- the client must perform full login + OTP again;
- an audit log row is written.

---

## 18. Implementation Milestones

> **Historical milestone plan.** Sections M0–M10 below retain the original incremental delivery plan for traceability. Prefer [`backend/documentation.md`](../backend/documentation.md) §6 and [`backend/docs/login/m10-final-hardening-testing-and-documentation-freeze.md`](../backend/docs/login/m10-final-hardening-testing-and-documentation-freeze.md) for current runtime contracts. Wording such as “Create …” or “Add …” in milestone bodies describes work **as planned at that milestone**, now completed unless marked otherwise.

The module was implemented level by level. Each milestone built one architecture layer with submilestones and passing criteria.

---

# M0 — Architecture Baseline and Current Auth Audit

## Goal

Document current authentication behavior and confirm the exact migration path.

## Submilestones

### M0.1 — Current route and token audit

**Tasks**

- Inspect `AuthController`, `routes/api.php`, `config/jwt.php`, `User` model, and auth-related frontend files.
- List current login, logout, `auth/me`, route guards, and `401` behavior.
- Confirm which modules rely on authenticated calls during patrol and monitoring.

**Passing criteria**

- A short implementation note lists current auth endpoints.
- The note identifies all protected patrol APIs affected by token expiry.
- No code changes required.

### M0.2 — Auth architecture document committed

**Tasks**

- Add `login-module.md` to the project documentation.
- Confirm the final folder structure and milestone order.

**Passing criteria**

- `login-module.md` exists.
- The document clearly states that refresh-token session safety is implemented before 2FA enforcement.

---

# M1 — Laravel Session Foundation and Refresh Tokens

## Goal

Introduce DB-backed refresh sessions without changing the login UI flow too much.

## Submilestones

### M1.1 — Database foundation

**Tasks**

- Create `refresh_tokens` migration.
- Add `RefreshToken` model and factory.
- Add `config/auth_security.php` for refresh TTL, cookie name, cookie flags, and rotation policy.

**Passing criteria**

- Migration runs successfully.
- `RefreshToken` model can create, revoke, and query active sessions.
- Tests confirm token hashes are stored, not raw tokens.

### M1.2 — RefreshTokenService

**Tasks**

- Create `App\Services\Auth\RefreshTokenService`.
- Generate opaque refresh tokens.
- Hash tokens before database storage.
- Validate active, unexpired, non-revoked tokens.
- Rotate token on refresh.
- Detect reuse of rotated/revoked token.

**Passing criteria**

- Unit tests cover create, validate, rotate, revoke, expire, and reuse detection.
- Raw refresh token is never stored in database.

### M1.3 — Refresh endpoint

**Tasks**

- Add `POST /api/auth/refresh`.
- Read refresh token from HttpOnly cookie.
- Return new access token.
- Rotate refresh cookie.
- Fail with `401` when cookie is missing, expired, revoked, or reused.

**Passing criteria**

- Feature test: valid refresh token returns new access token.
- Feature test: expired/revoked refresh token returns `401`.
- Feature test: old rotated token reuse revokes token family.

### M1.4 — Logout revocation

**Tasks**

- Update logout to revoke the current refresh session.
- Clear the refresh cookie.
- Keep local logout tolerant when backend is already unauthorized.

**Passing criteria**

- Logout revokes DB refresh token.
- Refresh after logout fails with `401`.
- Existing frontend logout still navigates to login.

---

# M2 — Frontend Refresh-on-401 Architecture

## Goal

Make the React API client refresh access tokens before redirecting to login.

## Submilestones

### M2.1 — Auth service and repository update

**Tasks**

- Add `authService.refresh()`.
- Add `AuthRepository.refreshSession()`.
- Ensure requests to `/auth/refresh` send cookies with `credentials: 'include'`.

**Passing criteria**

- Unit tests or mocked integration tests confirm refresh endpoint is called.
- Refresh token is not read from JavaScript.

### M2.2 — Refresh queue in API client

**Tasks**

- Add `authRefreshQueue.js` or equivalent shared refresh promise.
- Modify `api.js` to retry once after successful refresh.
- Prevent infinite retry loops.

**Passing criteria**

- If three requests get `401`, only one refresh request is sent.
- Original request retries once after refresh.
- If refresh fails, session is cleared and user is redirected.

### M2.3 — Session expired UX

**Tasks**

- Add `SessionExpiredDialog` or `/session-expired` view.
- Show a clear message when refresh session expires.
- Preserve unsynced PWA patrol data.

**Passing criteria**

- User sees a clear session-expired message.
- PWA `sync_queue` is not deleted by logout/expiry handling.

### M2.4 — LocalStorage migration step

**Tasks**

- Move access token toward memory state.
- Keep compatibility fallback only if needed for route reload.
- Avoid adding refresh token to localStorage.

**Passing criteria**

- Refresh token never appears in localStorage/sessionStorage.
- Access-token storage approach is documented clearly.

---

# M3 — Patrol Token Expiry Safety

## Goal

Prove that a guard can continue patrol sync when the access token expires but the refresh session remains valid.

## Submilestones

### M3.1 — PWA sync uses central API client

**Tasks**

- Confirm `flushSyncQueue()` uses the shared `api.js` client.
- Remove duplicate token handling from PWA sync code if any exists.
- Ensure cookie credentials are included for refresh requests.

**Passing criteria**

- PWA sync benefits from the same refresh-on-401 behavior as normal API calls.

### M3.2 — Patrol expiry integration test

**Tasks**

- Add backend test for expired access token + valid refresh token.
- Add frontend mocked test for `/pwa/sync` receiving `401`, refresh succeeding, and sync retry succeeding.

**Passing criteria**

- `POST /api/pwa/sync` succeeds after refresh retry.
- Queue item becomes synced/duplicate_synced instead of failed due to expired access token.

### M3.3 — Refresh failure behavior

**Tasks**

- Simulate expired refresh token during patrol.
- Ensure frontend keeps queue entries pending/failed but not deleted.
- Show session-expired UX.

**Passing criteria**

- Unsynced location logs remain in IndexedDB.
- User can log in again and retry sync.

---

# M4 — First Login Password Setup

## Goal

Implement admin-created user initialization before mandatory 2FA.

## Submilestones

### M4.1 — User setup state

**Tasks**

- Add or formalize `setup_required` and `password_changed_at` fields.
- Ensure Admin-created users start with setup required.

**Passing criteria**

- New user cannot access protected modules until setup is complete.
- Existing seeded/admin users can be migrated safely.

### M4.2 — Password setup token service

**Tasks**

- Create `PasswordSetupToken` model.
- Create `PasswordSetupService`.
- Generate temporary setup token or temporary password flow.
- Store token hash only.

**Passing criteria**

- Setup token expires.
- Used setup token cannot be reused.
- Raw setup token is not stored.

### M4.3 — Password setup frontend

**Tasks**

- Add `FirstLoginSetup.jsx`.
- Add password and confirm-password form.
- Apply client-side validation consistent with backend rules.

**Passing criteria**

- User with setup-required state is routed to setup page.
- Password setup success proceeds to 2FA setup.

---

# M5 — TOTP Two-Factor Authentication

## Goal

Implement mandatory TOTP setup and verification.

## Submilestones

### M5.1 — TwoFactorService

**Tasks**

- Generate TOTP secret.
- Generate QR/otpauth URI.
- Verify OTP.
- Encrypt TOTP secret before saving.

**Passing criteria**

- Unit tests verify valid OTP passes and invalid OTP fails.
- Stored secret is encrypted, not plaintext.

### M5.2 — 2FA setup endpoints

**Tasks**

- Add setup start endpoint.
- Add setup verify endpoint.
- Save `two_factor_enabled = true` only after OTP verification.

**Passing criteria**

- User cannot enable 2FA without successful OTP verification.
- User cannot access protected modules until setup completes.

### M5.3 — OTP login challenge

**Tasks**

- Modify `/auth/login` to return OTP challenge after password success.
- Add `/auth/otp/verify`.
- Issue tokens only after OTP success.

**Passing criteria**

- Email/password alone does not issue access token.
- Correct OTP issues access token and refresh cookie.
- Wrong OTP increments attempt count and can lock the challenge.

### M5.4 — Frontend OTP UI

**Tasks**

- Add `VerifyOtp.jsx`.
- Add reusable `OtpInput.jsx`.
- Route login users to OTP screen when required.

**Passing criteria**

- Login flow completes through email/password → OTP → role default page.
- Error states are clear and do not reveal sensitive details.

---

# M6 — Rate Limiting, Lockout, and OTP Protection

## Goal

Harden the authentication endpoints against brute force attempts.

## Submilestones

### M6.1 — Login rate limiter

**Tasks**

- Add `LoginRateLimiter` service.
- Rate limit by email + IP.
- Apply temporary lock after repeated failures.

**Passing criteria**

- 5 failed login attempts trigger lockout.
- Locked account receives safe generic error.
- Audit log records blocked attempt.

### M6.2 — OTP attempt limiter

**Tasks**

- Limit failed OTP attempts per challenge.
- Expire challenges after configured duration.

**Passing criteria**

- Too many OTP failures invalidates challenge.
- Expired challenge requires full login again.

### M6.3 — Disabled user enforcement

**Tasks**

- Ensure disabled users cannot login or refresh.
- Revoke sessions when user is disabled.

**Passing criteria**

- Disabled user login fails.
- Existing refresh token for disabled user fails.
- Protected API rejects disabled user as soon as practical.

---

# M7 — Auth Audit Logs and Session Monitoring

## Goal

Make authentication activity visible and defensible for security reporting.

## Submilestones

### M7.1 — AuthAuditService

**Tasks**

- Create `auth_audit_logs` table and model.
- Create `AuthAuditService`.
- Capture IP, user agent, action, status, and metadata.

**Passing criteria**

- Login success/failure writes audit rows.
- OTP success/failure writes audit rows.
- Refresh success/failure writes audit rows.
- Logout writes audit row.

### M7.2 — Session list and revoke APIs

**Tasks**

- Add `/auth/sessions` endpoint.
- Add revoke-session endpoint.
- Add logout-all endpoint.

**Passing criteria**

- User/admin can list current sessions according to role policy.
- Revoked session cannot refresh.

### M7.3 — Admin audit UI

**Tasks**

- Add auth audit list under Admin or Security section.
- Provide filters by user, action, status, and date.

**Passing criteria**

- Admin can view audit records.
- Sensitive token values are never displayed.

---

# M8 — Route Guards, Role Policies, and Middleware Hardening

## Goal

Ensure all protected functionality enforces active session and role permissions consistently.

## Submilestones

### M8.1 — Middleware review

**Tasks**

- Confirm all protected routes are inside `auth:api`.
- Add `EnsureUserIsActive` where needed.
- Confirm Admin-only routes use admin middleware.
- Confirm Admin/Security Operator routes use correct policy or middleware.

**Passing criteria**

- Guard cannot access Admin or operator-only APIs.
- Security Operator cannot access Admin-only mutation APIs.
- Disabled user cannot access protected APIs.

### M8.2 — Frontend guard alignment

**Tasks**

- Update `ProtectedRoute`, `RoleProtectedRoute`, and `GuestRoute` to use central auth state.
- Add setup-required routing.

**Passing criteria**

- Route access matches backend roles.
- Users with incomplete setup cannot bypass setup screens.

---

# M9 — Security Settings and Account Recovery Edge Cases

## Goal

Handle real operational account lifecycle cases.

## Submilestones

### M9.1 — Admin 2FA reset

**Tasks**

- Add Admin-only 2FA reset endpoint.
- Force user through 2FA setup after reset.
- Audit the reset action.

**Passing criteria**

- User cannot login normally after 2FA reset until setup is completed.
- Audit log identifies admin actor and target user.

### M9.2 — Password change session invalidation

**Tasks**

- Revoke refresh sessions after password change.
- Decide whether to preserve current session or require full login.

**Passing criteria**

- Old sessions cannot refresh after password change.
- Audit log records password change.

### M9.3 — Session management UI

**Tasks**

- Add UI for active sessions.
- Allow current user/admin to revoke sessions according to policy.

**Passing criteria**

- Revoking a session invalidates refresh for that device.
- UI does not expose raw tokens.

---

# M10 — Final Hardening, Testing, and Documentation Freeze

## Goal

Complete end-to-end testing and finalize Login Module documentation.

## Submilestones

### M10.1 — Backend test suite

**Tasks**

- Add feature tests for login, OTP, refresh, logout, lockout, disabled user, setup flow, and patrol token expiry.
- Add unit tests for auth services.

**Passing criteria**

- `php artisan test --filter=Auth` passes.
- `php artisan test --filter=PatrolTokenExpiryTest` passes.

### M10.2 — Frontend test suite

**Tasks**

- Add tests for login, OTP screen, refresh-on-401, session expired UX, and route guards.

**Passing criteria**

- `yarn test` passes for authentication tests.
- `yarn build` passes.

### M10.3 — Manual demo checklist

**Tasks**

- Prepare step-by-step demo:
  - admin creates user;
  - user performs first login setup;
  - user logs in with OTP;
  - token refresh occurs during patrol;
  - logout revokes refresh token;
  - disabled user is blocked.

**Passing criteria**

- Demo evidence screenshots or recordings are available.
- `login-module.md`, backend documentation, and frontend documentation are updated.

---

## 19. Recommended Implementation Order

> **Historical delivery order.** M0–M10 below are complete. Kept for project history; not a pending backlog.

Implement in this order:

1. **M0 — Architecture Baseline and Current Auth Audit**
2. **M1 — Laravel Session Foundation and Refresh Tokens**
3. **M2 — Frontend Refresh-on-401 Architecture**
4. **M3 — Patrol Token Expiry Safety**
5. **M4 — First Login Password Setup**
6. **M5 — TOTP Two-Factor Authentication**
7. **M6 — Rate Limiting, Lockout, and OTP Protection**
8. **M7 — Auth Audit Logs and Session Monitoring**
9. **M8 — Route Guards, Role Policies, and Middleware Hardening**
10. **M9 — Security Settings and Account Recovery Edge Cases**
11. **M10 — Final Hardening, Testing, and Documentation Freeze**

Rationale:

- Refresh-token foundation comes before 2FA because patrol token-expiry safety is an architectural risk.
- First-login setup comes before full OTP enforcement because users need a clean activation path.
- Audit and lockout are added after core flow exists so tests can cover real events.
- Final route hardening happens after the auth states are stable.

---

## 20. Configuration Plan

**Implemented:** `config/auth_security.php` exists and is the runtime source for TTLs, cookie settings, lockout, OTP, and password minimum length.

Current keys (defaults shown):

```php
return [
    'access_token_ttl_minutes' => env('AUTH_ACCESS_TOKEN_TTL', env('JWT_TTL', 30)),
    'refresh_token_ttl_hours' => env('AUTH_REFRESH_TOKEN_TTL_HOURS', 12),
    'refresh_cookie_name' => env('AUTH_REFRESH_COOKIE_NAME', 'refresh_token'),
    'refresh_cookie_secure' => env('AUTH_REFRESH_COOKIE_SECURE', false),
    'refresh_cookie_same_site' => env('AUTH_REFRESH_COOKIE_SAME_SITE', 'lax'),
    'refresh_cookie_path' => env('AUTH_REFRESH_COOKIE_PATH', '/api/auth'),

    'login_max_attempts' => env('AUTH_LOGIN_MAX_ATTEMPTS', 5),
    'login_lock_minutes' => env('AUTH_LOGIN_LOCK_MINUTES', 15),
    'otp_max_attempts' => env('AUTH_OTP_MAX_ATTEMPTS', 5),
    'otp_challenge_ttl_minutes' => env('AUTH_OTP_CHALLENGE_TTL', 5),

    'password_min_length' => env('AUTH_PASSWORD_MIN_LENGTH', 12),
    // … plus password-setup TTL, 2FA setup TTL, TOTP issuer/window, camera login limits
];
```

`.env.example` documents these variables. For deployed HTTPS environments, set:

```env
AUTH_REFRESH_COOKIE_SECURE=true
```

---

## 21. Testing Strategy

## 21.1 Backend tests


| Test file                       | Coverage                                   |
| ------------------------------- | ------------------------------------------ |
| `AuthTwoFactorTest.php`         | Setup, verify, OTP login, lockouts         |
| `AuthRefreshTokenTest.php`      | Refresh, rotation, expiry, reuse detection |
| `AuthPasswordSetupTest.php`     | First-login password setup                 |
| `AuthSessionMonitoringTest.php` | Session list, revoke, logout-all         |
| `PatrolTokenExpiryTest.php`     | PWA sync after expired access token        |
| `AuthRateLimitLockoutTest.php`  | Lockout and soft-deleted user              |
| `AuthAuditLogTest.php`          | Audit rows for auth events                 |
| `AuthSecuritySettingsTest.php`  | Admin 2FA reset, password invalidation     |
| `AuthFinalHardeningTest.php`    | M10 umbrella regression                    |
| `RefreshTokenServiceTest.php`, `TwoFactorServiceTest.php`, `PasswordSetupServiceTest.php` | Unit tests under `tests/Unit/Auth/` |
| `AuthRouteGuardHardeningTest.php` | Route / middleware hardening |
| `AuthCorsTest.php` | CORS auth edge cases |
| `AuthorizationTest.php` | Role authorization |


## 21.2 Frontend tests

Current inventory (paths relative to `frontend/src/`):


| Test file | Coverage |
| --------- | -------- |
| `views/pages/auth-forms/AuthLogin.test.jsx` | Login submission; routes `password_setup_required` → `/first-login/setup`, `two_factor_setup_required` → `/first-login/2fa`, `otp_required` → `/login/otp` without storing tokens; direct success stores JWT and navigates via `getDefaultRouteForRole` (canonical **`/dashboard`** for Admin, Security Operator, and Guard); lockout **429** messaging |
| `feature/authentication/controllers/useOtpController.test.jsx` | OTP verify success stores token and navigates via `getDefaultRouteForRole` (canonical **`/dashboard`**); failure shows backend error without setting session |
| `feature/authentication/controllers/usePasswordSetupController.test.jsx` | Password setup submit → `two_factor_setup_required` navigation; mismatched passwords blocked |
| `feature/authentication/controllers/useTwoFactorSetupController.test.jsx` | Start setup returns manual key / otpauth URI; verify success stores JWT; missing setup context handled |
| `feature/authentication/controllers/useAuthController.profileSync.test.jsx` | Profile-sync events update `currentUser` name / picture in auth hook state |
| `feature/authentication/components/SessionExpiredDialog.test.jsx` | Dialog opens on expired flag / `AUTH_SESSION_EXPIRED_EVENT`; dismissible; no sensitive sessionStorage |
| `feature/authentication/components/OtpInput.test.jsx` | Digit-only OTP input, max length, helper text |
| `feature/authentication/components/PasswordSetupForm.test.jsx` | Missing setup context copy; confirmation errors; submit wiring |
| `feature/authentication/datasources/authService.test.js` | Auth API adapters: refresh/password-setup/2FA/OTP envelopes; refresh fetch with credentials and no Authorization header |
| `api/api.test.js` | Bearer requests; 401 → single refresh retry (including parallel and `/pwa/sync`); no refresh on login/logout/refresh/403; `skipAuthRefresh` |
| `api/authRefreshQueue.test.js` | Single-flight refresh; success stores access token; failure clears session and throws `SessionExpiredError` |
| `routes/guards/ProtectedRoute.test.jsx` | Blocks setup-incomplete / 2FA-incomplete users; clears session and redirects to login |
| `routes/guards/GuestRoute.test.jsx` | Guests see login content; valid auth redirects to role home; incomplete setup treated as guest |
| `routes/guards/RoleProtectedRoute.test.jsx` | Role allow/deny; setup and 2FA gates before role check |
| `routes/guards/RoleHomeRedirect.test.jsx` | `/` redirects Admin / Security Operator / Guard to role home |
| `pwa/syncService.test.js` | `flushSyncQueue` via shared `api.js`; 401 refresh+retry; queue status `synced` / `duplicate_synced` / `failed` / `validation_failed`; queue preserved when refresh fails |


## 21.3 Manual smoke test

```text
1. Admin creates Guard user.
2. Guard performs password setup.
3. Guard sets up Google Authenticator TOTP.
4. Guard logs in with email/password + OTP.
5. Guard starts patrol.
6. Simulate expired JWT access token.
7. PWA sync request refreshes token and retries successfully.
8. Guard stops patrol and validation succeeds.
9. Guard logs out.
10. Refresh endpoint fails after logout.
11. Admin disables user.
12. User cannot login or refresh.
```

---

## 22. Final Acceptance Criteria

The Login Module is complete when:

- Public registration remains disabled.
- Admin-created accounts require first-login password setup.
- Mandatory TOTP setup is enforced before protected access.
- Normal login requires email/password and OTP.
- Access tokens are short-lived JWTs.
- Refresh sessions are DB-backed and revocable.
- Refresh tokens are stored hashed in the database.
- Refresh token is not stored in `localStorage`.
- Access-token expiry triggers silent refresh and one request retry.
- Refresh expiry forces full login and OTP again.
- PWA patrol sync survives access-token expiry while refresh session is valid.
- Unsynced patrol data is preserved when refresh fails.
- Logout revokes refresh session.
- Disabled users cannot login, refresh, or continue protected API use.
- Password change invalidates old sessions.
- Login and OTP attempts are rate-limited.
- Auth audit logs record key events with IP and device information.
- Admin can review sessions and auth audit logs.
- Backend and frontend tests pass.
- `backend/documentation.md` and `frontend/documentation.md` are updated after implementation.

---

## 23. Implementation Notes for Cursor / Coding Agent

When implementing milestones, follow these rules:

- Do not implement all milestones at once.
- Complete one milestone and its tests before moving to the next.
- Keep controllers thin.
- Put reusable security logic in `app/Services/Auth`.
- Do not store refresh tokens in JavaScript-readable storage.
- Do not delete PWA patrol sync data on token expiry.
- Preserve existing route names where possible.
- Preserve the existing frontend feature pattern.
- Add tests for every security-sensitive change.
- Update documentation after each completed milestone.

---

## 24. Design Justification for Report

This architecture is defensible because:

- **Admin-controlled accounts** prevent unauthorized public registration.
- **Mandatory 2FA** reduces the risk of credential theft.
- **Short-lived access tokens** reduce the exposure window of stolen tokens.
- **DB-backed refresh tokens** provide revocation, device tracking, and shift-aligned session control.
- **Refresh-token rotation** reduces replay risk.
- **PWA-safe refresh handling** supports long-running patrol workflows without weakening access-token expiry.
- **Audit logs** support investigation, accountability, and security evaluation.
- **Rate limiting and lockout** reduce brute-force risk.
- **Backend-authoritative authorization** prevents frontend route guards from becoming the only security layer.

