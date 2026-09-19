# M0 — API Contract Draft (Freeze)

**Milestone:** M0.2  
**Status:** **Implemented** for camera auth (M1), ANPR write API (M2), dashboard summary (M10). See `docs/system-update/m1-backend-camera-credential-foundation.md`, `m2-camera-authenticated-anpr-write-api.md`, and `backend/documentation.md` §4.  
**Date:** 2026-06-30 (draft); aligned with implementation **2026-07-09**  
**Base URL:** `/api`  
**Envelope convention:** `{ success, message, data }` (matches existing Laravel API)

> **Correction:** Camera login, camera-authenticated ANPR writes, and dashboard summary are live in `routes/api.php`. This document remains the contract reference; prefer `documentation.md` if details diverge.

---

## 1. Conventions

### 1.1 Authentication headers

| Principal | Header | Notes |
|-----------|--------|-------|
| User (Admin / Operator / Guard) | `Authorization: Bearer <user_jwt>` | Existing `auth:api` + `active.user` |
| Camera (machine) | `Authorization: Bearer <camera_jwt>` | New `auth:camera` guard (M1) |

**Rule:** Camera tokens and user tokens MUST be cryptographically and middleware-distinguishable. A camera token MUST NOT satisfy user middleware and vice versa.

### 1.2 Standard error envelope

```json
{
  "success": false,
  "message": "Human-readable safe message.",
  "data": {
    "errors": {
      "field_name": ["Validation message."]
    }
  }
}
```

### 1.3 Standard status codes

| Code | Usage |
|------|-------|
| 200 | Success (including idempotent duplicate sync) |
| 201 | Resource created (if adopted for POST creates) |
| 204 | Delete success (camera destroy — existing) |
| 401 | Missing/invalid/expired token |
| 403 | Authenticated but forbidden (role/principal/ownership) |
| 404 | Resource not found |
| 409 | Conflict (immutable blockchain evidence, idempotent sync conflict) |
| 422 | Validation failure |
| 429 | Rate limited (login, step-up, camera login) |
| 500 | Unexpected server error |

---

## 2. Camera Login

### `POST /api/camera-auth/login`

**Authentication:** None (public, rate-limited)  
**Authorization:** N/A  
**Middleware:** `throttle:camera-login` (planned M12)

#### Request schema

```json
{
  "email": "gate-cam-1@cameras.local",
  "password": "string",
  "rtsp_url": "rtsp://192.168.1.50:554/stream1"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `email` | string | yes | email format, max 255, must match camera credential |
| `password` | string | yes | min 12 (align with auth policy) |
| `rtsp_url` | string | no | valid URL; when present updates camera RTSP |

#### Success response `200`

```json
{
  "success": true,
  "message": "Camera authenticated successfully.",
  "data": {
    "access_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 3600,
    "camera": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Gate Camera 1",
      "rtsp_url": "rtsp://192.168.1.50:554/stream1"
    }
  }
}
```

#### Side effects

- Update `last_login_at`
- Update `rtsp_url` and `rtsp_reported_at` when `rtsp_url` provided
- MUST NOT create user refresh session or OTP challenge

#### Error responses

| Code | Condition | Message guidance |
|------|-----------|------------------|
| 401 | Invalid credentials | Generic: "Invalid credentials." |
| 403 | `credential_enabled=false` or `is_active=false` | "Camera access is disabled." |
| 422 | Validation failure | Field errors |
| 429 | Rate limit exceeded | "Too many attempts. Try again later." |

---

## 3. Camera CRUD (Admin)

Existing routes remain; contracts **extended** in M1.

### 3.1 `GET /api/cameras`

**Authentication:** User JWT  
**Authorization:** Admin only (`admin` middleware)

#### Success `200`

```json
{
  "success": true,
  "message": "Cameras retrieved successfully.",
  "data": [
    {
      "id": "uuid",
      "name": "Gate Camera 1",
      "email": "gate-cam-1@cameras.local",
      "credential_enabled": true,
      "is_active": true,
      "location": "Main Gate",
      "rtsp_url": "rtsp://...",
      "rtsp_reported_at": "2026-06-30T10:00:00Z",
      "last_login_at": "2026-06-30T09:55:00Z",
      "last_seen_at": "2026-06-30T10:01:00Z",
      "latitude": null,
      "longitude": null,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

**MUST NOT include:** `password`, `password_hash`, RTSP credentials (`username`/`password` for stream).

#### Pagination (M4 optional enhancement)

Query: `?page=1&per_page=15&search=&credential_enabled=&is_active=`

---

### 3.2 `POST /api/cameras`

**Authorization:** Admin only

#### Request schema

```json
{
  "name": "Gate Camera 1",
  "email": "gate-cam-1@cameras.local",
  "password": "SecureCameraPass1!",
  "credential_enabled": true,
  "location": "Main Gate",
  "is_active": true
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `name` | string | yes | max 255 |
| `email` | string | yes | email, unique on `cameras` |
| `password` | string | yes on create | min 12, hashed server-side |
| `credential_enabled` | boolean | no | default true |
| `location` | string | no | max 255 |
| `is_active` | boolean | no | default true |
| `rtsp_url` | string | no | **read-only on create** — set by ANPR login, not admin form |

**Current baseline difference:** Today `rtsp_url` is required on create. M1 policy: admin does not set RTSP; ANPR reports it at login. Migration must allow nullable `rtsp_url` or placeholder until first login.

#### Success `201`

```json
{
  "success": true,
  "message": "Camera created successfully.",
  "data": { "...camera resource without password..." }
}
```

#### Errors

| Code | Condition |
|------|-----------|
| 422 | Duplicate email, missing password, invalid fields |
| 403 | Non-admin |

---

### 3.3 `GET /api/cameras/{camera}`

**Authorization:** Admin only

Returns single camera resource (same shape as list item).

---

### 3.4 `PUT/PATCH /api/cameras/{camera}`

**Authorization:** Admin only

#### Request schema

```json
{
  "name": "Gate Camera 1",
  "email": "gate-cam-1@cameras.local",
  "password": "",
  "credential_enabled": true,
  "is_active": true,
  "location": "Main Gate"
}
```

| Field | Rules |
|-------|-------|
| `password` | Optional; empty/omitted MUST NOT erase existing hash |
| `email` | Unique except self |
| `rtsp_url` | **Prohibited** on admin update (ANPR-owned) |

#### Success `200`

Updated camera resource.

---

### 3.5 `DELETE /api/cameras/{camera}`

**Authorization:** Admin only  
**Success:** `204 No Content` (existing behavior)

**Constraint:** Must not delete camera with immutable blockchain-linked ANPR events if policy forbids (confirm in M1 — may return 409).

---

## 4. Camera-Authenticated ANPR Event API

### `POST /api/anpr-events`

**Authentication:** Camera JWT **or** Admin user JWT  
**Authorization:**

| Principal | Rule |
|-----------|------|
| Camera | `camera_id` derived from token; body `camera_id` ignored or rejected on mismatch |
| Admin | May supply `camera_id` explicitly (backward compatible) |

#### Request schema (camera-authenticated)

```json
{
  "plate_number": "ABC1234",
  "confidence": 0.92,
  "detection_time": "2026-06-30T10:00:00Z",
  "is_valid": true,
  "latitude": null,
  "longitude": null
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `plate_number` | string | yes | max 20, normalized server-side |
| `confidence` | number | yes | 0–1 |
| `detection_time` | ISO 8601 datetime | yes | valid date |
| `is_valid` | boolean | no | default true |
| `latitude` | number | no | -90 to 90 |
| `longitude` | number | no | -180 to 180 |
| `camera_id` | uuid | **no** for camera principal | prohibited or ignored |
| `blockchain_record_id` | any | prohibited | existing rule |

#### Success `200` / `201`

```json
{
  "success": true,
  "message": "ANPR event created successfully.",
  "data": {
    "id": "uuid",
    "camera_id": "uuid",
    "plate_number": "ABC1234",
    "confidence": 0.92,
    "detection_time": "2026-06-30T10:00:00.000000Z",
    "is_valid": true,
    "is_flagged": false,
    "vehicle_id": "uuid-or-null",
    "camera": { "id": "uuid", "name": "Gate Camera 1" }
  }
}
```

#### Side effects (unchanged)

- Vehicle auto-link via `AnprVehicleLinker`
- `is_flagged` from vehicle status
- `BlockchainAnprIntegrationService::anchorEvent()` when enabled
- Update `cameras.last_seen_at` (M2 — on write or heartbeat)

#### Error responses

| Code | Condition |
|------|-----------|
| 401 | Missing/invalid camera token |
| 403 | User token without admin; camera disabled |
| 422 | Invalid plate/confidence/detection_time |
| 403 | Body `camera_id` mismatches token camera |

---

## 5. Camera-Authenticated Evidence Upload API

### 5.1 Multipart upload (preferred)

### `POST /api/anpr-events/{anpr_event}/images/upload`

**Authentication:** Camera JWT or Admin user JWT  
**Authorization:** Camera may upload only for events where `anpr_event.camera_id` matches token camera.

#### Request (multipart/form-data)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `image_type` | string | yes | `full`, `plate`, or `annotated` |
| `image` | file | yes | image; jpg/jpeg/png/bmp/webp; max 10240 KB |

#### Success `200`

```json
{
  "success": true,
  "message": "ANPR image uploaded successfully.",
  "data": {
    "id": "uuid",
    "anpr_event_id": "uuid",
    "image_type": "plate",
    "file_size": 12345,
    "resolution": "640x480"
  }
}
```

**MUST NOT include:** absolute server file paths in production responses if policy redacts them.

#### Errors

| Code | Condition |
|------|-----------|
| 403 | Event belongs to another camera |
| 409 | Immutable blockchain proof exists for type |
| 422 | Invalid type/file |

---

### 5.2 Metadata registration (AI metadata mode)

### `POST /api/anpr-images`

**Authentication:** Camera JWT or Admin  
**Authorization:** Camera-scoped to own events

#### Request schema

```json
{
  "anpr_event_id": "uuid",
  "image_type": "full",
  "file_path": "relative/path.jpg",
  "file_size": 12345,
  "resolution": "1920x1080"
}
```

| Field | Validation |
|-------|------------|
| `anpr_event_id` | exists; must belong to authenticated camera |
| `image_type` | `full|plate|annotated` |
| `file_path` | string — server resolves under `ANPR_IMAGE_ROOTS` |

---

### 5.3 Event logs

### `POST /api/anpr-event-logs`

**Authentication:** Camera JWT or Admin  
**Authorization:** Camera may write logs only for own events

#### Request schema

```json
{
  "anpr_event_id": "uuid",
  "log_level": "info",
  "message": "ai_evidence_delivered",
  "metadata": {}
}
```

---

## 6. Camera Heartbeat (Optional M2)

### `POST /api/camera-auth/heartbeat`

**Authentication:** Camera JWT

#### Request

```json
{
  "rtsp_url": "rtsp://optional-update"
}
```

#### Success `200`

```json
{
  "success": true,
  "message": "Heartbeat recorded.",
  "data": {
    "camera_id": "uuid",
    "last_seen_at": "2026-06-30T10:05:00Z"
  }
}
```

**Rule:** MUST NOT create ANPR events.

---

## 7. Dashboard Summary API (M10)

### `GET /api/dashboard/summary`

**Authentication:** User JWT  
**Authorization:** Role-scoped data only  
**Status:** **Implemented** — see [`m10-dashboard-home-page-redesign.md`](m10-dashboard-home-page-redesign.md)

#### Success `200` — Admin example

```json
{
  "success": true,
  "message": "Dashboard summary retrieved.",
  "data": {
    "role": "Admin",
    "generated_at": "2026-06-30T10:00:00Z",
    "users": { "total": 42, "active": 40 },
    "patrols": {
      "active_count": 3,
      "needs_review_count": 2
    },
    "anpr": {
      "today_detections": 128,
      "flagged_detections": 4
    },
    "cameras": {
      "online": 5,
      "offline": 1,
      "recently_seen": 1
    },
    "blockchain": {
      "pending_records": 2,
      "failed_records": 0
    },
    "auth_alerts": {
      "failed_logins_24h": 7,
      "locked_accounts": 1
    }
  }
}
```

#### Security Operator subset

Excludes: `users`, `cameras` credential management counts, `auth_alerts` admin detail, blockchain admin actions.

#### Guard subset

```json
{
  "data": {
    "role": "Guard",
    "patrol": {
      "active_session_id": "uuid-or-null",
      "today_status": "verified",
      "unsynced_log_count": 0
    },
    "pwa": {
      "installable": true,
      "push_subscribed": false,
      "gps_permission": "granted"
    }
  }
}
```

#### Errors

| Code | Condition |
|------|-----------|
| 403 | Valid user but unsupported role |
| 401 | Unauthenticated |

---

## 8. Patrol Validation Response Shape

### `POST /api/patrol-sessions/{patrol_session}/validate`

**Authentication:** User JWT (Guard own session; Admin/Operator any)  
**Current behavior:** Frozen below; M8 extends statuses.

#### Success `200`

```json
{
  "success": true,
  "message": "Patrol session validation completed.",
  "data": {
    "patrol_session_id": "uuid",
    "total_location_logs": 120,
    "total_segments": 2,
    "total_gaps": 1,
    "anomalies": {
      "timestamp_issues": {
        "duplicate_ids": [],
        "out_of_order_ids": [],
        "invalid_timestamps": []
      },
      "segment_anomalies": [],
      "gaps": [
        {
          "previous_log_id": "uuid",
          "next_log_id": "uuid",
          "gap_seconds": 45
        }
      ],
      "items": [
        {
          "type": "speed_anomaly",
          "severity": "high",
          "log_id": "uuid",
          "message": "Speed exceeded threshold."
        }
      ]
    },
    "checkpoint_results": [
      {
        "checkpoint_id": "uuid",
        "checkpoint_name": "CP-1 North",
        "detection_type": "continuous",
        "confidence_score": 87.5,
        "status": "verified",
        "distance_score": 0.95,
        "accuracy_score": 0.9,
        "time_score": 0.85,
        "stability_score": 0.88,
        "gap_factor": 0.98,
        "integrity_factor": 1.0
      }
    ]
  }
}
```

#### Current status enum (checkpoint_results[].status)

| Status | Meaning (current algorithm) |
|--------|-------------------------------|
| `verified` | Confidence ≥ 80 with continuous evidence |
| `suspicious` | Strong anomaly signals |
| `uncertain` | Partial/resume detection or moderate confidence |
| `rejected` | Not detected or confidence < 50 |

#### Planned additions (M8 — forward compatible)

| Status | Meaning |
|--------|---------|
| `partial` | Incomplete checkpoint coverage |
| `needs_review` | Weak/uncertain evidence — not proven cheating |

#### Anomaly types (current)

`speed_anomaly`, `gps_jump`, `poor_accuracy`, timestamp issues (via `timestamp_issues` object)

#### Errors

| Code | Condition |
|------|-----------|
| 403 | Guard accessing another guard's session |
| 404 | Unknown patrol session |
| 422 | Session not in validatable state (if enforced) |

---

## 9. PWA Expectations (M7 freeze)

### 9.1 Web App Manifest (current baseline in `vite.config.mjs`)

| Field | Current value | M7 target |
|-------|---------------|-----------|
| `name` | AI Surveillance Patrol System | Branded app name |
| `short_name` | Surveillance | Short branded name |
| `display` | standalone | standalone |
| `start_url` | Vite `base` path | `/` or role home |
| `scope` | Vite `base` path | Match deployment |
| `theme_color` | `#111827` | Brand primary |
| `background_color` | `#ffffff` | Brand background |
| Icons | 192, 512, 512 maskable PNG | Replace template icons |

### 9.2 Service worker rules (must preserve)

| Rule | Requirement |
|------|-------------|
| API POST/PUT/PATCH/DELETE | NEVER cached |
| App shell | Offline navigations fall back to `index.html` |
| Protected API GET | Not incorrectly cached with stale auth |
| Update strategy | `registerType: 'autoUpdate'` — safe deployment refresh |

### 9.3 PWA sync API (unchanged)

### `POST /api/pwa/sync`

**Authentication:** User JWT (Guard)

#### Request (camelCase — existing)

```json
{
  "type": "location_log",
  "locationLogId": "client-uuid",
  "patrolId": "patrol-session-uuid",
  "userId": "user-uuid",
  "timestamp": "2026-06-30T10:00:00Z",
  "lat": 3.139,
  "lng": 101.686,
  "accuracy": 12.5,
  "source": "live",
  "trackingState": "active"
}
```

#### Success `200`

```json
{
  "success": true,
  "message": "Location log synced.",
  "data": {
    "duplicate": false,
    "location_log_id": "client-uuid"
  }
}
```

#### Client expectations

- On `401`: refresh user session once via `/api/auth/refresh`, retry sync
- On refresh failure: retain IndexedDB queue; surface session expired
- On `409`: conflicting duplicate — mark appropriately, do not drop evidence
- Camera JWT MUST NOT be used for PWA sync

### 9.4 Install UX expectations (M7)

- Sidebar install button visible when `beforeinstallprompt` supported
- Hide prompt when already installed (`display-mode: standalone`)
- Clear unsupported-browser messaging on iOS/Safari limitations

---

## 10. Contract Freeze Checklist

- [x] Camera login request/response documented
- [x] Camera CRUD extensions documented
- [x] Camera-authenticated ANPR write documented
- [x] Evidence upload documented
- [x] Dashboard summary documented (M10)
- [x] Patrol validation response documented (current + planned)
- [x] PWA manifest/sync expectations documented
- [x] Error codes and auth rules specified
- [x] No implementation in M0
