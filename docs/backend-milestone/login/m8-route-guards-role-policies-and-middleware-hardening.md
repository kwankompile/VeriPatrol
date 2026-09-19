# Login Module M8 — Route Guards, Role Policies, and Middleware Hardening

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/login-module.md`](../../../docs/login-module.md) and [`../../documentation.md`](../../documentation.md).

**Status:** Implemented  
**Depends on:** M1 (refresh sessions), M2 (frontend refresh-on-401), M3 (PWA sync), M4 (password setup), M5 (TOTP), M6 (rate limiting / lockout), M7 (auth audit logs and session monitoring)  
**Target design reference:** [`../../../docs/login-module.md`](../../../docs/login-module.md)

---

## Objective

Ensure all protected functionality enforces **active session state** and **role permissions** consistently across Laravel middleware and React route guards. The backend remains the security authority; frontend guards provide UX-only enforcement aligned with backend policy.

---

## Scope

### In scope

- `EnsureUserIsActive` middleware on the protected API group
- Route-level role hardening for Admin-only, monitoring read, and patrol operational endpoints
- Shared `RoleAccess` helper for reusable role checks
- Centralized frontend auth session resolver (`getAuthSessionState`)
- Refactored route guards using the central resolver
- Backend and frontend regression tests
- Documentation updates

### Out of scope (deferred to M9+)

- Admin 2FA reset / account recovery
- Password-change session invalidation policy
- Full Laravel policy framework for every controller action
- Admin logout-all for other users’ sessions beyond existing session APIs
- Audit log export

---

## Architecture summary

```text
Public auth routes (login, refresh, logout, setup, OTP)
        ↓
Protected API group: auth:api + active.user
        ↓
├── All active roles: auth/me, sessions, patrol operational writes, zones/checkpoints read
├── patrol.monitoring: Admin + Security Operator monitoring reads
└── admin: Admin-only management and ANPR ingestion mutations
```

Frontend mirrors the same role intent through `getAuthSessionState()` and `RoleProtectedRoute` matrices in `MainRoutes.jsx` and sidebar menu filtering.

---

## Backend active-user middleware

**Class:** `App\Http\Middleware\EnsureUserIsActive`  
**Alias:** `active.user` (registered in `bootstrap/app.php`)

Applied to all protected routes:

```php
Route::middleware(['auth:api', 'active.user'])->group(function (): void {
    // ...
});
```

**Public routes remain outside this group:**

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/password-setup/complete`
- `POST /api/auth/2fa/setup/start`
- `POST /api/auth/2fa/setup/verify`
- `POST /api/auth/otp/verify`

### Behavior

| Condition | HTTP | Message |
|-----------|------|---------|
| No authenticated API user | **401** | `Unauthenticated.` |
| Soft-deleted / disabled user | **403** | `Forbidden.` |
| `setup_required === true` | **403** | `Forbidden.` |
| `two_factor_enabled !== true` | **403** | `Forbidden.` |

The middleware re-reads the user from the database (including trashed) and does **not** revoke tokens or expose sensitive account details.

---

## Backend role / endpoint access matrix

| Area | Admin | Security Operator | Guard |
|------|:-----:|:-----------------:|:-----:|
| User / role management | Yes | No | No |
| Vehicle management | Yes | No | No |
| Camera management | Yes | No | No |
| Zone / checkpoint **mutations** | Yes | No | No |
| Zone / checkpoint **read** (patrol operational) | Yes | Yes | Yes |
| Auth audit logs | Yes | No | No |
| Own session list / revoke / logout-all | Yes | Yes | Yes |
| Admin session filtering / revoke any session | Yes | No | No |
| Patrol operational writes (session store, routes, checkpoint events, PWA sync) | Yes | Yes | Yes |
| Patrol monitoring list/detail routes | Yes | Yes | No |
| ANPR monitoring read APIs | Yes | Yes | No |
| ANPR ingestion / mutation APIs | Yes | No | No |
| Blockchain monitoring read APIs | Yes | Yes | No |
| Blockchain retry | Yes | No | No |

### Important rules preserved

- **Guards** retain patrol workflow: start session, submit routes/checkpoint events, sync PWA logs, summary/validate on own sessions.
- **Guards** cannot access operator/admin monitoring lists (patrol sessions index, ANPR index, blockchain index).
- **Security Operators** can read monitoring APIs but cannot mutate admin resources or ingest ANPR events.
- **AI runtime ingestion** via `POST /api/anpr-events` is **Admin-only**; the AI backend client must authenticate as an Admin (or equivalent service account under the current role model).

### Middleware aliases

| Alias | Class | Purpose |
|-------|-------|---------|
| `active.user` | `EnsureUserIsActive` | Fully initialized, non-disabled users |
| `admin` | `EnsureUserIsAdmin` | Admin role only |
| `patrol.monitoring` | `EnsureUserCanAccessPatrolMonitoring` | Admin + Security Operator monitoring |

### Shared helper

**Class:** `App\Support\RoleAccess`

- `isAdmin(User $user): bool`
- `isSecurityOperator(User $user): bool`
- `isGuard(User $user): bool`
- `canAccessMonitoring(User $user): bool`
- `hasAnyRole(User $user, array $roles): bool`

`PatrolChannelAuthorizer` delegates to `RoleAccess` for broadcast channel authorization consistency.

---

## Patrol / PWA ownership hardening (M8 follow-up)

Operational patrol and PWA endpoints enforce **session ownership** in addition to route-level role checks.

**Helper:** `App\Http\Controllers\Concerns\AuthorizesPatrolOwnership`

| Role | Operational patrol/PWA access |
|------|------------------------------|
| **Admin / Security Operator** | Monitoring oversight — may access any patrol session for read/monitoring flows already allowed by M8 |
| **Guard** (and other non-monitoring roles) | May only create, update, validate, summarize, sync, or mutate data for patrol sessions owned by the authenticated user |

**Rules:**

- Guard patrol session `store` ignores client-supplied `user_id` and persists the authenticated user as owner.
- Guard PWA sync rejects mismatched `userId` or `patrolId` payloads with **403 Forbidden**.
- Guard location log list/show is scoped to the authenticated user's records.
- Guards cannot reassign ownership-linking fields during updates (`user_id`, `patrol_session_id`, `checkpoint_event_id`); attempts return **403 Forbidden** and leave the record unchanged.
- Ownership failures return generic **403 Forbidden** without revealing whether a target session exists or belongs to another user.

---

## Frontend route guard behavior

**Central resolver:** `getAuthSessionState()` in `src/utils/auth.js`

Returns a stable object:

```js
{
  isAuthenticated,
  isFullyInitialized,
  hasValidRole,
  role,
  user,
  reason // missing_token | missing_user | setup_required | two_factor_required | invalid_role | valid
}
```

Existing helpers (`validateAuthSession`, `isAuthUserSetupRequired`, `isAuthUserTwoFactorEnabled`, `getAuthUserRole`, `hasAnyRole`, `getDefaultRouteForRole`) delegate to or align with this resolver.

### Guard behavior

| Guard | Behavior |
|-------|----------|
| `ProtectedRoute` | Missing token → `/login`; invalid/incomplete session → clear storage → `/login` |
| `RoleProtectedRoute` | Same as protected, plus wrong role → `/forbidden` |
| `GuestRoute` | Valid session → role default route; any non-valid state except missing token → `clearAuthSession()` → guest page (includes token-only stale sessions) |
| `RoleHomeRedirect` | Valid session → role default route |

Setup/OTP/first-login routes remain **route-state-only** (no setup/OTP tokens in `localStorage` / `sessionStorage`).

---

## Frontend route matrix

| Route | Allowed roles |
|-------|---------------|
| `/dashboard` | Admin |
| `/admin/management-user` | Admin |
| `/admin/management-zone` | Admin |
| `/admin/management-checkpoint` | Admin |
| `/admin/management-vehicle` | Admin |
| `/admin/auth-monitoring` | Admin |
| `/admin/patrol-monitoring` | Admin, Security Operator |
| `/admin/anpr-monitoring` | Admin, Security Operator |
| `/admin/blockchain-monitoring` | Admin |
| `/patrol` | Admin, Security Operator, Guard |

Sidebar menus (`getMenuItemsForRole.js`) remain aligned with these routes.

---

## Files changed

### Backend

- `app/Http/Middleware/EnsureUserIsActive.php` *(new)*
- `app/Http/Controllers/Concerns/AuthorizesPatrolOwnership.php` *(new, M8 follow-up)*
- `app/Support/RoleAccess.php` *(new)*
- `app/Support/PatrolChannelAuthorizer.php`
- `app/Http/Middleware/EnsureUserIsAdmin.php`
- `app/Http/Middleware/EnsureUserCanAccessPatrolMonitoring.php`
- `app/Http/Controllers/Api/AuthSessionController.php`
- `bootstrap/app.php`
- `routes/api.php`
- `database/factories/UserFactory.php`
- `tests/Concerns/CreatesPatrolUsers.php`
- `tests/Feature/AuthRouteGuardHardeningTest.php` *(new; extended in M8 follow-up)*
- `tests/Feature/AuthTwoFactorTest.php`
- `tests/Feature/CheckpointEventMetricTest.php`

### Frontend

- `src/utils/auth.js`
- `src/routes/guards/ProtectedRoute.jsx`
- `src/routes/guards/RoleProtectedRoute.jsx`
- `src/routes/guards/GuestRoute.jsx`
- `src/routes/guards/RoleHomeRedirect.jsx`
- `src/utils/auth.test.js`
- `src/routes/guards/RoleHomeRedirect.test.jsx` *(new)*

### Docs

- `docs/login/m8-route-guards-role-policies-and-middleware-hardening.md` *(this file)*
- `documentation.md` (backend + frontend, selective updates)

---

## Security decisions

1. **Backend authority:** Role enforcement on API routes via middleware; controller-level patrol monitoring checks retained as defense in depth.
2. **Active-user gate:** Incomplete setup or missing 2FA cannot access protected APIs even with a valid JWT from an earlier state.
3. **Disabled users:** Soft-deleted users receive **403 Forbidden** without token revocation in middleware (existing refresh/login flows handle invalidation elsewhere).
4. **ANPR ingestion:** Admin-only at route level; AI clients must use Admin credentials.
5. **No secret persistence:** Frontend continues to avoid storing refresh/setup/OTP tokens in JS-readable storage.
6. **Generic error messages:** Active-user rejections use `Forbidden.` without exposing account state details.

---

## Tests performed

```bash
php artisan test --filter=AuthorizationTest
php artisan test --filter=AuthRouteGuardHardeningTest
php artisan test --filter=AuthAuditLogTest
php artisan test --filter=AuthSessionMonitoringTest
php artisan test --filter=AuthTwoFactorTest
php artisan test --filter=AuthRefreshTokenTest
php artisan test --filter=PatrolTokenExpiryTest
php artisan test --filter=Anpr
php artisan test --filter=Patrol
php artisan test --filter=BlockchainMonitoringApiTest

yarn test --run src/utils/auth.test.js src/routes/guards
yarn build
```

All listed suites passed at implementation time.

---

## Manual QA checklist

- [ ] Guard login → lands on `/patrol`; cannot open `/dashboard` or `/admin/*` monitoring pages (→ `/forbidden`)
- [ ] Security Operator login → lands on `/admin/patrol-monitoring`; cannot open user management or auth monitoring
- [ ] Admin login → full admin + monitoring access
- [ ] Stale `auth_user` without `two_factor_enabled: true` → cleared and redirected to `/login`
- [ ] Disabled user JWT → protected API returns **403**
- [ ] Setup-required user JWT → protected API returns **403**
- [ ] Guard can start patrol, sync location logs, and use zone/checkpoint reads
- [ ] Guard API calls to `/api/anpr-events` and `/api/patrol-sessions` (list) return **403**

---

## Known limitations / deferred work

- **M9:** Admin 2FA reset, password-change session invalidation, expanded session management UI
- **Guards** are limited to their own patrol sessions and derived patrol records; operational show/update/destroy on checkpoint events and patrol session destroy require ownership (Admin/Security Operator retain oversight access where allowed by the M8 matrix).
- **Patrol session destroy** remains available to admin/operator on any session; guards may destroy only their own sessions.
- **Route model binding** on Admin-only parameterized routes may return **404** for missing records before role middleware in some edge cases; authorization still denies successful mutation for non-admin roles when records exist
- **Full policy classes** per resource were not introduced; middleware + existing controller checks remain the pattern
