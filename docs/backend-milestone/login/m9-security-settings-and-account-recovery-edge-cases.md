# Login Module M9 — Security Settings and Account Recovery Edge Cases

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../documentation.md`](../../documentation.md) and [`../../../docs/system-update/m6-account-settings-two-tab-redesign.md`](../../../docs/system-update/m6-account-settings-two-tab-redesign.md) — `/account/security` redirects to `/account/profile?tab=security`.

**Status:** Implemented  
**Depends on:** M1 (refresh sessions), M2 (frontend refresh-on-401), M4 (first-login password setup), M5 (mandatory TOTP 2FA), M6 (rate limiting / OTP protection), M7 (auth audit logs and session monitoring), M8 (route guards and middleware hardening)  
**Target design reference:** [`../../../docs/login-module.md`](../../../docs/login-module.md)

---

## Objective

Close operational account-recovery and security-settings gaps so administrators can safely reset lost 2FA, password changes invalidate stale sessions, and every authenticated role can manage their own active sessions without exposing secrets.

---

## Scope

### In scope

- **Admin-controlled 2FA reset** (`POST /api/auth/2fa/reset/{user}`)
- **Password-change session invalidation** (refresh revocation + JWT `iat` check vs `last_password_changed_at`)
- **Security Settings UI** — at M9: standalone `/account/security`; **current:** `/account/profile?tab=security` (M6 redirect from `/account/security`) for all initialized roles (Admin, Security Operator, Guard)
- **Profile menu** entry: Security Settings
- **Audit events:** `two_factor_reset`, `password_changed`
- **Feature tests:** `AuthSecuritySettingsTest.php`
- **Frontend tests** for session service, session table, account security page, and route guard

### Out of scope

- Public self-service 2FA reset or recovery codes
- Email/SMS account recovery
- Admin “logout all” for another user’s sessions (existing per-session revoke APIs remain)
- Changes to M8 route-guard matrices beyond adding the shared account-security route

---

## Backend architecture

| Component | Responsibility |
|-----------|----------------|
| `AuthAccountRecoveryService` | Transactional admin 2FA reset: clear TOTP fields, delete pending setup/login challenges, revoke refresh sessions, audit |
| `AuthController::resetTwoFactor` | Thin Admin-only endpoint delegating to recovery service |
| `UserController::update` | On non-empty password: set `last_password_changed_at`, revoke target refresh sessions, audit `password_changed` |
| `EnsureUserIsActive` | Reject JWTs whose `iat` is at or before `last_password_changed_at` (uses `auth('api')->payload()`) |
| `AuthAuditService` | New constants `EVENT_TWO_FACTOR_RESET`, `EVENT_PASSWORD_CHANGED` with sanitized metadata |

```text
Admin POST /api/auth/2fa/reset/{user}
        ↓
AuthAccountRecoveryService (transaction, lock user)
        ↓
Clear 2FA + delete challenges + revoke refresh rows + audit
        ↓
Target must complete 2FA setup on next login (active.user blocks old JWTs)

Admin PATCH /api/users/{user} (password present)
        ↓
last_password_changed_at = now() + revoke all target refresh sessions + audit
        ↓
EnsureUserIsActive rejects access tokens issued before password change
```

---

## Frontend architecture

| Path | Role |
|------|------|
| `feature/account-security/views/AccountSecurityPage.jsx` | Security Settings page |
| `feature/account-security/controllers/useAccountSecurityController.js` | Sessions list, confirm dialogs, revoke current/all |
| `feature/auth-monitoring/*` | Reused `authMonitoringService`, `AuthMonitoringRepository`, `useAuthSessionController`, `AuthSessionTable` |

- **Route:** At M9, `/account/security` — `RoleProtectedRoute` with `ALL_ROLES`. **Current:** `/account/profile?tab=security` is canonical; `/account/security` redirects (M6).
- **Admin monitoring:** `/admin/auth-monitoring` Sessions tab unchanged (all-session Admin view)
- **Account security table:** `showUserColumn={false}` (current-user context)
- **Destructive actions:** confirmation dialog before revoke / revoke-all
- **Current session revoke:** clears auth state and navigates to `/login`
- **Profile dropdown:** Security Settings → `/account/profile?tab=security` (M6; at M9: `/account/security`)

---

## Admin 2FA reset flow

1. Admin calls `POST /api/auth/2fa/reset/{user}` (protected + `active.user` + `admin`).
2. Service locks target user, clears `two_factor_secret`, `two_factor_enabled`, `two_factor_confirmed_at`.
3. Pending `two_factor_setup_sessions` and `auth_login_challenges` for the target are deleted.
4. All active refresh sessions for the target are revoked.
5. Audit `two_factor_reset` records actor (`reset_by_user_id`) and target metadata.
6. Response returns sanitized `UserResource` only — no secrets, setup tokens, or token hashes.
7. Target’s next credential login returns `next_step = two_factor_setup_required`.
8. Existing JWTs for the target fail `active.user` (`two_factor_enabled = false`).

---

## Password-change invalidation flow

**Policy (strict M9):** Any password change revokes **all** refresh sessions for the target user. The current session is **not** preserved.

1. `PATCH /api/users/{user}` with non-empty `password` sets `last_password_changed_at = now()`.
2. `RefreshTokenService::revokeAllForUser()` runs for the target only.
3. Audit `password_changed` with `changed_by_user_id`, `target_user_id`, `revoked_count`.
4. `EnsureUserIsActive` compares JWT `iat` to `last_password_changed_at` timestamp; tokens issued in the same second or earlier are rejected (**403**).
5. Non-password updates do not revoke sessions or change `last_password_changed_at`.

---

## Session management UI flow

### Current user (Security Settings tab — `/account/profile?tab=security`; at M9: `/account/security`)

1. Authenticated user opens Security Settings from profile menu.
2. Page loads `GET /api/auth/sessions?scope=mine` (own sessions only, including for Admin).
3. Table shows device/IP, timestamps, status, current-session indicator.
4. **Revoke** calls `DELETE /api/auth/sessions/{session}` after confirmation.
5. **Revoke all sessions** calls `POST /api/auth/logout-all` after confirmation.
6. Revoking the current session clears local auth and redirects to `/login`.

### Admin (`/admin/auth-monitoring` → Sessions)

- Unchanged M7 behavior: list/filter all sessions, revoke per backend policy.

---

## Endpoints

| Method | URI | Middleware | Purpose |
|--------|-----|------------|---------|
| `POST` | `/api/auth/2fa/reset/{user}` | `auth:api`, `active.user`, `admin` | Admin resets target 2FA and revokes target sessions (**M9**) |
| `PATCH` | `/api/users/{user}` | `auth:api`, `active.user`, `admin` | Password change triggers session invalidation (**M9** enhancement) |
| `GET` | `/api/auth/sessions` | `auth:api`, `active.user` | List sessions. Non-admin: own only. Admin: all (optional `user_id` filter). **`scope=mine`**: caller's sessions only (all roles, **M9** account security). |
| `DELETE` | `/api/auth/sessions/{session}` | `auth:api`, `active.user` | Revoke session (reused) |
| `POST` | `/api/auth/logout-all` | `auth:api`, `active.user` | Revoke all caller sessions (reused) |

---

## Audit events

| Event | Status | Metadata (sanitized) |
|-------|--------|----------------------|
| `two_factor_reset` | `success` | `target_user_id`, `target_user_email`, `reset_by_user_id`, `revoked_count` |
| `password_changed` | `success` | `target_user_id`, `target_user_email`, `changed_by_user_id`, `revoked_count` |

Never stored: passwords, tokens, OTPs, TOTP secrets, setup tokens, cookie values, or Authorization headers.

---

## Security controls

- Admin-only 2FA reset; Guard and Security Operator receive **403**.
- Database transaction + `lockForUpdate` on target user during 2FA reset.
- No sensitive values in JSON responses, audit metadata, or UI.
- Password-change invalidation is strict: all refresh rows revoked; JWT `iat` gate on protected routes.
- Lost 2FA recovery remains **admin-controlled** only (no public recovery endpoints).

---

## Testing evidence

### Backend

```bash
php artisan test --filter=AuthSecuritySettingsTest   # 17 tests
php artisan test --filter=AuthSessionMonitoringTest
php artisan test --filter=AuthAuditLogTest
php artisan test --filter=AuthPasswordSetupTest
php artisan test --filter=AuthTwoFactorTest
php artisan test --filter=AuthRefreshTokenTest
php artisan test --filter=AuthRouteGuardHardeningTest
php artisan test --filter=Auth                        # 166 tests
```

`AuthSecuritySettingsTest` covers: admin 2FA reset, role restrictions, field clearing, session revocation, refresh failure after reset/password change, old JWT blocked after password change, audit metadata, secret non-exposure, non-password updates unchanged, admin session preserved when changing another user’s password.

### Frontend

```bash
yarn test
yarn build
```

Focused M9 tests: `authMonitoringService.test.js`, `AuthMonitoringComponents.test.jsx` (session table), `AccountSecurityPage.test.jsx`, `AccountSecurityRoute.test.jsx`.

---

## Manual verification checklist

- [ ] Admin resets a Guard’s 2FA; Guard cannot access protected APIs until 2FA is re-enrolled.
- [ ] Guard/Operator receive **403** on `POST /api/auth/2fa/reset/{user}`.
- [ ] Admin changes user password; old refresh cookie and old access token fail.
- [ ] Admin name-only user update does not sign out the target.
- [ ] Guard opens **Security Settings** from profile; sees own sessions without token hashes.
- [ ] Revoking current session signs user out to `/login`.
- [ ] Revoke all sessions signs user out everywhere.
- [ ] Admin Auth Monitoring → Sessions still works for cross-user session admin view.

---

## Known limitations / future improvements

- JWT `iat` is second-granularity; tokens issued in the same second as a password change are invalidated (intentionally strict).
- No bulk admin “reset 2FA” UI on user management (API only); can be added in a later milestone.
- No self-service recovery codes or email/SMS recovery.
- Account Settings menu item remains a placeholder; only Security Settings is wired in M9.
