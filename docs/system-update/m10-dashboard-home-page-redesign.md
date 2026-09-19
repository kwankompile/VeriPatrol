# M10 — Dashboard / Home Page Redesign

**Milestone:** M10  
**Status:** **Complete** (runtime 500 fix applied 2026-07-02)  
**Date:** 2026-07-02

---

## 1. Milestone Summary

M10 replaces the Berry template dashboard (`Earning`, `Total Income`, demo charts) with a **role-aware operational home page** backed by Laravel data.

**Problem solved:** After login, Admin, Security Operator, and Guard users previously landed on either a fake template dashboard (Admin) or feature-specific pages without a unified operational overview. Guards and operators had no shared Home entry, and monitoring data was only available on deep-linked feature routes.

**What changed:**

- Added `GET /api/dashboard/summary` — authenticated, role-filtered summary API.
- Added `frontend/src/feature/dashboard/` — view → controller → repository → datasource architecture.
- `/dashboard` is accessible to **Admin**, **Security Operator**, and **Guard**.
- All three roles default to `/dashboard` after login or root redirect.
- Sidebar includes a Dashboard/Home entry for every initialized role.

---

## 2. Scope

| Area | Delivered |
|------|-----------|
| Backend dashboard summary API | Yes |
| Frontend role-aware dashboard module | Yes |
| Admin operational dashboard | Yes |
| Security Operator monitoring dashboard | Yes |
| Guard operational dashboard (own patrol + PWA readiness) | Yes |
| Role access boundaries (backend-enforced) | Yes |
| Backend + frontend tests | Yes |
| Milestone documentation | Yes |

**Out of scope (not started):** M11–M13 follow-up work, AI ANPR changes, Solidity changes.

---

## 3. Backend Implementation

### 3.1 Route

Added inside the existing `auth:api` + `active.user` group (not Admin-only):

```php
Route::get('dashboard/summary', [DashboardController::class, 'summary'])
    ->name('dashboard.summary');
```

**File:** `backend/routes/api.php`

### 3.2 Controller and service

| File | Responsibility |
|------|----------------|
| `app/Http/Controllers/Api/DashboardController.php` | Authenticated entry point; standard `{ success, message, data }` envelope |
| `app/Services/Dashboard/DashboardSummaryService.php` | Role-aware aggregation and safe field shaping |

### 3.3 Summary data sources

| Metric / section | Source models / logic |
|------------------|----------------------|
| Total users | `User` count (soft-deleted excluded) |
| Active patrols | `PatrolSession` where `status = active` |
| Patrols needing review | Sessions with checkpoint events in `partial`, `needs_review`, `suspicious`, `missed` (legacy `uncertain` / `rejected` included) |
| Today ANPR detections | `AnprEvent` where `detection_time` within app timezone day bounds |
| Flagged ANPR | Today's events with `is_flagged = true` |
| Camera health | `Camera` — `last_seen_at`, `is_active`, `credential_enabled` thresholds (online ≤2 min, recently seen ≤15 min) |
| Blockchain health | `BlockchainRecord` status counts (no raw payloads) |
| Auth alerts | `AuthAuditLog` failed/blocked auth events (24h window) |
| Guard patrol data | `PatrolSession` filtered by authenticated `user_id` only |

### 3.4 Role-specific payload behavior

- **Admin:** Full operational summary — users, patrol, ANPR, camera health, blockchain counts, auth alerts, recent lists.
- **Security Operator:** Monitoring subset — patrol + ANPR + optional safe camera health counts. No users, blockchain admin data, or auth audit details.
- **Guard:** Own patrol sessions only — active session, today status, recent sessions, readiness hints. No ANPR, camera, blockchain, auth, or other users' patrols.

### 3.5 Security and privacy rules

- Protected by `auth:api` and `active.user` (same as other user APIs).
- Role filtering occurs in `DashboardSummaryService` (backend source of truth).
- Responses exclude passwords, password hashes, refresh tokens, OTP/TOTP secrets, private keys, raw blockchain canonical payloads, camera passwords, and unmasked RTSP credentials.
- ANPR list fields are limited to safe monitoring attributes (plate, confidence, time, camera name, flags).
- Patrol review labels use neutral wording (`Needs review`, `Attention required`, `Incomplete patrol`) unless status is actually `suspicious`.

---

## 4. Frontend Implementation

### 4.1 Feature folder structure

```text
frontend/src/feature/dashboard/
  components/
    DashboardMetricCard.jsx
    DashboardSectionCard.jsx
    DashboardActionCard.jsx
    DashboardStatusList.jsx
    DashboardRecentAnprList.jsx
    DashboardPatrolList.jsx
    DashboardCameraHealth.jsx
    DashboardPwaReadiness.jsx
    DashboardRoleHeader.jsx
  controllers/useDashboardController.js
  datasources/dashboardService.js
  repositories/DashboardRepository.js
  utils/dashboardFormatters.js
  views/DashboardHome.jsx
```

`views/dashboard/Default/index.jsx` is a thin re-export of `DashboardHome` (Option A — minimal route churn).

### 4.2 Route and menu changes

| Change | Detail |
|--------|--------|
| `/dashboard` route | `allRoles(<DashboardDefault />)` in `MainRoutes.jsx` |
| Default home (`getDefaultRouteForRole`) | All roles → `/dashboard` |
| Guard menu | Dashboard + Patrol |
| Operator menu | Dashboard + Patrol + monitoring items |
| Admin menu | Unchanged structure (already included Dashboard) |

### 4.3 Admin dashboard behavior

- Metric cards: users, active patrols, review queue, ANPR today/flagged, camera online/offline, blockchain in-flight/failed, auth alerts.
- Sections: recent ANPR, active patrols, review queue, camera health, blockchain health, auth alerts.
- Action cards link to Patrol Monitoring, ANPR Monitoring, Camera/Vehicle/User Management, Blockchain Monitoring, Auth Monitoring.

### 4.4 Security Operator dashboard behavior

- Monitoring metrics and sections only.
- Quick links: Patrol Monitoring, ANPR Monitoring.
- No admin management shortcuts.

### 4.5 Guard dashboard behavior

- Start/resume patrol CTA → `/patrol`.
- Active session and today patrol status from backend.
- PWA readiness: online/offline (`useNetworkStatus`), pending/failed `db.sync_queue` counts.
- No ANPR, other guards' patrols, camera, blockchain, or auth data.

### 4.6 Loading, empty, error, and refresh (M5)

| State | Behavior |
|-------|----------|
| Initial load | `DashboardMetricsSkeleton` |
| Refresh | Previous cards remain visible; `LinearProgress` indicator |
| Empty | Contextual `ContentEmptyState` |
| Error | `ContentErrorState` with retry; no noisy repeated alerts on refresh failure |
| Overlapping refresh | Controller ignores concurrent refresh requests |

---

## 5. API Contract

### `GET /api/dashboard/summary`

**Authentication:** `Authorization: Bearer <user_jwt>`  
**Middleware:** `auth:api`, `active.user`

#### Success `200`

```json
{
  "success": true,
  "message": "Dashboard summary retrieved successfully.",
  "data": {
    "role": "Admin",
    "generated_at": "2026-07-02T10:00:00+08:00",
    "timezone": "Asia/Kuala_Lumpur",
    "summary": {
      "total_users": 42,
      "active_patrols": 3,
      "patrols_needing_review": 2,
      "today_anpr_detections": 128,
      "flagged_anpr_detections": 4,
      "camera_health": {
        "online": 5,
        "recently_seen": 1,
        "offline": 1,
        "inactive": 0,
        "total": 7
      },
      "blockchain": {
        "pending": 1,
        "queued": 0,
        "processing": 0,
        "submitted": 1,
        "failed": 0,
        "confirmed": 10,
        "in_flight": 2
      },
      "auth_alerts": {
        "failed_attempts_24h": 7,
        "suspicious_events_24h": 1
      }
    },
    "sections": {
      "recent_anpr_events": [],
      "active_patrol_sessions": [],
      "patrol_sessions_needing_review": [],
      "camera_health": {},
      "blockchain_health": {},
      "auth_alerts": []
    }
  }
}
```

#### Role-based sections

| Section | Admin | Security Operator | Guard |
|---------|:-----:|:-----------------:|:-----:|
| `recent_anpr_events` | Yes | Yes | No |
| `active_patrol_sessions` | Yes (all) | Yes (all) | No |
| `patrol_sessions_needing_review` | Yes | Yes | No |
| `active_patrol` | No | No | Yes (own) |
| `today_patrol_sessions` | No | No | Yes (own) |
| `recent_patrol_sessions` | No | No | Yes (own) |
| `camera_health` | Yes | Yes (counts only) | No |
| `blockchain_health` | Yes | No | No |
| `auth_alerts` | Yes | No | No |

#### Errors

| Code | Condition |
|------|-----------|
| 401 | Missing or invalid JWT |
| 403 | `active.user` rejection (setup incomplete, 2FA incomplete, disabled user, stale JWT) |
| 500 | Unexpected server error (safe message only) |

---

## 6. Role Access Matrix

| Data / Action | Admin | Security Operator | Guard |
|---------------|------:|------------------:|------:|
| Total users | Yes | No | No |
| Active patrols | Yes | Yes | Own only |
| Patrols needing review | Yes | Yes | Own only if applicable |
| Recent ANPR detections | Yes | Yes | No |
| Flagged vehicles | Yes | Yes | No |
| Camera health | Yes | Optional safe summary | No |
| Blockchain health | Yes | No | No |
| Auth alerts | Yes | No | No |
| Start/resume patrol | Yes | Yes (via `/patrol` route) | Yes |
| User/camera/vehicle management shortcuts | Yes | No | No |

---

## 7. Security and Privacy Notes

- API responses are role-filtered server-side; frontend route guards are supplementary only.
- Camera health returns aggregate counts — no credentials, RTSP URLs, or management fields.
- Blockchain section exposes status counts only — not `payload_summary`, private keys, or RPC configuration.
- Auth alert rows include safe metadata only (`event_type`, `status`, `email`, `occurred_at`).
- Guard responses never include other users' patrol sessions.

---

## 8. Testing Evidence

### Commands run

```bash
# Backend
php artisan test --filter=Dashboard
php artisan test --filter=Auth
php artisan test --filter=Patrol
php artisan test --filter=Anpr

# Frontend
npx vitest run src/feature/dashboard
npx vitest run src/routes/guards
npm run build
```

### Results

| Suite | Result |
|-------|--------|
| `DashboardSummaryTest` (11 tests) | **Passed** |
| `--filter=Auth` (204 tests) | **Passed** |
| `--filter=Patrol` (78 tests) | **Passed** |
| `--filter=Anpr` (112 tests) | **Passed** |
| `src/feature/dashboard` (10 tests) | **Passed** |
| `src/routes/guards` (includes updated `RoleHomeRedirect`) | **Passed** |
| `npm run build` | **Passed** |

**Known unrelated failures:** None observed in the executed suites during M10 verification.

### Runtime 500 fix (2026-07-02 follow-up)

**Root cause:** `DashboardSummaryService::cameraHealthCounts()` selected `cameras.credential_enabled`, which was absent on databases that had not yet applied the M1 migration `2026_07_01_100000_add_camera_credentials_to_cameras_table.php`. Laravel logged `SQLSTATE[42S22]: Column not found: 1054 Unknown column 'credential_enabled'`.

**Fix applied:**

- `cameraHealthCounts()` now uses `Schema::hasColumn()` / `Schema::hasTable()` and only selects columns that exist; legacy databases without `credential_enabled` treat cameras as credential-enabled for health bucketing.
- `blockchainHealthCounts()` and `authAlertSummary()` degrade to safe zero/empty values when tables or queries fail.
- Nullable/legacy field formatting hardened for patrol, ANPR, and auth alert rows.

**Migration required for full camera credential features (recommended):**

```bash
php artisan migrate
```

This applies `2026_07_01_100000_add_camera_credentials_to_cameras_table` (and related pending migrations). The dashboard endpoint works without it after the service hardening, but camera credential management and machine auth expect the migrated schema.

**Regression tests added:**

- All three roles return `200` on minimal seeded-like data.
- Legacy sqlite simulation: dashboard succeeds when `credential_enabled` column is dropped after seeding a camera row.
- Null `last_seen_at`, inactive cameras, null patrol `ended_at`, and null auth alert `email` do not crash the endpoint.

---

## 9. Acceptance Criteria Checklist

- [x] Backend role-aware `GET /api/dashboard/summary` endpoint complete
- [x] Protected by `auth:api` + `active.user`
- [x] Admin dashboard uses real Laravel data
- [x] Operator dashboard uses monitoring data only
- [x] Guard dashboard uses own operational data only
- [x] No template/fake Berry metrics remain on `/dashboard`
- [x] M5 loading/empty/error/refresh behavior followed
- [x] Role separation covered by backend tests
- [x] Frontend layout and repository tests pass
- [x] `npm run build` passes
- [x] M10 documentation exists at this path

---

## 10. Known Limitations / Follow-Up

- **Guard PWA queue counts** are read from IndexedDB on the client; the backend does not return `unsynced_log_count` (frontend supplements locally as specified).
- **Operator camera health** is aggregate counts only — no per-camera drill-down on the dashboard (use Camera Management for Admin).
- **Dashboard does not replace** dedicated monitoring pages (`/admin/patrol-monitoring`, `/admin/anpr-monitoring`) — it links to them via action cards.
- **Empty-state heuristic** on the frontend treats a single-user database as "low activity" for the global empty banner; metric cards still render when data exists.

---

## Related documentation

- [`m0-api-contract-draft.md`](m0-api-contract-draft.md) — Section 7 Dashboard Summary API
- [`m0-role-access-matrix.md`](m0-role-access-matrix.md) — Dashboard route and API rows updated for M10
- [`../frontend/documentation.md`](../frontend/documentation.md) — Dashboard module status
- [`../backend/documentation.md`](../backend/documentation.md) — Dashboard summary route
