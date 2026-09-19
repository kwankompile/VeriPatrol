# M4 — Frontend Camera Management

**Milestone:** M4  
**Status:** Implemented  
**Date:** 2026-07-01  
**Scope:** `frontend` Admin Camera Management module

---

## 1. Executive Summary

M4 delivers an **Admin-only Camera Management** UI at `/admin/management-camera`. Administrators can list, create, edit, view, and delete camera machine credentials through the existing Laravel `/api/cameras` CRUD API. Operational fields reported by the ANPR runtime (masked RTSP URL, last seen, last login) are **read-only** in the UI. Passwords, hashes, JWTs, and raw stream credentials are never displayed.

---

## 2. Architecture Summary

The module follows the established feature layering:

```text
CameraList (view)
  → useCameraManagementController
  → CameraManagementRepository
  → cameraManagementService
  → api.js (Bearer JWT)
  → Laravel /api/cameras
```

**Components:** `CameraTable`, `CameraFormDrawer`, `CameraDetailDrawer`, `CameraStatusChip`, `CameraStatePanels`  
**Utils:** `cameraValidation.js` (operational status thresholds, client-side search)

---

## 3. Files Created / Modified

| Area | Path |
|------|------|
| Datasource | `src/feature/management-camera/datasources/cameraManagementService.js` |
| Repository | `src/feature/management-camera/repositories/CameraManagementRepository.js` |
| Controller | `src/feature/management-camera/controllers/useCameraManagementController.js` |
| Components | `src/feature/management-camera/components/*` |
| View | `src/feature/management-camera/views/CameraList.jsx` |
| Utils | `src/feature/management-camera/utils/cameraValidation.js` |
| Tests | `src/feature/management-camera/CameraManagement.test.jsx` |
| Routes | `src/routes/MainRoutes.jsx` |
| Menu | `src/menu-items/admin.js` |
| Docs | `frontend/documentation.md` |

---

## 4. Route and Menu Changes

| Item | Value |
|------|-------|
| Route | `/admin/management-camera` |
| Guard | `adminOnly` → `RoleProtectedRoute` with `ROLES.ADMIN` |
| Menu | Admin → Management → **Camera** |
| Non-admin direct URL | `/forbidden` via existing role guard |

---

## 5. API Endpoints Consumed

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/cameras` | List cameras |
| GET | `/api/cameras/{id}` | Camera detail |
| POST | `/api/cameras` | Create camera credential |
| PATCH | `/api/cameras/{id}` | Update editable fields |
| DELETE | `/api/cameras/{id}` | Delete camera |

Envelope: `{ success, message, data }`. List currently returns an unpaginated array; repository normalizes both array and Laravel paginator shapes.

---

## 6. UI Behavior

### List page

- Camera name, email, credential enabled, active/inactive, operational status, last login, last seen, masked RTSP summary
- Actions: view, edit, delete (with confirmation)
- Client-side search and pagination when backend returns a full array
- Server-side pagination supported when Laravel paginator envelope is returned

### Create / edit drawer

**Editable:** name, email, password (required on create; optional on edit), credential enabled, active, location, latitude/longitude, resolution width/height

**Read-only on edit:** masked RTSP URL, RTSP reported at, last login, last seen, credential rotated at

### Detail drawer

Shows camera id, identity, status chips, connectivity timestamps, resolution, coordinates, created/updated timestamps. **Recent ANPR event count: Not available** (no backend endpoint).

---

## 7. Security and Privacy Controls

- No user `/auth/login` changes; user 2FA unchanged
- Camera passwords never rendered; sensitive API keys stripped in repository normalization
- `rtsp_url` displayed only via `rtsp_url_masked`, with client-side `maskRtspUrl()` fallback if backend masking regresses
- Create/update payloads exclude `rtsp_url`, `last_seen_at`, `last_login_at`, `rtsp_reported_at`, `ip_address`, `port`, `username`
- Blank password on edit omitted from PATCH payload (backend retains current password)

---

## 8. Validation Behavior

- Backend 422 `validationErrors` mapped to form field `helperText`
- 401 → “Unauthorized. Please log in again.”
- 403 → “Forbidden. Admin access is required.”

---

## 9. State Handling

| State | Behavior |
|-------|----------|
| Loading | Skeleton rows on initial load |
| Empty | Friendly message + “Create camera” action |
| Error | Safe message + Retry button |
| Data | Table with pagination footer |
| Feedback | Snackbar on create/edit/delete success or failure |

**Operational status** (from `last_seen_at`):

| Condition | Label |
|-----------|-------|
| ≤ 5 minutes | Online |
| ≤ 60 minutes | Recently seen |
| Older | Offline |
| No timestamp | Never seen |

---

## 10. Test Evidence

From `frontend`:

| Command | Result |
|---------|--------|
| `npx vitest run src/feature/management-camera` | **17 passed** (feature + route guard) |
| `npm run build` | **Passed** |
| `php artisan test --filter=Camera` | **57 passed** |

**Coverage:** repository normalization (array + paginator), create/update payload rules, edit password optional, detail read-only RTSP/timestamps, controlled form reset between cameras/modes, client RTSP masking fallback, route guard (Admin vs Operator/Guard).

**Route guard:** automated in `CameraManagementRoute.test.jsx` (`RoleProtectedRoute` + `/admin/management-camera`).

---

## 11. Passing Criteria Checklist

| Criterion | Status |
|-----------|--------|
| `src/feature/management-camera/**` exists with feature architecture | Done |
| Admin can open `/admin/management-camera` | Done |
| List, create, edit cameras | Done |
| Empty password on edit keeps existing password | Done |
| RTSP read-only masked display | Done |
| No password/hash/token in UI | Done |
| Loading, empty, error states | Done |
| Validation errors on form fields | Done |
| Admin sidebar Camera Management | Done |
| Non-admin → Forbidden | Done (existing guard) |
| Vitest + build | Run during implementation |
| M4 documentation | Done |

---

## 12. Known Limitations

- Backend list is currently unpaginated; client-side pagination/search used until Laravel adds paginated index
- No recent ANPR event count on detail view (endpoint not available)
- Delete uses `window.confirm` (consistent with zone management)
- Checkpoint menu item remains commented out (unchanged by M4)

---

## 13. Follow-up (Later Milestones)

- Optional server-side search/pagination when backend index supports query params
- Shared confirm dialog component (project-wide refactor)
- ANPR event count on camera detail if backend exposes a safe aggregate endpoint
