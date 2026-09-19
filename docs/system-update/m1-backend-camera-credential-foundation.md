# M1 — Backend Camera Credential Foundation

**Milestone:** M1  
**Status:** Implemented  
**Date:** 2026-07-01  
**Base URL:** `/api`

---

## 1. Objective

Establish cameras as first-class machine identities with hashed credentials, a dedicated camera login endpoint, and JWT principal separation—without weakening the existing user login model (mandatory 2FA, refresh sessions, and OTP challenges remain unchanged).

---

## 2. Scope

### Implemented in M1

- Camera credential database migration on `cameras`
- Admin camera CRUD credential validation (`StoreCameraRequest`, `UpdateCameraRequest`)
- `CameraLoginRequest` for machine login
- `CameraAuthService` with rate limiting
- `auth:camera` guard and `auth.camera` middleware (`EnsureRequestIsAuthenticatedCamera`)
- `POST /api/camera-auth/login`
- `GET /api/camera-auth/heartbeat` (camera-only route for token separation verification)
- `CameraResource` to prevent password/hash leakage
- Feature tests: `CameraCrudTest`, `CameraAuthTest`

### Explicitly out of scope

- M2: Camera-authenticated ANPR event/image writes
- M3: AI ANPR `.env` migration
- M4: Frontend Camera Management UI

---

## 3. Files Changed

| Area | Files |
|------|-------|
| Migration | `database/migrations/2026_07_01_100000_add_camera_credentials_to_cameras_table.php`, `2026_07_01_110000_sanitize_legacy_camera_passwords.php` |
| Model | `app/Models/Camera.php` |
| Factory | `database/factories/CameraFactory.php` |
| Seeder | `database/seeders/CameraSeeder.php` |
| Support | `app/Support/RtspUrlMasker.php`, `app/Support/LegacyCameraCredentialSanitizer.php` |
| Config | `config/auth.php`, `config/auth_security.php` |
| Requests | `StoreCameraRequest.php`, `UpdateCameraRequest.php`, `CameraLoginRequest.php` (new) |
| Resource | `app/Http/Resources/CameraResource.php` (new) |
| Controllers | `CameraController.php`, `CameraAuthController.php` (new) |
| Services | `CameraAuthService.php`, `InvalidCameraCredentialsException.php`, `CameraAccessDisabledException.php` |
| Auth | `LoginRateLimiter.php` (camera scope), `CameraAccessValidator.php` |
| Middleware | `EnsureRequestIsAuthenticatedCamera.php` (new) |
| Routes | `routes/api.php` |
| Bootstrap | `bootstrap/app.php` |
| Tests | `tests/Feature/CameraCrudTest.php`, `tests/Feature/CameraAuthTest.php`, `tests/Feature/CameraCredentialHardeningTest.php` |

---

## 4. Architecture Decisions

### 4.1 Separate guard, not shared user auth

Cameras are **not** users. The `camera` JWT guard uses the `cameras` Eloquent provider (`App\Models\Camera`). User routes remain on `auth:api` + `active.user`. Camera login does not call `AuthController@login`, does not issue refresh cookies, and does not create OTP challenges.

### 4.2 Token distinguishability

Camera JWTs include custom claim `principal_type = camera`. The JWT package `lock_subject` (`prv` claim) further prevents cross-model token reuse between `User` and `Camera` providers.

### 4.3 Password column repurposed

The existing `cameras.password` column now stores a **hashed machine credential** (Laravel `Hash`), not a raw RTSP password. Legacy rows without credentials remain non-login-capable via `credential_enabled = false` (default).

### 4.4 RTSP ownership

`rtsp_url` is nullable on create. Admin CRUD **prohibits** `rtsp_url`. The ANPR runtime may report `rtsp_url` during `POST /api/camera-auth/login`.

### 4.5 Rate limiting

`LoginRateLimiter` supports scoped keys (`camera_auth_login` vs `auth_login`) with independent config: `AUTH_CAMERA_LOGIN_MAX_ATTEMPTS`, `AUTH_CAMERA_LOGIN_LOCK_MINUTES`. The fifth failed camera login attempt within the lock window returns **429**.

### 4.6 Legacy credential sanitization

Migration `2026_07_01_110000_sanitize_legacy_camera_passwords` nulls any `cameras.password` value that is not a bcrypt hash and forces `credential_enabled=false` for those rows. `CameraSeeder` no longer writes plaintext RTSP passwords into `password`.

### 4.7 Admin RTSP masking

`CameraResource` returns `rtsp_url` and `rtsp_url_masked` with embedded userinfo stripped via `RtspUrlMasker`. Camera login responses may still return the runtime-reported full `rtsp_url` to the authenticated machine principal only.

### 4.8 Heartbeat scope

`POST`/`GET /api/camera-auth/heartbeat` update `last_seen_at` (M2). Each request revalidates camera credential state via `CameraAccessValidator` (disabled/inactive/rotated credentials return **403**).

---

## 5. Database Changes

Migration `2026_07_01_100000_add_camera_credentials_to_cameras_table`:

| Column | Type | Notes |
|--------|------|-------|
| `email` | string, nullable, unique | Required for new credential creates |
| `credential_enabled` | boolean, default `false` | Existing rows safe by default |
| `credential_rotated_at` | timestamp, nullable | Set on password create/rotate |
| `last_login_at` | timestamp, nullable | Updated on camera login |
| `rtsp_reported_at` | timestamp, nullable | Updated when login includes `rtsp_url` |
| `rtsp_url` | text, **nullable** | Was required; now optional at admin create |

---

## 6. API Contract Implemented

### 6.1 `POST /api/camera-auth/login`

**Auth:** None (public, rate-limited via `LoginRateLimiter`)

**Request:**

```json
{
  "email": "gate-cam-1@cameras.local",
  "password": "string",
  "rtsp_url": "rtsp://192.168.1.50:554/stream1"
}
```

**Success `200`:**

```json
{
  "success": true,
  "message": "Camera authenticated successfully.",
  "data": {
    "access_token": "eyJ...",
    "token_type": "bearer",
    "expires_in": 3600,
    "camera": {
      "id": "uuid",
      "name": "Gate Camera 1",
      "rtsp_url": "rtsp://..."
    }
  }
}
```

**Errors:**

| Code | Condition | Message |
|------|-----------|---------|
| 401 | Invalid email/password | `Invalid credentials.` |
| 403 | `credential_enabled=false` or `is_active=false` | `Camera access is disabled.` |
| 422 | Validation failure | Standard envelope |
| 429 | Rate limited | `Too many attempts. Try again later.` |

### 6.2 `GET /api/camera-auth/heartbeat`

**Auth:** `Authorization: Bearer <camera_jwt>` via `auth.camera` middleware

**Success `200`:** `{ "success": true, "message": "Camera token verification acknowledged.", "data": { "camera_id": "uuid" } }` — verification only; does not update `last_seen_at`.

### 6.3 Admin camera CRUD (extended)

Create requires `name`, `email`, `password` (min 12). `credential_enabled` optional. `rtsp_url` prohibited. Responses use `CameraResource` (no password/hash).

---

## 7. Security Model

| Control | Implementation |
|---------|----------------|
| Hashed credentials | `Hash::make` on admin create/update; `Hash::check` on login |
| No login without explicit enable | `credential_enabled` default `false` |
| Inactive cameras blocked | `is_active` checked at login |
| No credential leakage | `password` hidden on model; `CameraResource` excludes hash; RTSP userinfo masked |
| No user session for cameras | No refresh cookie; no OTP |
| Rate limiting | Scoped `LoginRateLimiter` for camera login |
| Token separation | `principal_type` claim + separate guard + `lock_subject` |

---

## 8. Token Separation Model

| Token | Guard | Can access |
|-------|-------|------------|
| User JWT | `auth:api` | User/admin/patrol routes |
| Camera JWT | `auth.camera` | Camera-only routes (heartbeat in M1) |

**Verified by tests:** Camera tokens receive `401` on `/api/profile`, `/api/users`, `/api/blockchain-records`, `/api/patrol-sessions`, `/api/cameras`. User tokens receive `401` on `/api/camera-auth/heartbeat`.

---

## 9. Validation Rules Summary

| Request | Key rules |
|---------|-----------|
| `StoreCameraRequest` | `email` required unique; `password` required min 12; `rtsp_url` prohibited |
| `UpdateCameraRequest` | `password` optional; empty string stripped; `rtsp_url` prohibited |
| `CameraLoginRequest` | `email` + `password` required; `rtsp_url` optional URL |

---

## 10. Test Evidence

Executed **2026-07-01** from `backend/`:

| Command | Result | Tests |
|---------|--------|-------|
| `php artisan test --filter=Camera` | **PASS** | 34 |
| `php artisan test --filter=Anpr` | **PASS** | 92 |
| `php artisan test --filter=Auth` | **PASS** | 202 |

New suites:

- `tests/Feature/CameraCrudTest.php` — migration fields, factory credentials, CRUD validation, hash behavior, RTSP prohibition, admin-only access
- `tests/Feature/CameraAuthTest.php` — login success/failure, RTSP reporting, OTP/refresh absence, user 2FA unchanged, token separation, rate limiting
- `tests/Feature/CameraCredentialHardeningTest.php` — seeder safety, legacy password sanitization, RTSP masking, hash non-leakage

---

## 11. Known Limitations / Next Milestones

| Item | Milestone |
|------|-----------|
| ANPR write routes still require user JWT (admin) | M2 |
| AI ANPR still uses user credentials in `.env` | **Historical limitation at M1/M2; resolved by M3 AI ANPR Credential Migration.** |
| Camera Management frontend not routed | M4 |
| Camera heartbeat is test/verification only; production ANPR writes use M2 routes | M2 |

---

## 12. M1 Passing Criteria Checklist

- [x] Camera credentials exist (`email`, hashed `password`, `credential_enabled`)
- [x] Camera password stored hashed (Laravel `Hash`)
- [x] `POST /api/camera-auth/login` returns scoped JWT
- [x] Login updates `last_login_at` and reported RTSP data
- [x] Camera JWT separate from user JWT (`principal_type`, guard, middleware)
- [x] Camera token cannot access user/admin/patrol/blockchain/camera CRUD routes
- [x] User 2FA flow unchanged
- [x] Tests and M1 documentation complete

---

## 13. Configuration

| Env key | Default | Purpose |
|---------|---------|---------|
| `AUTH_CAMERA_TOKEN_TTL` | `JWT_TTL` (60 min) | Camera access token TTL |
| `AUTH_CAMERA_LOGIN_MAX_ATTEMPTS` | 5 | Failed camera login attempts before lockout |
| `AUTH_CAMERA_LOGIN_LOCK_MINUTES` | 15 | Camera login lockout duration |
