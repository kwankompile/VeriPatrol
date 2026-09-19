# M2 — Camera-Authenticated ANPR Write API

**Milestone:** M2  
**Status:** Implemented  
**Date:** 2026-07-01  
**Base URL:** `/api`

---

## 1. Objective

Allow the Python ANPR runtime to create ANPR events, upload evidence images, and write ANPR event logs using a **camera JWT** instead of a user JWT, while preserving admin write compatibility and strict camera ownership enforcement.

---

## 2. Scope

### Implemented

- Shared ANPR write routes with dual principal support (`auth.anpr-write`)
- Camera-authenticated `POST /api/anpr-events` without body `camera_id`
- Camera-authenticated evidence upload and metadata store
- Camera-authenticated `POST /api/anpr-event-logs`
- `POST /api/camera-auth/heartbeat` (plus retained `GET` for M1 compatibility)
- `last_seen_at` updates on heartbeat and successful camera ANPR writes
- Feature tests: `CameraAnprWriteTest`

### Out of scope

- M3: AI ANPR `.env` migration to camera credentials
- M4: Frontend Camera Management UI
- Camera access to user/admin/patrol/PWA routes

---

## 3. Files Changed

| Area | Files |
|------|-------|
| Middleware | `app/Http/Middleware/EnsureAnprWritePrincipal.php` (new) |
| Support | `app/Support/AnprCameraPrincipal.php` (new) |
| Controllers | `AnprEventController.php`, `AnprImageController.php`, `AnprEventLogController.php`, `CameraAuthController.php` |
| Routes | `routes/api.php` |
| Bootstrap | `bootstrap/app.php` (`auth.anpr-write` alias) |
| Tests | `tests/Feature/CameraAnprWriteTest.php`, `tests/Concerns/AuthenticatesCameras.php` |

---

## 4. Authorization Model

### 4.1 `auth.anpr-write` middleware

ANPR write endpoints accept **either**:

| Principal | Requirements | Set on request |
|-----------|--------------|----------------|
| Camera | Valid camera JWT with `principal_type = camera` | `request->attributes['camera']` |
| Admin user | Active admin user JWT (or test `actingAs`) | standard `auth:api` user |

Camera authentication is attempted first when a `Bearer` token is present. User JWTs fail camera validation and fall through to admin checks (`active.user` + `admin`).

### 4.2 `auth.camera` middleware (heartbeat only)

`POST` and `GET /api/camera-auth/heartbeat` require camera JWT only.

---

## 5. API Behavior

### 5.1 `POST /api/anpr-events`

**Camera principal**

- `camera_id` not required; derived from token
- Body `camera_id` mismatch → **403**
- Matching or omitted `camera_id` → accepted
- Updates `cameras.last_seen_at`
- Preserves vehicle linking, plate normalization, `is_flagged`, blockchain anchoring

**Admin principal**

- Unchanged: `camera_id` required in body

### 5.2 `POST /api/anpr-events/{anpr_event}/images/upload`

- Camera may upload only when `anpr_event.camera_id` matches token camera
- Other camera's event → **403**
- Preserves image types (`full`, `plate`, `annotated`), validation, idempotent replace, immutable blockchain conflict (**409**)
- Updates `last_seen_at` on success

### 5.3 `POST /api/anpr-images`

- Camera may create metadata only for own events (`anpr_event_id` ownership check)
- Updates `last_seen_at` on success

### 5.4 `POST /api/anpr-event-logs`

- Camera may create logs only for own events
- Other camera's event → **403**
- Updates `last_seen_at` on success

### 5.5 `POST /api/camera-auth/heartbeat`

- Camera JWT required
- Updates `last_seen_at`
- Does **not** create ANPR events

---

## 6. Camera Ownership Rules

| Action | Rule |
|--------|------|
| Create event | `camera_id` = authenticated camera |
| Upload image | `anpr_event.camera_id` must match |
| Store image metadata | `anpr_event_id` must belong to camera |
| Create event log | `anpr_event_id` must belong to camera |
| Cross-camera access | **403 Forbidden.** |

---

## 7. Validation Rules (unchanged for event fields)

| Field | Rule |
|-------|------|
| `plate_number` | required, max 20 |
| `confidence` | required, 0–1 |
| `detection_time` | required, date |
| `is_valid` | optional boolean |
| `latitude` / `longitude` | optional numeric |
| `blockchain_record_id` | prohibited |
| `camera_id` | required for admin; optional for camera (ownership enforced) |

---

## 8. Blockchain Compatibility

- `BlockchainAnprIntegrationService::anchorEventCreation()` unchanged for camera-created events
- `anchorImageEvidence()` unchanged for camera uploads
- Existing proof types (`entity_created`, `evidence_file`) preserved
- Client-supplied `blockchain_record_id` remains prohibited

---

## 9. Token Separation

Camera tokens remain restricted to:

- ANPR write endpoints (via `auth.anpr-write`)
- Camera heartbeat (via `auth.camera`)

Camera tokens still receive **401** on user/admin routes (`/api/profile`, `/api/users`, `/api/blockchain-records`, `/api/patrol-sessions`, `/api/cameras`).

User JWTs now include `principal_type = user`. `EnsureUserIsActive` rejects API tokens whose `principal_type` is present and not `user` (backward compatible with legacy user tokens lacking the claim).

### 9.1 Camera token live validity (`CameraAccessValidator`)

Camera middleware revalidates the camera row on every request:

- `credential_enabled` must be `true`
- `is_active` must be `true`
- Token `iat` must be **after** `credential_rotated_at` when set (strict; tokens issued in the same second as rotation remain valid)

Disabled, inactive, or pre-rotation tokens receive **403** on heartbeat and ANPR writes.

User 2FA/OTP login flow is unchanged.

---

## 10. Test Evidence

Executed **2026-07-01** from `backend/`:

| Command | Result | Tests |
|---------|--------|-------|
| `php artisan test --filter=Camera` | **PASS** | 51 |
| `php artisan test --filter=Anpr` | **PASS** | 109 |
| `php artisan test --filter=Auth` | **PASS** | 203 |

New suite: `tests/Feature/CameraAnprWriteTest.php` (17 tests)

---

## 11. Known Limitations

| Item | Milestone |
|------|-----------|
| AI ANPR still uses user credentials in `.env` | **Historical limitation at M1/M2; resolved by M3 AI ANPR Credential Migration.** |
| Camera cannot read ANPR monitoring lists (by design) | — |
| ANPR read routes remain user JWT + `patrol.monitoring` | unchanged |

---

## 12. Passing Criteria Checklist

- [x] ANPR event creation works with camera JWT and no `camera_id`
- [x] Camera ownership enforced for events, evidence, and logs
- [x] Camera tokens cannot write another camera's ANPR data
- [x] Admin/operator read behavior unchanged
- [x] Vehicle linking preserved
- [x] Blockchain event and image proof creation preserved
- [x] `last_seen_at` updates on heartbeat and ANPR writes
- [x] Camera token restricted to camera/ANPR write endpoints
- [x] Tests pass
- [x] M2 documentation complete
