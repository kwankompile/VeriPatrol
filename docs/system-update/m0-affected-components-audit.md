# M0 — Affected Components Audit

> **Historical M0 baseline (2026-06-30).** File change expectations and §7.1 authentication flow describe the pre-implementation inventory. Camera-authenticated ANPR (M1–M3), camera management UI (M4), and related items are **implemented** — see §7.2 and milestone docs.

**Milestone:** M0.1  
**Status:** Frozen baseline  
**Date:** 2026-06-30

This document inventories files affected by the System Update across all repositories. Files are grouped by change expectation in future milestones.

**Legend:** `NEW` = to be created | `MODIFY` = expected change | `READ` = consumed unchanged | `DEPRECATE` = phased removal

---

## 1. Summary Counts

| Repository | MODIFY | NEW | READ (reference) |
|------------|--------|-----|------------------|
| backend | 28 | 12 | 45+ |
| frontend | 22 | 18 | 30+ |
| anpr | 6 | 2 | 10+ |
| blockchain | 0 | 0 | 8 |
| root docs | 2 | 5 | 3 |

---

## 2. Backend — `backend`

### 2.1 Routes and bootstrap

| File | M0 status | Future |
|------|-----------|--------|
| `routes/api.php` | READ | MODIFY — camera-auth routes, dashboard summary, ANPR middleware |
| `bootstrap/app.php` | READ | MODIFY — register camera middleware alias |

### 2.2 Authentication (frozen — do not weaken)

| File | M0 status | Future |
|------|-----------|--------|
| `app/Http/Controllers/Api/AuthController.php` | READ | READ — no camera changes |
| `app/Http/Controllers/Api/AuthSessionController.php` | READ | READ |
| `app/Http/Controllers/Api/AuthAuditLogController.php` | READ | READ |
| `app/Http/Middleware/EnsureUserIsActive.php` | READ | READ |
| `app/Http/Middleware/EnsureUserIsAdmin.php` | READ | READ |
| `app/Http/Middleware/EnsureUserCanAccessPatrolMonitoring.php` | READ | READ |
| `app/Services/Auth/AuthLoginChallengeService.php` | READ | READ |
| `app/Services/Auth/RefreshTokenService.php` | READ | READ |
| `app/Services/Auth/LoginRateLimiter.php` | READ | READ — pattern for camera limiter |
| `app/Services/Auth/TwoFactorService.php` | READ | READ |
| `app/Services/Auth/TwoFactorSetupService.php` | READ | READ |
| `app/Services/Auth/PasswordSetupService.php` | READ | READ |
| `app/Services/Auth/AuthAuditService.php` | READ | READ |
| `app/Services/Auth/AuthAccountRecoveryService.php` | READ | READ |
| `config/auth_security.php` | READ | READ |
| `config/auth.php` | READ | MODIFY — add camera guard provider |
| `config/jwt.php` | READ | MODIFY — camera TTL if separate |

### 2.3 Camera (primary M1–M2 surface)

| File | M0 status | Future |
|------|-----------|--------|
| `app/Models/Camera.php` | READ | MODIFY — credential fields, hidden attrs |
| `app/Http/Controllers/Api/CameraController.php` | READ | MODIFY — resource wrapper, credential handling |
| `app/Http/Requests/StoreCameraRequest.php` | READ | MODIFY — email, password, credential_enabled |
| `app/Http/Requests/UpdateCameraRequest.php` | READ | MODIFY |
| `database/migrations/2026_05_07_170000_create_cameras_table.php` | READ | READ — baseline schema |
| `database/migrations/*_add_camera_credentials_*.php` | — | NEW (M1) |
| `database/factories/CameraFactory.php` | READ | MODIFY |
| `app/Services/Auth/CameraAuthService.php` | — | NEW (M1) |
| `app/Http/Controllers/Api/CameraAuthController.php` | — | NEW (M1) |
| `app/Http/Requests/CameraLoginRequest.php` | — | NEW (M1) |
| `app/Http/Middleware/EnsureRequestIsAuthenticatedCamera.php` | — | NEW (M1) |

### 2.4 ANPR

| File | M0 status | Future |
|------|-----------|--------|
| `app/Http/Controllers/Api/AnprEventController.php` | READ | MODIFY — camera principal, `camera_id` resolution |
| `app/Http/Controllers/Api/AnprImageController.php` | READ | MODIFY — camera-scoped upload |
| `app/Http/Controllers/Api/AnprEventLogController.php` | READ | MODIFY — camera-scoped logs |
| `app/Services/Anpr/AnprVehicleLinker.php` | READ | READ |
| `app/Services/Anpr/AnprImageFileService.php` | READ | READ |
| `app/Models/AnprEvent.php` | READ | READ |
| `app/Models/AnprImage.php` | READ | READ |
| `app/Models/AnprEventLog.php` | READ | READ |

### 2.5 Blockchain integration (read-only for camera auth)

| File | M0 status | Future |
|------|-----------|--------|
| `app/Services/Blockchain/BlockchainAnprIntegrationService.php` | READ | READ — must still be invoked |
| `app/Jobs/AnchorBlockchainRecordJob.php` | READ | READ |
| `app/Services/Blockchain/BlockchainRecordService.php` | READ | READ |
| `app/Services/Blockchain/BlockchainRetryService.php` | READ | READ |
| `app/Services/Blockchain/BlockchainVerificationService.php` | READ | READ |

### 2.6 Patrol and PWA

| File | M0 status | Future |
|------|-----------|--------|
| `app/Services/PatrolValidationService.php` | READ | MODIFY (M8) |
| `app/Http/Controllers/Api/PatrolSessionController.php` | READ | READ — validate response envelope stable |
| `app/Http/Controllers/Api/PwaSyncController.php` | READ | READ |
| `app/Http/Requests/SyncPwaLocationLogRequest.php` | READ | READ |
| `app/Services/LocationLogTimestampService.php` | READ | READ |
| `app/Http/Controllers/Concerns/AuthorizesPatrolOwnership.php` | READ | READ |
| `app/Services/Patrol/PatrolSessionSummaryService.php` | READ | READ |
| `app/Services/Patrol/PatrolBroadcastService.php` | READ | READ |

### 2.7 Profile (no camera impact)

| File | M0 status | Future |
|------|-----------|--------|
| `app/Http/Controllers/Api/ProfileController.php` | READ | READ |
| `app/Services/Profile/*` | READ | READ |
| `app/Http/Requests/Profile/*` | READ | READ |
| `config/profile.php` | READ | READ |

### 2.8 Dashboard (M10)

| File | M0 status | Future |
|------|-----------|--------|
| `app/Http/Controllers/Api/DashboardController.php` | — | NEW (M10) |
| `app/Services/Dashboard/DashboardSummaryService.php` | — | NEW (M10) |

### 2.9 Backend tests

| File | Filter | M0 notes |
|------|--------|----------|
| `tests/Feature/Auth*.php` (10 files) | Auth | 189 tests pass |
| `tests/Feature/Anpr*.php` (3 files) | Anpr | 92 tests pass |
| `tests/Feature/Blockchain/AnprBlockchainIntegrationTest.php` | Anpr | Included |
| `tests/Feature/Patrol*.php` (6 files) | Patrol | 68 tests pass |
| `tests/Feature/PwaSyncTest.php` | Pwa | 13 tests pass |
| `tests/Feature/Profile/*.php` (11 files) | Profile | Large suite |
| `tests/Feature/AuthRouteGuardHardeningTest.php` | Camera | Operator forbidden `POST /cameras` |
| `tests/Unit/Blockchain/*Camera*` | Camera | 2 tests — unsupported entity hashing |
| — | Camera | **No dedicated Camera CRUD tests** |

---

## 3. Frontend — `frontend`

### 3.1 Routing and menu

| File | M0 status | Future |
|------|-----------|--------|
| `src/routes/MainRoutes.jsx` | READ | MODIFY — camera route, dashboard, account tabs |
| `src/routes/AuthenticationRoutes.jsx` | READ | READ |
| `src/routes/guards/ProtectedRoute.jsx` | READ | READ |
| `src/routes/guards/RoleProtectedRoute.jsx` | READ | READ |
| `src/menu-items/admin.js` | READ | MODIFY — uncomment camera item |
| `src/menu-items/getMenuItemsForRole.js` | READ | READ |
| `src/utils/auth.js` | READ | READ |

### 3.2 Camera management (M4 — missing at M0)

| Path | M0 status | Future |
|------|-----------|--------|
| `src/feature/management-camera/**` | **MISSING** | NEW entire module |
| `src/feature/patrol-history/components/Camera*` | READ | DEPRECATE / do not wire |

### 3.3 Monitoring (low change)

| Path | M0 status | Future |
|------|-----------|--------|
| `src/feature/anpr-monitoring/**` | READ | MODIFY (M11 polish) |
| `src/feature/patrol-monitoring/**` | READ | MODIFY (M5, M9) |
| `src/feature/blockchain-monitoring/**` | READ | MODIFY (M5 states) |
| `src/feature/auth-monitoring/**` | READ | MODIFY (M5 states) |

### 3.4 Patrol and PWA

| Path | M0 status | Future |
|------|-----------|--------|
| `src/feature/patrol/**` | READ | MODIFY (M5, M9) |
| `src/pwa/**` | READ | MODIFY (M7) |
| `vite.config.mjs` | READ | MODIFY (M7 manifest/icons) |

### 3.5 Profile and account

| Path | M0 status | Future |
|------|-----------|--------|
| `src/feature/profile/**` | READ | MODIFY (M6 tabs) |
| `src/feature/account-security/**` | READ | MODIFY (M6 merge/redirect) |

### 3.6 Dashboard

| Path | M0 status | Future |
|------|-----------|--------|
| `src/views/dashboard/Default/**` | READ | MODIFY (M10) |
| `src/feature/dashboard/**` | **MISSING** | NEW (M10) |

### 3.7 Shared UI (M5)

| Path | M0 status | Future |
|------|-----------|--------|
| `src/ui-component/state/PageSkeleton.jsx` | **MISSING** | NEW |
| `src/ui-component/state/TableSkeleton.jsx` | **MISSING** | NEW |
| `src/ui-component/state/EmptyState.jsx` | **MISSING** | NEW |
| `src/ui-component/state/ErrorState.jsx` | **MISSING** | NEW |
| `src/ui-component/state/DataStateGuard.jsx` | **MISSING** | NEW |

### 3.8 Frontend tests

| Path | M0 status |
|------|-----------|
| `src/feature/profile/**/*.test.*` | 8 test files — passing |
| `src/feature/management-camera/**` | **No tests — module absent** |
| `src/feature/patrol/**` | **No tests** |
| `src/feature/patrol-monitoring/**` | **No tests** |
| `src/feature/anpr-monitoring/**/*.test.*` | Exists |
| `src/feature/blockchain-monitoring/**/*.test.*` | Exists |

---

## 4. AI ANPR — `anpr`

| File | M0 status | Future |
|------|-----------|--------|
| `.env.example` | READ | MODIFY (M3) |
| `config.py` | READ | MODIFY — new env vars, validation |
| `backend.py` | READ | MODIFY — camera login, payload |
| `anpr.py` | READ | READ |
| `main.py` | READ | READ |
| `tests/test_backend_queue.py` | READ | MODIFY |
| `tests/test_config.py` | READ | MODIFY |
| `tests/test_camera_auth.py` | — | NEW (M3) |
| `docs/m7-backend-client-and-queue-architecture.md` | READ | MODIFY post-M3 |
| `docs/m0-project-foundation-architecture.md` | READ | Stale vs implementation — note only |

---

## 5. Blockchain — `blockchain`

| File | M0 status | Future |
|------|-----------|--------|
| `blockchain-module.md` | READ | READ |
| `docs/m10-anpr-module-integration.md` | READ | READ |
| `docs/m6-ganache-anchoring-end-to-end.md` | READ | READ |
| `docs/m7-retry-and-failure-handling.md` | READ | READ |
| `docs/m8-verification-system.md` | READ | READ |
| `docs/m11-blockchain-monitoring-frontend.md` | READ | READ |
| Smart contracts / Hardhat project | READ | READ — no camera auth coupling |

---

## 6. Root documentation

| File | M0 status | Future |
|------|-----------|--------|
| `system-update-roadmap.md` | READ | READ — source of truth |
| `login-module.md` | READ | READ |
| `blockchain/blockchain-module.md` | READ | READ |
| `docs/system-update/m0-*.md` | NEW | Frozen at M0 |
| `backend/documentation.md` | READ | UPDATE post-M13 only |
| `frontend/documentation.md` | READ | **Updated** (M4–M10, auth, PWA, tests — 2026-07-09) |

---

## 7. Current vs Planned Authentication Flow

### 7.1 Historical M0 baseline (pre-M1–M3)

> **Correction:** Resolved by M1–M3. Do not use this flow in new deployments.

```text
AI ANPR
  → POST /api/auth/login (user email/password + OTP path not used by machine)
  → GET /api/cameras/{ANPR_BACKEND_CAMERA_ID}
  → POST /api/anpr-events { camera_id, plate_number, ... }
  → POST /api/anpr-images OR /anpr-events/{id}/images/upload
```

### 7.2 Planned (M1–M3) — **Implemented**

Camera-authenticated ANPR flow is live. See [`m2-camera-authenticated-anpr-write-api.md`](./m2-camera-authenticated-anpr-write-api.md) and [`m3-ai-anpr-credential-migration.md`](./m3-ai-anpr-credential-migration.md).

```text
AI ANPR
  → POST /api/camera-auth/login { email, password, rtsp_url }
  → receive camera JWT + camera id/name
  → POST /api/anpr-events { plate_number, ... }  // no camera_id
  → POST evidence routes (camera-scoped)
```

---

## 8. Files Explicitly Out of Scope for System Update

- User registration flows (disabled by design)
- Ethereum contract source (unless hash schema changes — not planned)
- Guard patrol ownership model
- Profile step-up OTP implementation
- Reverb/Echo channel authorization (unless dashboard adds channels in M10)

---

## 9. Audit Checklist (M0.1 Passing Criteria)

- [x] Backend routes for auth, ANPR, camera, patrol, PWA, profile documented
- [x] Frontend routes and menus documented
- [x] AI ANPR env, config, backend client documented
- [x] Blockchain compatibility confirmed
- [x] Affected file list produced
- [x] No code behavior changed
