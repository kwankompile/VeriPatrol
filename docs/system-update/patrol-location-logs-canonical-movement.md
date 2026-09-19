# Patrol GPS source of truth: `location_logs`

## Summary

`location_logs` is the canonical store for actual patrol movement (live maps, route display, replay, history, validation, summaries, offline recovery).

`patrol_routes` is **deprecated compatibility storage** for legacy sessions that never received location logs. It must not be dual-written by the SPA for new GPS samples.

## Architecture

```text
Device GPS sample
    → Dexie location_logs + sync_queue (offline-safe)
    → POST /api/pwa/sync (or POST /api/location-logs)
    → location_logs persistence
    → compact PatrolRouteUpdated realtime event (id = location_logs.id)
    → monitoring clients append or refetch GET /api/patrol-routes
```

`GET /api/patrol-routes` still exists for API compatibility. Internally it reads through `PatrolMovementService`:

1. Prefer drawable `location_logs` for the session
2. Fall back to `patrol_routes` only when the session has **no usable** location logs
3. Never merge both tables (avoids duplicating every point)

## Pagination (complete routes)

`GET /api/patrol-routes` is **paginated** (`per_page` default **500**, max **1000**). The API never returns an unbounded full route in one response.

Complete-route frontend consumers must walk every page via `getAllPatrolRoutes` / `fetchAllPatrolRoutePages`:

- patrol session detail map
- patrol replay (same `patrolRoutes` collection)
- patrol history / route history map
- any completed-route view that needs the full trail

Behavior:

1. Request page 1 with a bounded page size (500 preferred).
2. Read `current_page` / `last_page` (or equivalent) from pagination meta.
3. Sequentially fetch remaining pages.
4. Normalize, deduplicate by location-log id, and sort by device-recorded time.
5. If a later page fails, **throw** — never present page 1 as a complete route.
6. Malformed meta that cannot advance safely stops without an infinite loop.

Dashboard live pins use a **bounded latest-point** query (`PatrolMovementService::latestDrawablePointForSession`) and intentionally do **not** load the full route.

Realtime points that arrive while pages are loading are merged by stable location-log id (`mergeRoutePoints`). Route refreshes use latest-request-wins so a stale multi-page response cannot overwrite a newer refresh.

## Ordering

Deterministic order for movement:

1. Device-recorded timestamp (`location_logs.timestamp` ms)
2. Server `created_at`
3. Primary key `id`

Offline-synced points are ordered by device time, not upload/`server_received_at` time.

## Drawable eligibility (maps / replay)

Evidence rows are never deleted. Map/replay queries may exclude unusable points:

- missing coordinates
- coordinates outside valid lat/lng ranges
- rows outside the requested `patrol_session_id`

Low-accuracy points remain in storage and validation evidence unless existing validation rules already ignore them for a specific check.

## Realtime event (`PatrolRouteUpdated`)

Event name retained for subscriber compatibility. Payload is compact scalars only:

```json
{
  "patrol_session_id": "<uuid>",
  "id": "<location-log-id>",
  "location_log_id": "<location-log-id>",
  "latitude": 1.234,
  "longitude": 103.456,
  "accuracy": 10.5,
  "recorded_at": "<iso8601>"
}
```

Broadcast failures are caught (`BroadcastException`) and must not fail location-log persistence.

## Deprecated write path

| Path | Status |
|------|--------|
| `POST /api/pwa/sync` | Canonical write |
| `POST /api/location-logs` | Canonical write |
| `POST /api/patrol-routes` | Deprecated; returns `Deprecation: true` header + `deprecated: true` body; still creates a legacy row for old clients |

Frontend guard tracking no longer calls `createPatrolRoute`.

## Optional backfill

```bash
php artisan patrol:backfill-location-logs-from-routes --dry-run
php artisan patrol:backfill-location-logs-from-routes --session=<uuid> --limit=500
```

Idempotent: skips rows that already match an existing location log on session + lat/lng + device timestamp. Does not overwrite existing logs. Not run automatically on deploy.

Migrated rows use `source=sync` and `tracking_state=offline` (enum-compatible label for legacy route backfill).

## Deprecation timeline

| Phase | Action |
|-------|--------|
| Now | Reads prefer `location_logs`; SPA stops dual-write; POST routes deprecated |
| After backfill of production legacy sessions | Confirm zero sessions rely on `patrol_routes` fallback |
| Table removal prerequisites | No GET fallback hits; no POST clients; docs updated; optional archive export |

Do not drop `patrol_routes` until those prerequisites are met.

## Related code

- `App\Services\PatrolMovementService`
- `App\Http\Resources\PatrolMovementPointResource`
- `App\Console\Commands\BackfillLocationLogsFromPatrolRoutesCommand`
- Frontend normalizer: `src/feature/patrol-monitoring/utils/patrolRoutePointUtils.js`
- Complete-route pager: `src/feature/patrol-monitoring/utils/fetchAllPatrolRoutePages.js`
- Monitoring repository: `getAllPatrolRoutes()` (aliases `getPatrolRoutes`)
