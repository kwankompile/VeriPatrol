# M0 — Test Plan Freeze

> Historical milestone snapshot (2026-06-30).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`m3-ai-anpr-credential-migration.md`](./m3-ai-anpr-credential-migration.md) and [`system-update-roadmap.md`](../system-update-roadmap.md).

**Milestone:** M0.3  
**Status:** Frozen baseline (recorded before implementation)  
**Date:** 2026-06-30  
**Recorded by:** M0 audit execution on 2026-06-30

---

## 1. Purpose

This document freezes the test commands and baseline results to run after each major milestone. M0 records **baseline** coverage at the 2026-06-30 audit; later milestones add tests listed in Section 5.

---

## 2. Required Test Commands (per milestone gate)

### 2.1 Backend (Laravel)

Run from `backend/`:

```bash
php artisan test --filter=Camera
php artisan test --filter=Anpr
php artisan test --filter=Auth
php artisan test --filter=Patrol
php artisan test --filter=Pwa
php artisan test --filter=Profile
```

Full regression (M13):

```bash
php artisan test
```

### 2.2 Frontend (React + Vitest)

Run from `frontend/`:

```bash
npx vitest run src/feature/management-camera
npx vitest run src/feature/profile
npx vitest run src/feature/patrol src/feature/patrol-monitoring
```

Full regression (M13):

```bash
npx vitest run
npm run build
```

### 2.3 AI ANPR (Python)

Run from `anpr/`:

```bash
pytest
python main.py check-config
python main.py run --source video --video samples/videos/test_vehicle.mp4 --dry-run
```

Post-M3 backend-enabled smoke:

```bash
python main.py flush-backend-queue
```

---

## 3. M0 Baseline Execution Results

Recorded on **2026-06-30** in the development environment.

### 3.1 Backend

| Filter | Result | Tests | Assertions | Duration | Notes |
|--------|--------|-------|------------|----------|-------|
| `Camera` | **PASS** | 2 | 22 | ~4.3s | No dedicated Camera CRUD suite — matches blockchain unsupported-entity + guard tests |
| `Anpr` | **PASS** | 92 | 403 | ~381s | Includes `AnprMonitoringTest`, `AnprVehicleLinkingTest`, `AnprM14RegressionTest`, `AnprBlockchainIntegrationTest` |
| `Auth` | **PASS** | 189 | 714 | ~102s | Login, OTP, refresh, sessions, audit, rate limit, CORS, guards |
| `Patrol` | **PASS** | 68 | 245 | ~82s | Validation, sessions, routes, token expiry, broadcast, summary, blockchain |
| `Pwa` | **PASS** | 13 | 59 | ~1.2s | `PwaSyncTest` |
| `Profile` | **PASS** | 195 (194 pass, 1 skip) | 951 | ~680s | Full `--filter=Profile` includes profile feature + blockchain regression matches |

### 3.2 Frontend

| Command | Result | Notes |
|---------|--------|-------|
| `npx vitest run src/feature/profile` | **PASS** | 8 test files in profile module |
| `npx vitest run src/feature/management-camera` | **N/A** | Module does not exist — expected failure/no tests until M4 |
| `npx vitest run src/feature/patrol src/feature/patrol-monitoring` | **N/A** | Zero test files in these modules |

### 3.3 AI ANPR

| Command | Result | Notes |
|---------|--------|-------|
| `pytest` | **PASS** | 75 tests in ~1.1s |
| `python main.py check-config` | Not re-run in M0 | Use before M3 migration |
| Dry-run video | Not re-run in M0 | M13 demo requirement |

---

## 4. M0 Baseline Coverage Summary

> **Missing** and **N/A** entries below reflect the **M0 baseline (2026-06-30)**, not present-day gaps. Items marked implemented in later milestones (M1–M15) are noted inline.

### 4.1 Backend — covered areas (M0 baseline)

| Area | Test files | Coverage quality |
|------|------------|------------------|
| Auth login/OTP/refresh | 10 feature + 3 unit | **Strong** |
| Profile step-up/security | 11 feature + 1 unit | **Strong** |
| ANPR monitoring + linking | 3 feature + blockchain | **Strong** |
| Patrol validation | `PatrolValidationTest` + related | **Good** |
| PWA sync + token expiry | `PwaSyncTest`, `PatrolTokenExpiryTest` | **Good** |
| Blockchain ANPR integration | `AnprBlockchainIntegrationTest` | **Good** |
| Camera CRUD | `CameraCrudTest` | **Implemented** (M1) |
| Camera auth/login | `CameraAuthTest` | **Implemented** (M1) |
| Camera token scope | `CameraAuthTest`, `CameraAnprWriteTest` | **Implemented** (M1–M2) |
| Dashboard summary | — | **Missing at M0** (M10) |

### 4.2 Frontend — covered areas (M0 baseline)

| Area | Tests | Coverage quality |
|------|-------|------------------|
| Profile module | 8+ files | **Strong** |
| Auth/profile sync | Related guard tests | **Moderate** |
| ANPR monitoring | Some component tests | **Moderate** |
| Blockchain monitoring | Some component tests | **Moderate** |
| Camera management | None | **Missing at M0** (M4) |
| Patrol home | None | **Missing at M0** |
| Patrol monitoring | None | **Missing at M0** |
| Dashboard | None | **Missing at M0** (M10) |
| Shared UI states (M5) | None | **Missing at M0** (M5) |

### 4.3 AI ANPR — covered areas (M0 baseline)

| Area | Tests | Coverage quality |
|------|-------|------------------|
| Config validation | `test_config.py` | **Good** |
| Queue read/write/retry | `test_backend_queue.py` | **Good** |
| Integration CLI | `test_integration.py` | **Moderate** |
| Tracking/OCR | `test_tracking_and_voting.py`, etc. | **Good** |
| Camera login HTTP | — | **Missing at M0** (M3) |
| 401 re-login flow | — | **Missing at M0** (M3) |
| Token cache reuse (HTTP) | Partial (file I/O only) | **Weak at M0** |
| Old queue `camera_id` migration | — | **Missing at M0** (M3) |
| Multipart evidence upload | — | **Missing at M0** (M9) |

---

## 5. New Tests Required by Future Milestone

### M1 — Backend Camera Credential Foundation

| Test | Type | Acceptance |
|------|------|------------|
| `CameraCrudTest` | Feature | Admin CRUD; operator forbidden |
| `CameraAuthLoginTest` | Feature | Valid credentials → JWT; disabled → 403 |
| `CameraAuthRateLimitTest` | Feature | 429 after repeated failures |
| `CameraMigrationTest` | Feature | Fresh + existing DB migrate |
| `CameraModelTest` | Unit | Password hidden from JSON |

### M2 — Camera-Authenticated ANPR Write

| Test | Type | Acceptance |
|------|------|------------|
| `CameraAnprEventStoreTest` | Feature | Post without `camera_id`; event uses token camera |
| `CameraAnprCrossCameraTest` | Feature | 403 on another camera's event |
| `CameraAnprImageUploadTest` | Feature | Upload + blockchain anchor still fires |
| `CameraAnprLogTest` | Feature | Stage logs for own event only |
| `AnprBlockchainIntegrationTest` (extend) | Feature | Camera principal creates proof |

### M3 — AI ANPR Credential Migration

| Test file | Acceptance |
|-----------|------------|
| `test_camera_auth.py` | Login to `/camera-auth/login`, cache reuse |
| `test_config.py` (extend) | New env vars; old vars deprecated warnings |
| `test_backend_queue.py` (extend) | Payload without `camera_id`; old queue jobs |
| `test_integration.py` (extend) | `check-config` with camera credentials |

### M4 — Frontend Camera Management

| Test | Acceptance |
|------|------------|
| `management-camera` repository/controller tests | CRUD normalize responses |
| Route guard test | Non-admin → `/forbidden` |
| Form validation tests | Password optional on edit |

### M5 — Shared UI States

| Test | Acceptance |
|------|------------|
| Skeleton/Empty/Error component tests | Render variants |
| Management page integration | State transitions |

### M6 — Account Settings Tabs

| Test | Acceptance |
|------|------------|
| Tab query param persistence | `?tab=security` |
| Notification relocation | Profile tab controls |

### M7 — PWA

| Test | Acceptance |
|------|------------|
| Manifest icon presence | Build output check |
| Workbox config test | POST not cached (existing `pwa/` tests if any) |

### M8 — Patrol Validation Tuning

| Test | Acceptance |
|------|------------|
| False-positive reproduction | Road-following route not `suspicious` |
| GPS quality filter cases | Low accuracy discounted |
| New status enum | `needs_review`, `partial` |

### M10 — Dashboard

| Test | Acceptance |
|------|------------|
| `DashboardSummaryTest` | Role-scoped fields |
| Frontend dashboard controller test | Normalize API response |

### M12 — Security Hardening

| Test | Acceptance |
|------|------------|
| `CameraTokenScopeTest` | Full negative matrix (Section 11 of role matrix) |
| Credential rotation revokes token | Old JWT fails |

---

## 6. Per-Milestone Test Gate (minimum)

| After milestone | Required commands |
|-----------------|-------------------|
| M1 | `Camera`, `Auth` |
| M2 | `Camera`, `Anpr`, `Auth` |
| M3 | `pytest`, `Anpr` (backend), AI `check-config` |
| M4 | `management-camera` vitest, `Camera` |
| M5–M6 | `profile` vitest + affected feature tests |
| M7 | `Pwa`, frontend build |
| M8–M9 | `Patrol`, patrol vitest (when added) |
| M10 | `Dashboard` filter (new), full Auth guards |
| M12 | `Camera`, `Auth`, `Anpr` + camera scope suite |
| M13 | Full backend + frontend + pytest + manual E2E checklist |

---

## 7. Known Gaps and Instabilities

| Gap | Severity | Action |
|-----|----------|--------|
| `--filter=Profile` matches blockchain regression tests | Low | Document; consider `--testsuite=Profile` directory run in M13 |
| `--filter=Camera` only 2 tests today | High | Add M1 CRUD suite |
| `management-camera` vitest fails until M4 | Expected | Skip in M0–M3 gates |
| Full `php artisan test` runtime | Medium | Document duration in M13 if >10 min |
| ANPR filter ~6 min | Medium | Acceptable; run in CI parallel |

---

## 8. Manual Smoke Checklist (M13 reference)

1. Admin creates camera credential in UI.
2. AI logs in via `/camera-auth/login` with RTSP URL.
3. Detection creates event without `camera_id` in payload.
4. Evidence uploads; blockchain proof appears.
5. ANPR monitoring live row updates without refresh.
6. Guard patrol + PWA sync still uses user JWT refresh.
7. Camera token rejected on `/profile` and `/blockchain-records`.

---

## 9. M0 Freeze Checklist

- [x] Backend filter commands documented with baseline results
- [x] Frontend filter commands documented
- [x] `pytest` baseline recorded (75 pass)
- [x] Current coverage gaps identified
- [x] Future milestone test requirements listed
- [x] No test code changed during M0
