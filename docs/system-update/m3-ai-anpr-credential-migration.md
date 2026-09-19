# M3 — AI ANPR Credential Migration

**Milestone:** M3  
**Status:** Implemented  
**Date:** 2026-07-01  
**Scope:** `anpr` runtime only (backend M1/M2 prerequisites)

---

## 1. Milestone Summary

| Field | Value |
|-------|-------|
| **Status** | Implemented |
| **Date** | 2026-07-01 |
| **Scope** | Python AI ANPR runtime (`anpr`) |
| **Objective** | Migrate the AI ANPR runtime from user credentials and manual camera UUID to camera machine credentials, camera JWT login, and token-derived camera identity. |

---

## 2. What Changed

### Old user credential flow

- `ANPR_BACKEND_EMAIL` / `ANPR_BACKEND_PASSWORD` → `POST /api/auth/login` (user JWT, 2FA-protected)
- `ANPR_BACKEND_CAMERA_ID` manually configured
- `GET /api/cameras/{id}` verified camera existence before queue flush
- ANPR event payloads included `camera_id`, `is_flagged`

### New camera credential flow

- `ANPR_CAMERA_EMAIL` / `ANPR_CAMERA_PASSWORD` → `POST /api/camera-auth/login` with `rtsp_url`
- Camera JWT and camera `id`/`name` cached in `.cache/backend_token.json`
- Camera identity verified via successful camera login (no admin camera CRUD)
- New ANPR event payloads omit `camera_id`; backend derives ownership from camera JWT

### Files changed

| Area | Files |
|------|-------|
| Config | `anpr/config.py`, `anpr/.env.example` |
| Backend client | `anpr/backend.py` |
| Tests | `anpr/tests/test_camera_auth.py` (new), `test_config.py`, `test_backend_queue.py`, `test_integration.py`, `conftest.py` |
| Docs | `docs/system-update/m3-ai-anpr-credential-migration.md`, `anpr/README.md`, `anpr/docs/m7-*.md`, `anpr/docs/m8-*.md` |

---

## 3. Environment Migration

### Removed / deprecated variables

| Variable | Status |
|----------|--------|
| `ANPR_BACKEND_EMAIL` | Deprecated — emits migration warning if present; not used |
| `ANPR_BACKEND_PASSWORD` | Deprecated — emits migration warning if present; not used |
| `ANPR_BACKEND_CAMERA_ID` | Deprecated — emits migration warning if present; not used |

### New variables

| Variable | Required when backend enabled |
|----------|-------------------------------|
| `ANPR_CAMERA_EMAIL` | Yes |
| `ANPR_CAMERA_PASSWORD` | Yes |

### Continued variables

| Variable | Purpose |
|----------|---------|
| `ANPR_RTSP_URL` | RTSP source URL; also reported during camera login |
| `ANPR_BACKEND_BASE_URL` | Laravel API base URL |
| `ANPR_BACKEND_TOKEN_CACHE` | JWT + camera identity cache path |
| `ANPR_BACKEND_QUEUE_FILE` | Queue JSONL path |
| `ANPR_BACKEND_RETRY_LIMIT` | Per-job retry limit |
| `ANPR_BACKEND_TIMEOUT_SECONDS` | HTTP timeout |
| `ANPR_BACKEND_QUEUE_FLUSH_INTERVAL_SECONDS` | RTSP periodic flush interval |

---

## 4. New Runtime Flow

```text
AI ANPR
  -> POST /api/camera-auth/login { email, password, rtsp_url }
  -> receive camera JWT + camera id/name
  -> cache token + camera identity
  -> POST /api/anpr-events without camera_id
  -> upload/register evidence
  -> write event logs
```

---

## 5. Queue Compatibility Behavior

| Scenario | Behavior |
|----------|----------|
| **Matching old `camera_id`** | Strip `camera_id` before POST; checkpoint sanitized event to queue |
| **Conflicting old `camera_id`** | Mark job `validation_failed`; `last_error`: queued camera_id does not match authenticated camera |
| **Job with existing `backend_event_id`** | Skip event re-POST; continue evidence/log delivery |
| **Malformed queue lines** | Unchanged — quarantine to `.cache/backend_queue.bad.jsonl` |

Legacy fields `vehicle_id` and `is_flagged` are stripped from queued events before POST when present.

---

## 6. Security Notes

- AI runtime **never** calls `/api/auth/login`; user 2FA remains mandatory for human users.
- Camera JWT is machine-scoped (`principal_type = camera`); cannot access admin camera CRUD routes.
- Passwords, JWTs, Authorization headers, and raw RTSP credentials are not logged or persisted in queue files.
- RTSP URLs are masked in CLI validation output via `mask_rtsp_url()`.
- Laravel remains owner of event records, vehicle linking, and blockchain anchoring.

---

## 7. Testing Performed

Commands run from `anpr`:

| Command | Result |
|---------|--------|
| `python -m pytest tests/test_config.py tests/test_backend_queue.py tests/test_camera_auth.py tests/test_integration.py -q` | **54 passed** |
| `python -m pytest -q` | **91 passed** |
| `python main.py check-config` | Not run against live `.env` (no project `.env` with backend enabled in CI sandbox); covered by pytest `check-config` integration tests |

---

## 8. Passing Criteria Checklist

| Criterion | Status |
|-----------|--------|
| Authenticate using camera credentials | Done |
| Login through `/camera-auth/login`, never `/auth/login` | Done |
| Send `rtsp_url` during camera login | Done |
| Cache camera JWT and camera identity | Done |
| Post ANPR events without `camera_id` | Done |
| Preserve queue, evidence, retry, non-blocking behavior | Done |
| Handle old queued jobs with `camera_id` | Done |
| Deprecation warnings for old env vars | Done |
| M3 documentation under `docs/system-update` | Done |
| Pytest coverage for camera auth, config, queue migration | Done |
