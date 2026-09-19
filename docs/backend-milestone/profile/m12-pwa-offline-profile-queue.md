# Profile Module M12 — PWA Offline Profile Queue

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M12  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M11 — Frontend Sensitive Change Flows](m11-frontend-sensitive-change-flows.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

This milestone adds a **dedicated IndexedDB offline queue** for non-sensitive profile contact updates (`phone`, `address`) on `/account/profile`. When the device is offline, users can save contact changes locally; when connectivity returns, the queue replays through the shared `api.js` client with existing `profile_version` optimistic concurrency and conflict recovery.

M12 is **frontend/PWA-only**. No new backend routes were required.

---

## 2. Scope

| Item | Status |
|---|---|
| Dedicated `profile_update_queue` Dexie table | **Implemented** |
| `profileOfflineQueue.js` enqueue/flush utilities | **Implemented** |
| Offline contact save on `/account/profile` | **Implemented** |
| Flush on mount (after profile load) and reconnect | **Implemented** |
| `409 profile_version_conflict` offline conflict UI | **Implemented** |
| Reapply / keep-server conflict recovery | **Implemented** |
| Patrol `sync_queue` isolation hardening | **Implemented** |
| Focused Vitest coverage | **Implemented** |

---

## 3. Non-Scope

| Deferred / excluded item | Notes |
|---|---|
| Offline password change | Online-only (M11) |
| Offline email change | Online-only (M11) |
| Offline 2FA reconfiguration | Online-only (M11) |
| Offline profile picture upload/remove | Online-only (M10) |
| Offline session revoke / logout-all | Not queued |
| Secrets/tokens in IndexedDB | **Never** |
| Profile blockchain proof UI | M13 |

---

## 4. Architecture Summary

```
ProfilePage
 ├── ProfileContactForm
 ├── ProfileOfflineConflictAlert
 └── useProfileController
        ├── online  → ProfileRepository.updateProfile() → profileService → api.js
        └── offline → profileOfflineQueue.enqueueContactUpdate()
                         ↓ (reconnect / mount)
                    flushProfileOfflineQueue({ profileId })
                         ↓
                    ProfileRepository.updateProfile() → api.js
```

`getActiveOfflineQueueItem({ profileId })` and `flushProfileOfflineQueue({ repository, profileId })` only read/replay rows for the authenticated profile. Exhausted rows can be reset to `pending` via **Retry sync** before replay.

| Component | Role |
|---|---|
| `profile_update_queue` (Dexie v6) | Isolated from patrol `sync_queue` |
| `profileOfflineQueue.js` | Enqueue, flush, conflict metadata, retry handling |
| `useProfileController` | Online/offline branch, bootstrap flush after profile load |
| `ProfileOfflineConflictAlert` | Server vs pending local values + recovery actions |
| `syncService.js` | Rejects unsupported `sync_queue` types (safety guard) |

Patrol PWA sync (`POST /api/pwa/sync`) remains unchanged and does not process profile queue rows.

---

## 5. Offline Queue Data Contract

```js
{
  id: 'uuid',
  profileId: 'user-id',
  type: 'profile_update_contact',
  status: 'pending' | 'syncing' | 'synced' | 'failed' | 'conflict' | 'exhausted',
  resultStatus: null | 'synced' | 'validation_failed' | 'conflict' | 'failed' | 'exhausted',
  payload: {
    phone: string | null,
    address: string | null,
    profile_version: number
  },
  localValues: { phone, address },
  serverValues: null | { phone, address },
  serverProfile: null | { id, phone, address, profileVersion },
  retryCount: number,
  errorMessage: string | null,
  createdAt: number,
  lastAttempt: number | null,
  syncedAt: number | null
}
```

**Allowed queued fields:** `phone`, `address`, `profile_version` only.

---

## 6. Queue Lifecycle

### Enqueue (offline save)

1. Validate contact fields (existing M9 helpers).
2. Coalesce/replace any existing pending/failed contact item for the same profile.
3. Store safe payload in `profile_update_queue`.
4. Show: “Profile update saved offline. It will sync when you are online.”
5. Do **not** update server-confirmed profile state or publish cross-tab events.

### Flush (online)

Triggers:

* After initial profile load when online
* When browser transitions offline → online
* Manual **Retry sync** when a retryable/exhausted item exists

Flush behavior:

* Serialized via per-profile `activeFlushByProfile` map (overlapping calls for the same profile share one run)
* `resetStaleSyncingQueueItems({ profileId })` runs before queue reads and flush; `syncing` rows older than 2 minutes revert to `pending`
* Oldest eligible item first; replay requires `isReplayableContactQueueItem()` (contact type + safe payload + eligible status)
* Unsupported or unsafe same-profile rows are marked terminal `validation_failed` without a network request
* `PATCH /api/profile` through `ProfileRepository` → `api.js` (refresh-on-401 supported)
* **Success:** mark `synced`, update profile/`auth_user`, publish profile sync event
* **409 conflict:** mark `conflict`, preserve local + server values, show recovery UI
* **422:** terminal validation failure (`exhausted` / `validation_failed`)
* **401:** revert to `pending`, keep queue rows (session-expired UX)
* **Transient errors:** increment `retryCount`, max 5, then `exhausted`

---

## 7. Conflict Resolution

When flush receives `409 profile_version_conflict`:

* Queue item status → `conflict`
* UI shows server values vs pending offline values
* **Keep server version** — dismiss queue item, refresh profile from server
* **Reapply my changes** — `PATCH /api/profile` with `localValues` and latest server `profile_version`

Online M9 conflict handling (immediate save while online) remains unchanged.

---

## 8. Security Considerations

* Only `phone` and `address` may be queued offline
* Password, email, 2FA, picture, and session actions are **not** queued
* Queue payload validation rejects forbidden keys/patterns (password, otp, token, secret, etc.)
* Replay path re-validates queue type and payload before `PATCH /api/profile`; corrupted IndexedDB rows fail closed
* Stale `syncing` rows (interrupted tab reload/crash) recover to `pending` after 2 minutes
* No auth tokens, OTPs, or secrets stored in IndexedDB
* All replay requests use shared `api.js` (no duplicated auth/refresh logic)
* Queue read/flush/replay is scoped by authenticated `profileId` so another user's pending rows cannot replay after same-browser logout/login
* Patrol `sync_queue` ignores non-`location_log` types to prevent accidental `/pwa/sync` routing
* M11 sensitive flows remain online-only with existing session teardown
* Profile picture upload/remove controls are disabled offline (not queued)

---

## 9. Files Created / Updated

**Created**

- `frontend/src/feature/profile/offline/profileOfflineQueue.js`
- `frontend/src/feature/profile/offline/profileOfflineQueue.test.js`
- `frontend/src/feature/profile/components/ProfileOfflineConflictAlert.jsx`
- `backend/docs/profile/m12-pwa-offline-profile-queue.md`

**Updated**

- `frontend/src/pwa/db.js` (Dexie v6 `profile_update_queue`)
- `frontend/src/pwa/syncService.js` (unsupported type guard)
- `frontend/src/pwa/syncService.test.js`
- `frontend/src/feature/profile/controllers/useProfileController.js`
- `frontend/src/feature/profile/components/ProfileContactForm.jsx`
- `frontend/src/feature/profile/views/ProfilePage.jsx`
- `frontend/src/feature/profile/views/ProfilePage.test.jsx`
- `frontend/documentation.md`
- `backend/documentation.md`

---

## 10. Test Coverage

| Area | Tests |
|---|---|
| `profileOfflineQueue` | Enqueue, safe fields, coalesce, flush success, 409 conflict, 422 terminal, retry/shared flush |
| `ProfilePage` | Offline enqueue, online flush, conflict reapply, sensitive actions not queued |
| `syncService` | Unsupported `sync_queue` type not sent to `/pwa/sync` |
| Regression | M9–M11 profile, picture, sensitive flows |

---

## 11. Passing Criteria

- Offline phone/address save creates a safe queue item
- Sensitive actions are not queued
- Queue flushes after reconnect using `api.js`
- `409` conflicts preserve server data and show recovery UI
- Reapply uses latest server `profile_version`
- Successful flush updates Profile UI, `auth_user`, and cross-tab sync
- Patrol PWA sync unaffected
- M9–M11 behavior intact
- Focused frontend tests pass

---

## 12. Known Limitations

- Only contact fields are queued; all other profile mutations require connectivity
- Multiple rapid offline saves coalesce to the latest values (by design)
- `isSafeContactQueuePayload()` scans the serialized payload for forbidden substrings (`password`, `otp`, `token`, `secret`, `refresh`). This is intentionally conservative for M12 security, but it can reject legitimate contact values such as “Token Street” or “Secret Garden”. A future refinement should restrict forbidden-pattern checks to payload **keys** (and nested object shapes), not user-entered `phone`/`address` text.
- Blockchain anchoring for profile changes remains deferred to M13

---

## 13. Next Milestone

**M13 — Profile blockchain proof UI** (deferred)

---

## 14. Completion Statement

Profile Module **M12 — PWA Offline Profile Queue** is complete. The React PWA now queues safe `phone`/`address` updates in an isolated Dexie table, replays them through the existing `PATCH /api/profile` contract with `profile_version` concurrency, and provides conflict recovery without affecting patrol sync or M11 sensitive online-only flows.
