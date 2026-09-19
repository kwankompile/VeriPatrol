# System Update Roadmap — Camera ANPR Credentials, UI/UX Standardization, PWA, Patrol Tuning, and Dashboard Redesign

## Current contract

> **Last audited:** **2026-07-21**
>
> | Field | Value |
> | --- | --- |
> | **Implementation status** | M0–M13 milestones largely **implemented**; see per-milestone **Status** lines and [`docs/system-update/`](system-update/) |
> | **Canonical source precedence** | 1. Repo `documentation.md` files and route source → 2. `docs/system-update/m*.md` milestone docs → 3. This roadmap (planning narrative) |
> | **Historical-document policy** | This roadmap mixes planning language with completion notes; prefer milestone docs and backend/frontend documentation for runtime behavior |
> | **Known remaining manual tasks** | M13 demo evidence and any unchecked items in milestone pass conditions |
>
> **Runtime boundaries:** Laravel owns backend behavior; React → Laravel APIs only; AI ANPR does not call Ethereum.

| Area | Current behavior |
| ---- | ---------------- |
| AI ANPR auth | `ANPR_CAMERA_EMAIL` + `ANPR_CAMERA_PASSWORD` + `ANPR_RTSP_URL` → `POST /api/camera-auth/login` |
| Camera identity | From camera JWT; ANPR event payloads **must not** include client-supplied `camera_id` |
| Deprecated (ignored) | `ANPR_BACKEND_EMAIL`, `ANPR_BACKEND_PASSWORD`, `ANPR_BACKEND_CAMERA_ID` |
| Evidence mode | **`upload`** when `ANPR_EVIDENCE_MODE` is omitted; `metadata` valid for local dev |

## Baseline decisions

This update must preserve the existing high-security login model. User login remains protected by mandatory 2FA and refresh-session security; machine/camera login must be separate from normal user login.

The AI ANPR module authenticates with **camera credentials** (`ANPR_CAMERA_EMAIL`, `ANPR_CAMERA_PASSWORD`, `ANPR_RTSP_URL`) via `POST /api/camera-auth/login`. Camera identity is derived from the camera JWT; ANPR event payloads omit `camera_id`. Legacy `ANPR_BACKEND_EMAIL` / `ANPR_BACKEND_PASSWORD` / `ANPR_BACKEND_CAMERA_ID` are **deprecated and ignored**. Evidence mode defaults to **`upload`** when `ANPR_EVIDENCE_MODE` is omitted; `metadata` remains valid for local dev. The backend client uses token caching, event posting, queue retry, and non-blocking backend delivery.

The frontend already implements Camera Management at `/admin/management-camera` (M4), Account Settings at `/account/profile` (M6 two-tab), M10 dashboard at `/dashboard`, plus Patrol Home, Patrol Monitoring, ANPR Monitoring, Blockchain Monitoring, and Profile features.

---

# M0 — Planning, Audit, and Compatibility Freeze

## Goal

Create a safe baseline before touching code.

## M0.1 — Current flow audit

### Work

- Inspect backend routes for:
  - `/auth/login`
  - `/anpr-events`
  - `/anpr-images`
  - `/cameras`
  - `/patrol-sessions/{id}/validate`
  - `/pwa/sync`
  - `/profile`
  - `/auth/sessions`
- Inspect frontend routes and menus for:
  - camera management
  - account profile/security
  - dashboard
  - patrol
  - patrol monitoring
  - ANPR monitoring
- Inspect AI ANPR:
  - `.env.example`
  - `config.py`
  - `backend.py`
  - queue/token cache behavior

### Passing criteria

- A short audit note exists listing all affected files.
- No code behavior changes yet.
- Current test commands are recorded before implementation starts.

## M0.2 — API contract draft

### Work

Draft final API contracts for:

- Camera login.
- Camera management CRUD.
- Camera-authenticated ANPR event posting.
- Camera-authenticated evidence upload.
- Dashboard summary endpoints.
- Patrol validation response shape.
- PWA manifest/icon expectations.

### Passing criteria

- API request/response shapes are documented.
- Role access matrix is documented.
- Any breaking changes to AI `.env` are listed.

## M0.3 — Test plan freeze

### Work

Define test filters to run after each major milestone.

### Passing criteria

Required test groups are documented:

```bash
php artisan test --filter=Camera
php artisan test --filter=Anpr
php artisan test --filter=Auth
php artisan test --filter=Patrol
php artisan test --filter=Pwa
php artisan test --filter=Profile
npx vitest run src/feature/management-camera
npx vitest run src/feature/profile
npx vitest run src/feature/patrol src/feature/patrol-monitoring
pytest
```

---

# M1 — Backend Camera Credential Foundation

## Goal

Make cameras first-class machine identities without weakening user 2FA.

## M1.1 — Camera credential database migration

### Work

Add camera credential fields.

Recommended fields:

```text
email
password
credential_enabled
last_login_at
last_seen_at
rtsp_url
rtsp_reported_at
token_version or credential_rotated_at
```

Rules:

- `email` must be unique.
- `password` must be hashed.
- `rtsp_url` is writable by ANPR runtime, read-only in admin UI.
- Existing camera records should migrate safely.
- Do not store raw camera password in API responses.

### Passing criteria

- Migration runs on fresh database.
- Migration runs on existing database.
- Camera factory supports credential fields.
- Camera model hides password/hash fields from JSON.
- Admin can still list existing cameras without credential data leaking.

## M1.2 — Camera credential validation requests

### Work

Update/create requests:

- `StoreCameraRequest`
- `UpdateCameraRequest`
- possibly `CameraLoginRequest`

Validation rules:

- Admin can set camera name, email, password, enabled state.
- Password required on create, optional on update.
- Email unique.
- RTSP URL not editable by Admin if policy says ANPR owns it.

### Passing criteria

- Invalid email returns 422.
- Duplicate email returns 422.
- Missing create password returns 422.
- Empty update password does not erase existing password.
- Admin cannot update read-only ANPR-reported RTSP URL from the normal form.

## M1.3 — Camera auth service

### Work

Create backend service, for example:

```text
app/Services/Auth/CameraAuthService.php
```

Responsibilities:

- Validate camera email/password.
- Check camera credential status.
- Issue JWT for camera principal.
- Update `last_login_at`.
- Return camera id/name.
- Rate-limit failed camera login attempts.

### Passing criteria

- Valid camera credentials return JWT.
- Disabled camera cannot log in.
- Invalid password returns safe 401 message.
- Login does not require user OTP.
- Normal user login remains unchanged and still requires OTP/2FA.

## M1.4 — Camera JWT guard/middleware

### Work

Add a middleware such as:

```text
auth:camera
```

or:

```text
EnsureRequestIsAuthenticatedCamera
```

It must distinguish camera tokens from user tokens.

### Passing criteria

- Camera token can access only camera/ANPR write endpoints.
- Camera token cannot access `/profile`, `/users`, `/blockchain-records`, `/patrol-sessions`, or admin routes.
- User token cannot impersonate camera-only write context unless explicitly allowed by Admin/operator policy.
- Tests prove token separation.

## M1.5 — Camera login endpoint

### Work

Add route:

```text
POST /api/camera-auth/login
```

Expected request:

```json
{
  "email": "camera@example.com",
  "password": "password",
  "rtsp_url": "rtsp://..."
}
```

Expected response:

```json
{
  "success": true,
  "message": "Camera authenticated successfully.",
  "data": {
    "access_token": "...",
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

### Passing criteria

- Login updates camera `rtsp_url`, `rtsp_reported_at`, and `last_login_at`.
- Response includes camera id and name.
- Response does not expose password hash.
- User 2FA flow is untouched.

## Milestone M1 pass condition

Camera credentials exist, camera login returns a scoped JWT, and camera machine auth does not weaken normal user 2FA.

---

# M2 — Camera-Authenticated ANPR Write API

## Goal

Allow ANPR runtime to create events/evidence using camera token instead of user token.

## M2.1 — ANPR event store accepts camera principal

### Work

Update `AnprEventController@store` behavior for camera-authenticated requests:

- `camera_id` should come from authenticated camera token.
- Request body should not need `camera_id`.
- If `camera_id` is supplied, backend should ignore it or reject mismatch.
- Keep Laravel vehicle linking behavior.
- Keep blockchain ANPR anchoring behavior.

### Passing criteria

- Camera token can create ANPR event without sending `camera_id`.
- Event is stored using authenticated camera id.
- Camera cannot create event for another camera.
- Normal Admin/operator behavior remains compatible if manually creating events is still supported.
- Vehicle link is created automatically.
- Blockchain record is still created when blockchain is enabled.

## M2.2 — ANPR image upload accepts camera principal

### Work

Update image upload route:

- Camera token can upload evidence for its own event.
- Camera cannot upload evidence to event owned by another camera.
- Image types remain restricted: `full`, `plate`, `annotated`.
- File validation remains enforced.

### Passing criteria

- Camera can upload valid image evidence.
- Camera receives 403 for another camera’s event.
- Invalid type/file receives 422.
- Event detail still shows evidence.
- Blockchain image proof still works if enabled.

## M2.3 — ANPR event logs accept camera principal

### Work

Allow camera token to write event logs for its own event only.

### Passing criteria

- Camera can create log for own event.
- Camera cannot create log for unrelated event.
- Admin/operator can still read logs through dashboard.

## M2.4 — Camera status heartbeat

### Work

Add optional endpoint:

```text
POST /api/camera-auth/heartbeat
```

or update `last_seen_at` during event/log/image write.

### Passing criteria

- Camera `last_seen_at` updates when ANPR is active.
- Admin UI can later show Online/Recently Seen/Offline.
- Heartbeat does not create ANPR events.

## Milestone M2 pass condition

ANPR write flow works end-to-end with camera token only, and camera token is restricted to its own ANPR data.

---

# M3 — AI ANPR Credential Migration

**Status: Complete.** See [`docs/system-update/m3-ai-anpr-credential-migration.md`](docs/system-update/m3-ai-anpr-credential-migration.md).

## Goal

Remove dependency on user credentials and manual camera UUID in the Python ANPR runtime.

## M3.1 — Environment config update

### Work

**Current configuration (M3+ implemented):**

```env
ANPR_CAMERA_EMAIL=
ANPR_CAMERA_PASSWORD=
ANPR_RTSP_URL=
```

Backend-enabled mode also requires:

```env
ANPR_BACKEND_BASE_URL=
ANPR_BACKEND_TOKEN_CACHE=
ANPR_BACKEND_QUEUE_FILE=
ANPR_BACKEND_RETRY_LIMIT=
```

Camera identity is obtained from `POST /api/camera-auth/login` and cached with `camera_id` / `camera_name` in the token cache file. ANPR event payloads omit `camera_id` (Laravel derives camera identity from the camera JWT).

**Deprecated (pre-M3 migration — ignored if present):**

```env
ANPR_BACKEND_EMAIL=
ANPR_BACKEND_PASSWORD=
ANPR_BACKEND_CAMERA_ID=
```

`ANPR_BACKEND_CAMERA_ID` is no longer required and is ignored if present.

### Passing criteria

- `.env.example` is updated.
- `check-config` validates camera email/password when backend is enabled.
- `ANPR_BACKEND_CAMERA_ID` is no longer required.
- Documentation explains migration from user credential to camera credential.

## M3.2 — AI backend login client update

### Work

Update `backend.py`:

- Login to `/camera-auth/login`.
- Send RTSP URL during login.
- Cache camera JWT.
- Cache camera id/name from login response.
- Retry login on 401.
- Never call user `/auth/login`.

### Passing criteria

- Valid camera credential creates token cache.
- Token is reused.
- 401 triggers re-login once.
- Invalid camera credential produces safe error.
- Backend event posting uses camera token.

## M3.3 — AI event payload update

### Work

Remove `camera_id` from event payload or make it optional for backward compatibility.

New payload:

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

### Passing criteria

- Backend accepts payload without `camera_id`.
- Backend assigns authenticated camera id.
- Queue retry persists event job correctly.
- Existing JSONL and evidence behavior remains unchanged.

## M3.4 — AI queue compatibility migration

### Work

Handle old queued jobs that still contain `camera_id`.

Options:

- Accept and ignore matching `camera_id`.
- Strip camera_id before posting.
- Fail clearly if old `camera_id` conflicts with authenticated camera.

### Passing criteria

- Existing pending queue file does not crash the runtime.
- Old jobs are either posted safely or logged as incompatible.
- No duplicate ANPR events are created during migration.

## M3.5 — AI tests

### Work

Add/update tests:

- config validation
- camera login success
- token cache reuse
- 401 re-login
- event posting without camera_id
- old queue compatibility

### Passing criteria

```bash
pytest
```

passes for ANPR tests.

## Milestone M3 pass condition

The Python ANPR runtime authenticates as a camera, receives camera id/name from Laravel, sends ANPR events without user credentials, and remains non-blocking.

---

# M4 — Frontend Camera Management

## Goal

Ship the Admin-only Camera Management page.

## M4.1 — Feature module structure

### Work

Create or complete:

```text
src/feature/management-camera/
  components/
  controllers/
  datasources/
  repositories/
  views/
  utils/
```

### Passing criteria

- Module follows existing frontend feature structure.
- Repository normalizes backend response.
- Controller owns loading, error, form, pagination, and submit state.

## M4.2 — Camera list page

### Work

Add:

```text
/admin/management-camera
```

Fields:

- camera name
- email
- credential enabled
- last login
- last seen
- RTSP status / reported URL summary
- actions

### Passing criteria

- Admin can list cameras.
- Non-admin cannot access route.
- Loading uses skeleton.
- Empty state is user-friendly.
- Errors show retry action.
- Password/hash never appears.

## M4.3 — Camera create/edit form

### Work

Admin can set:

- name
- email
- password
- credential enabled

Admin can view only:

- RTSP URL reported by ANPR
- last reported time
- last seen time

### Passing criteria

- Create camera works.
- Edit camera works.
- Password can be rotated.
- Empty password on edit keeps current password.
- RTSP URL is read-only in UI.
- Validation errors map to fields.

## M4.4 — Camera detail page or drawer

### Work

Show operational status:

- camera id
- camera name
- credential status
- last login
- last seen
- reported RTSP URL
- recent ANPR event count if backend summary exists

### Passing criteria

- Admin can inspect camera without exposing password.
- Sensitive RTSP display is either masked or controlled.
- UI is mobile-safe.

## M4.5 — Menu and routing

### Work

Unhide Admin sidebar Camera Management item.

### Passing criteria

- Admin sees Camera Management.
- Security Operator and Guard do not see the menu item.
- Direct URL access by non-admin returns Forbidden page.
- Frontend route table documentation updated.

## Milestone M4 pass condition

Admin can manage camera credentials from the frontend, and ANPR camera runtime can use those credentials to authenticate.

---

# M5 — Shared UI/UX State Standardization

## Goal

Standardize loading, empty, error, and data states across all major pages.

## M5.1 — Shared state components

### Work

Create:

```text
src/ui-component/state/PageSkeleton.jsx
src/ui-component/state/TableSkeleton.jsx
src/ui-component/state/EmptyState.jsx
src/ui-component/state/ErrorState.jsx
src/ui-component/state/RefreshOverlay.jsx
src/ui-component/state/DataStateGuard.jsx
```

### Passing criteria

- Components are reusable.
- Components support title, description, action, icon, and compact mode.
- Skeletons do not cause layout jump.
- Tests cover render variants.

## M5.2 — Shared table convention

### Work

Define standard page states:

```text
initial loading  -> skeleton
refresh loading  -> keep old rows + subtle progress
empty            -> EmptyState
error            -> ErrorState
has data         -> table/cards
```

### Passing criteria

- Pattern documented in frontend documentation.
- New Camera Management uses this pattern first.
- No page shows blank white content during initial load.

## M5.3 — Apply to management pages

### Work

Apply to:

- User Management
- Zone Management
- Checkpoint Management
- Vehicle Management
- Camera Management

### Passing criteria

- Each page has skeleton, empty, error, and data state.
- Existing CRUD behavior still works.
- Tests updated where applicable.

## M5.4 — Apply to monitoring pages

### Work

Apply to:

- ANPR Monitoring
- Patrol Monitoring
- Blockchain Monitoring
- Auth Monitoring

### Passing criteria

- Initial loads use skeletons.
- Polling refresh does not clear old rows.
- Empty state copy is contextual.
- Error state offers retry without noisy repeated alerts.

## M5.5 — Apply to profile/session pages

### Work

Apply to:

- Account Profile
- Account Security / sessions
- Profile dialogs where needed

### Passing criteria

- Profile page no longer flashes incomplete content.
- Session list has skeleton and empty states.
- Errors are readable and safe.

## Milestone M5 pass condition

Every major table/page has consistent loading, empty, error, and data behavior.

---

# M6 — Account Settings Two-Tab Redesign

## Goal

Redesign Account Settings into Profile Summary and Security Settings tabs.

## M6.1 — Account Settings route model

### Work

Use:

```text
/account/profile
```

Tabs:

```text
tab=profile
tab=security
```

Optional compatibility:

```text
/account/security -> /account/profile?tab=security
```

### Passing criteria

- Old security route still works or redirects safely.
- Profile menu opens Account Settings.
- Tab state survives refresh through query param.

## M6.2 — Profile Summary tab

### Work

Include:

- profile summary card
- profile picture upload/removal
- phone/address form
- notification enablement
- PWA push subscription status
- send test notification action
- offline conflict alert if needed

### Passing criteria

- User can update non-sensitive profile fields.
- Profile picture behavior still works.
- Notification enablement moved here.
- Offline phone/address behavior remains restricted to non-sensitive fields.
- Header/auth user profile sync still works.

## M6.3 — Security Settings tab

### Work

Include:

- change password
- change email
- reconfigure 2FA
- active sessions
- revoke session actions
- security warnings

### Passing criteria

- Password change requires current password + OTP.
- Email change requires current password + OTP + confirmation.
- 2FA reconfiguration has no disable button.
- Sensitive success clears local session and redirects to login.
- Session management does not expose raw tokens.

## M6.4 — Notification relocation

### Work

Move notification UI from header/demo area into Profile Summary.

### Passing criteria

- User can subscribe/unsubscribe from push notifications from Account Settings.
- Header notification section does not contain misleading static demo settings.
- Test notification still works.
- Permission denied state is clearly explained.

## M6.5 — Account Settings tests

### Work

Add/update tests for:

- tab navigation
- profile summary
- notification controls
- security settings
- dialogs
- session list
- offline restrictions

### Passing criteria

```bash
npx vitest run src/feature/profile src/feature/account-security
```

passes.

## Milestone M6 pass condition

Account Settings is a polished two-tab page with profile, notification, security, 2FA, and session controls in one coherent UX.

---

# M7 — PWA Tuning and App Branding

## Goal

Make the PWA installable, reliable, and branded.

## M7.1 — App logo and manifest icons

### Work

Replace default/template assets:

```text
logo.svg
logo-dark.svg
favicon.svg
manifest icons
maskable icon
apple touch icon
```

### Passing criteria

- Browser tab uses correct app icon.
- PWA install prompt uses correct app name and icon.
- Android installed app icon is not cropped.
- Lighthouse PWA icon checks pass.

## M7.2 — Manifest cleanup

### Work

Verify:

- app name
- short name
- theme color
- background color
- display mode
- start URL
- scope
- icon sizes

### Passing criteria

- Chrome Application tab shows valid manifest.
- App can be installed on Android Chrome.
- Installed app launches to the expected route.
- No missing icon warnings.

## M7.3 — Service worker caching review

### Work

Verify Workbox runtime caching:

- app shell can load offline
- API POST requests are never cached
- protected API data is not incorrectly cached
- service worker update behavior is safe

### Passing criteria

- Offline refresh shows app shell or offline-safe state.
- API writes are not replayed by cache accidentally.
- New deployment can update service worker without trapping user on stale app.

## M7.4 — Background Sync / PWA Sync validation

### Work

Validate:

- offline patrol logs remain in IndexedDB
- online reconnect flushes queue
- refresh-on-401 works during sync
- failure keeps data locally

### Passing criteria

- Offline patrol records are not lost.
- Sync resumes after reconnect.
- Token refresh during sync works.
- Failed sync is visible to user and retryable.

## M7.5 — Install UX

### Work

Improve:

- sidebar install button
- mobile visibility
- already-installed state
- unsupported-browser state

### Passing criteria

- Install button appears when browser supports it.
- Button does not disappear on mobile layout.
- Installed mode hides install prompt.
- User sees clear messaging when install is unsupported.

## Milestone M7 pass condition

The app installs cleanly as a branded PWA, supports offline shell behavior, and preserves patrol sync safety.

**Status: Implementation complete.** See `docs/system-update/m7-pwa-tuning-and-app-branding.md`.

---

# M8 — Patrol Validation Tuning

## Goal

Reduce false “suspicious” results when the guard follows the real road path.

## M8.1 — Validation algorithm audit

### Work

Inspect `PatrolValidationService` and related tests:

- checkpoint proximity thresholds
- route distance rules
- GPS accuracy usage
- time gap handling
- speed/jump detection
- how suspicious status is assigned
- frontend anomaly rendering

### Passing criteria

- Current suspicious triggers are documented.
- At least one reproduced false-positive test case exists.
- No tuning yet without failing test.

## M8.2 — GPS quality filtering

### Work

Implement logic to:

- ignore extremely low-quality GPS points
- discount points with poor accuracy
- account for reported accuracy radius
- avoid punishing short GPS gaps

### Passing criteria

- Low-quality points do not automatically mark suspicious.
- Good route with a few poor points can still pass.
- Tests cover high-accuracy and low-accuracy scenarios.

## M8.3 — Route corridor tolerance

### Work

Add road/path tolerance model:

- compare route points to checkpoint/path corridor
- allow configurable corridor meters
- allow small deviations
- require repeated or severe deviation before anomaly

### Passing criteria

- Road-following sample route is not suspicious.
- Major route deviation is detected.
- Thresholds are configurable.
- Summary explains route confidence.

## M8.4 — Movement plausibility

### Work

Add/adjust impossible movement detection:

- speed threshold
- teleport jump detection
- minimum consecutive bad points before suspicious
- gap-aware calculations

### Passing criteria

- Impossible jump is flagged.
- Normal movement on road is not flagged.
- GPS gap does not create fake impossible speed.

## M8.5 — Status model refinement

### Work

Use softer status categories:

```text
verified
partial
needs_review
suspicious
missed
```

### Passing criteria

- `suspicious` only used for strong evidence.
- Weak/uncertain evidence becomes `needs_review` or `partial`.
- Frontend labels match backend statuses.
- Existing dashboard filters still work.

## M8.6 — Patrol monitoring UI update

### Work

Update:

- status chips
- anomaly list copy
- confidence card
- route map overlays
- replay controls if needed

### Passing criteria

- UI no longer overuses alarming “Suspicious” language.
- Anomaly reason is clear.
- Map shows suspicious/needs-review segments distinctly.
- Re-run validation still works.

## Milestone M8 pass condition

A guard following the correct road path is not falsely marked suspicious under realistic GPS noise, while true route deviations remain detectable.

**Status: Complete.** See `docs/system-update/m8-patrol-validation-tuning.md`.

---

# M9 — Patrol Page and Patrol Monitoring UI/UX Redesign

## Goal

Improve patrol user experience for guards and monitoring users.

## M9.1 — Guard Patrol Home redesign

### Work

Improve `/patrol`:

- clear start patrol panel
- active patrol state
- checkpoint progress
- GPS health
- sync queue health
- notification status
- offline warnings
- stop patrol confirmation

### Passing criteria

- Guard understands whether patrol is recording.
- GPS permission/accuracy issues are visible.
- Offline sync count is visible.
- Stop patrol clearly shows validation/summary result.

## M9.2 — Patrol summary redesign

### Work

Improve `PatrolSummaryCard`:

- verified/partial/needs-review/suspicious status
- checkpoint completion
- route quality
- sync result
- validation explanations

### Passing criteria

- Summary is understandable without reading raw metrics.
- Suspicious reasons are specific.
- Good session shows positive feedback.
- Needs-review session is not presented as proven cheating.

## M9.3 — Patrol Monitoring dashboard redesign

### Work

Improve `/admin/patrol-monitoring`:

- KPI cards
- active sessions
- needs-review sessions
- map-first detail view
- clearer anomaly list
- better filters

### Passing criteria

- Admin/operator can quickly identify active and problematic patrols.
- List, map, and summary are visually balanced.
- Loading/empty/error states follow M5 standard.
- Realtime updates do not reset user context unexpectedly.

## M9.4 — Patrol replay UX

### Work

Improve:

- replay controls
- timeline scrubber
- route point labels
- checkpoint event markers

### Passing criteria

- User can replay route without confusion.
- Replay works on desktop and mobile.
- Missing route data shows helpful empty state.

## Milestone M9 pass condition

Patrol pages feel operationally useful, understandable, and less punitive while preserving monitoring accuracy.

**Status: Complete.** See `docs/system-update/m9-patrol-page-and-patrol-monitoring-uiux-redesign.md`.

---

# M10 — Dashboard / Home Page Redesign

## Goal

Replace template dashboard with role-aware operational dashboard.

## M10.1 — Backend dashboard summary APIs

### Work

Add summary endpoint(s), for example:

```text
GET /api/dashboard/summary
```

Role-aware data:

Admin:

- total users
- active patrols
- patrol sessions needing review
- today ANPR detections
- flagged vehicle detections
- camera online/offline status
- blockchain pending/failed records
- auth alerts

Security Operator:

- active patrols
- patrol sessions needing review
- recent ANPR detections
- flagged vehicles

Guard:

- active patrol/resume patrol
- today patrol status
- unsynced records
- GPS/PWA readiness

### Passing criteria

- Endpoint returns only data allowed for the role.
- Admin receives full operational summary.
- Operator receives monitoring summary.
- Guard receives own operational summary.
- Tests prove role separation.

## M10.2 — Frontend dashboard repository/controller

### Work

Create dashboard datasource/repository/controller.

### Passing criteria

- Frontend normalizes summary response.
- Loading/empty/error states follow M5 standard.
- Controller handles refresh safely.

## M10.3 — Admin dashboard

### Work

Build Admin dashboard:

- operational cards
- recent ANPR
- active patrols
- camera health
- blockchain proof health
- auth alert summary

### Passing criteria

- No template/fake metrics remain.
- Cards navigate to relevant pages.
- Responsive layout works.
- Backend errors show safe error state.

## M10.4 — Operator dashboard

### Work

Build Security Operator dashboard:

- patrol monitoring focus
- ANPR monitoring focus
- flagged vehicles
- sessions needing review

### Passing criteria

- Operator does not see admin-only management shortcuts.
- Dashboard links to monitoring pages.
- Data matches operator permission scope.

## M10.5 — Guard dashboard

### Work

Build Guard dashboard:

- start/resume patrol
- PWA readiness
- sync status
- current patrol summary

### Passing criteria

- Guard does not see admin/operator-only data.
- Guard can start or resume patrol quickly.
- Offline/sync status is visible.

## Milestone M10 pass condition

Home/dashboard is no longer template content and becomes role-aware, operational, and backed by real data.

**Status: Complete.** Backend: `GET /api/dashboard/summary` (`DashboardController` → `DashboardSummaryService`). Frontend: `feature/dashboard` on `/dashboard`. Tests: `DashboardSummaryTest.php`.

# M11 — ANPR Monitoring and Camera Context Polish

## Goal

Ensure ANPR monitoring stays excellent after camera-auth migration.

## M11.1 — ANPR list camera context

### Work

Show camera name/status safely in ANPR list.

### Passing criteria

- List shows camera name.
- Sensitive RTSP/IP is not exposed.
- Filters still work.
- Live polling still works.

## M11.2 — ANPR detail camera context

### Work

Show:

- camera name
- detection time
- evidence
- linked vehicle
- blockchain proof
- camera health summary if safe

### Passing criteria

- Detail page remains complete.
- No sensitive camera credentials exposed.
- Evidence preview still uses protected file loading.
- Linked vehicle navigation remains available.

## M11.3 — Live update regression

### Work

Verify live ANPR behavior after auth changes.

### Passing criteria

- New camera-authenticated detection appears without browser refresh.
- New row highlight still works.
- Live indicator still works.
- Poll failure backoff still works.
- No duplicate rows.

## Milestone M11 pass condition

ANPR monitoring remains fully functional with camera-authenticated events and safe camera context display.

---

# M12 — Security, Audit, and Abuse Hardening

## Goal

Harden the new machine-auth surface.

## M12.1 — Camera auth audit logs

### Work

Add audit events:

- camera login success
- camera login failed
- camera disabled login blocked
- camera credential rotated
- camera event rejected
- camera unauthorized event access

### Passing criteria

- Audit logs include actor type `camera` or admin actor where relevant.
- Failed logins are recorded without leaking passwords.
- Admin can inspect camera auth events if Auth Monitoring supports it.

## M12.2 — Camera login rate limiting

### Work

Add rate limit rules by:

- email
- IP
- camera id if resolved

### Passing criteria

- Repeated failed login is throttled.
- Successful login resets or reduces failure state as designed.
- Error response is safe and non-enumerating.

## M12.3 — Token revocation on credential rotation

### Work

When Admin changes camera password or disables credential:

- revoke/invalidate old camera tokens
- require ANPR runtime re-login

### Passing criteria

- Old camera token fails after password rotation.
- Old camera token fails after camera disabled.
- Re-enabled camera can login again with current password.

## M12.4 — Endpoint permission matrix tests

### Work

Test camera token against major endpoint groups.

### Passing criteria

Camera token:

- can write own ANPR events/images/logs
- cannot access profile
- cannot access user management
- cannot access camera management
- cannot access patrol routes
- cannot access blockchain monitoring
- cannot access another camera’s event

## Milestone M12 pass condition

The new camera-auth surface is rate-limited, auditable, revocable, and scoped only to camera-owned ANPR write actions.

---

# M13 — Full Regression, Documentation, and Demo Evidence

## Goal

Finalize this update for stable delivery.

## M13.1 — Backend regression

### Work

Run:

```bash
php artisan test
```

Or if full suite has known long-run instability, run focused suites and document full-suite behavior.

### Passing criteria

- Camera/auth/ANPR/patrol/profile/PWA/dashboard tests pass.
- Known unrelated failures are documented with isolated reruns.
- No new regression accepted without explanation.

## M13.2 — Frontend regression

### Work

Run:

```bash
npx vitest run
npm run build
```

### Passing criteria

- Feature tests pass.
- Build passes.
- Existing lint/prettier warnings are documented if unrelated.

## M13.3 — AI regression

### Work

Run:

```bash
pytest
python main.py check-config
python main.py run --source video --video samples/videos/test_vehicle.mp4 --dry-run
```

### Passing criteria

- Tests pass.
- Dry-run still creates `events.jsonl`, evidence, and summary.
- Backend-enabled run can login with camera credential and post event.

## M13.4 — Manual end-to-end demo

### Work

Capture evidence for:

1. Admin creates camera credential.
2. ANPR runtime logs in as camera.
3. ANPR sends RTSP URL.
4. Backend returns token + camera id/name.
5. ANPR detection creates event.
6. Evidence uploads.
7. React ANPR Monitoring updates live.
8. Admin views camera with read-only RTSP URL.
9. Guard patrol follows route and does not falsely become suspicious.
10. PWA install works with correct logo.
11. Account Settings two tabs work.
12. Dashboard shows real role-aware data.

### Passing criteria

- Screenshots or screen recording exist for every demo item.
- Demo data does not expose passwords/private keys.
- RTSP URL display is masked or acceptable for demo.

## M13.5 — Documentation updates

### Work

Update:

- `backend/documentation.md`
- `frontend/documentation.md`
- `anpr/README.md`
- `anpr/.env.example`
- module docs for login/profile/ANPR if needed

### Passing criteria

- Docs match implemented behavior only.
- Old user-credential ANPR login is removed or marked deprecated.
- Camera-auth setup instructions are complete.
- PWA install and logo steps documented.
- Patrol validation tuning documented with thresholds.

## Milestone M13 pass condition

The full system update is tested, documented, demo-ready, and consistent across backend, frontend, AI ANPR, PWA, and patrol flows.

---

# Recommended implementation order

```text
M0  Planning, Audit, and Compatibility Freeze
M1  Backend Camera Credential Foundation
M2  Camera-Authenticated ANPR Write API
M3  AI ANPR Credential Migration
M4  Frontend Camera Management
M5  Shared UI/UX State Standardization
M6  Account Settings Two-Tab Redesign
M7  PWA Tuning and App Branding
M8  Patrol Validation Tuning
M9  Patrol Page and Patrol Monitoring UI/UX Redesign
M10 Dashboard / Home Page Redesign
M11 ANPR Monitoring and Camera Context Polish
M12 Security, Audit, and Abuse Hardening
M13 Full Regression, Documentation, and Demo Evidence
```

## Implementation grouping suggestion

If Cursor needs smaller working branches:

```text
Branch 1: M0-M2 Backend camera auth + ANPR write API
Branch 2: M3 AI ANPR migration
Branch 3: M4 Frontend Camera Management
Branch 4: M5 Shared UI states
Branch 5: M6 Account Settings redesign
Branch 6: M7 PWA/logo
Branch 7: M8-M9 Patrol tuning + patrol UI
Branch 8: M10 Dashboard
Branch 9: M11-M13 Polish, hardening, tests, docs
```

## Non-negotiable safety rule

Do not implement ANPR camera credentials as normal users with 2FA disabled. Cameras must be separate machine identities with tightly scoped JWT access to ANPR write endpoints only.
