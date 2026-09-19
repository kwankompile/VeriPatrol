# M9 — Patrol Page and Patrol Monitoring UI/UX Redesign

## 1. Milestone Summary

M9 delivers a frontend-only operational redesign of the guard patrol home (`/patrol`) and patrol monitoring surfaces (`/admin/patrol-monitoring`, session detail). The work improves clarity for guards and operators while preserving the M8 checkpoint status model (**verified**, **partial**, **needs_review**, **suspicious**, **missed**, **pending**), existing Laravel API contracts, PWA sync safety, and geolocation lifecycle ownership in `usePatrolController` / `feature/patrol/services/geolocationService`.

No backend API changes were required for M9.

## 2. Scope

**In scope**

- Guard patrol home layout, GPS/sync/notification health surfaces, stop-patrol confirmation, finalization progress
- `PatrolSummaryCard` outcome-first redesign with calm M8 copy
- Patrol monitoring dashboard KPIs, filters, M5-style loading/empty/error states, refresh behavior that preserves table context
- Map-first session detail layout, movement review language, replay UX improvements
- Shared minimal state components under `src/ui-component/state/`
- Frontend unit/component tests

**Out of scope**

- Backend validation tuning (M8)
- Auth, profile, ANPR, blockchain behavior changes
- Renaming `PartrolHome.jsx` (legacy filename retained; routes unchanged)

## 3. Files Changed

### Guard patrol (`frontend/src/feature/patrol/`)

| File | Change |
|------|--------|
| `views/PartrolHome.jsx` | Start/active panels, stop confirmation, finalization messaging |
| `views/PartrolHome.test.jsx` | Component tests |
| `controllers/usePatrolController.js` | `gpsError`, `gpsHealthStatus`, `gpsAccuracyMeters`, `patrolTrackingActive` |
| `components/PatrolSummaryCard.jsx` | Outcome-first summary redesign |
| `components/PatrolSummaryCard.test.jsx` | Summary language tests |
| `components/PatrolStopConfirmDialog.jsx` | **New** — stop confirmation dialog |
| `components/PatrolPwaStatusPanel.jsx` | GPS health chips, offline warning, calmer notification copy |
| `utils/patrolSummaryUtils.js` | Outcome derivation — **hardening:** `derivePatrolOutcome()` returns `'partial'` string for mixed verified+partial |
| `controllers/patrolRealtimeHandlers.js` | **Hardening:** session start/complete reload list instead of direct `setSessions` upsert |
| `controllers/usePatrolController.js` | **Hardening:** offline `completePatrol` exits before `updatePatrol`; `offlineFinalizationPending` + `finalizePatrolOnline()` |
| `controllers/usePatrolController.completePatrol.test.js` | **New** — offline stop regression test |
| `utils/patrolSummaryUtils.test.js` | Unit tests |
| `utils/patrolGpsUtils.js` | **New** — GPS health derivation (no geolocation API calls) |
| `utils/patrolGpsUtils.test.js` | Unit tests |

### Patrol monitoring (`frontend/src/feature/patrol-monitoring/`)

| File | Change |
|------|--------|
| `views/PatrolMonitoringDashboard.jsx` | KPI cards, attention filter, M5 states, refresh overlay |
| `views/PatrolMonitoringDashboard.test.jsx` | Dashboard state tests |
| `views/PatrolSessionDetail.jsx` | Map-first layout, compact metadata strip |
| `views/PatrolSessionDetail.test.jsx` | Map-first / empty replay test |
| `controllers/usePatrolMonitoringController.js` | `isInitialLoad` / `isRefreshing`, attention filter, preserve rows on refresh error |
| `components/PatrolSessionTable.jsx` | Attention column |
| `components/PatrolReplayControls.jsx` | Timeline labels, point index, accuracy, empty states |
| `components/PatrolReplayControls.test.jsx` | Replay empty/control tests |
| `utils/patrolMonitoringFilterUtils.js` | **New** — client-side attention filtering |
| `utils/patrolMonitoringFilterUtils.test.js` | Unit tests |
| `utils/patrolReplayUtils.js` | `formatReplayAccuracy`, `formatReplayPointLabel`, calmer anomaly chip |

### Shared UI

| File | Change |
|------|--------|
| `src/ui-component/state/ListLoadingSkeleton.jsx` | **New** |
| `src/ui-component/state/ContentEmptyState.jsx` | **New** |
| `src/ui-component/state/ContentErrorState.jsx` | **New** |

### Documentation

| File | Change |
|------|--------|
| `docs/system-update/m9-patrol-page-and-patrol-monitoring-uiux-redesign.md` | **New** (this document) |
| `frontend/documentation.md` | Patrol / monitoring UX notes |
| `system-update-roadmap.md` | M9 status |

## 4. Guard Patrol Home Redesign

### Start state (`data-testid="patrol-start-panel"`)

- Zone selection with helper copy
- Single **Start patrol** action wired to existing `handleStartPatrol`

### Active state (`data-testid="patrol-active-panel"`)

- **Recording** chip and checkpoint progress bar
- GPS health chip from controller-derived `gpsHealthStatus` (no `navigator.geolocation` in presentational components)
- Latest accuracy when available
- `PatrolTracking` checkpoint list (unchanged data flow)
- `PatrolPwaStatusPanel` for sync queue, offline warning, notification status

### Stop patrol

- **Stop patrol** opens `PatrolStopConfirmDialog` explaining sync → validate → summary
- Confirm calls existing `completePatrol`
- Finalization steps surface via `finalizingStep` on the active panel and `PatrolSummaryCard`

## 5. Patrol Summary Redesign

`PatrolSummaryCard` now leads with:

1. **Overall outcome** headline and M8 status chip (`verified` / `partial` / `needs_review` / `suspicious` / `missed`)
2. Plain-language **explanation** (needs-review explicitly states it is **not proof of cheating**)
3. **Checkpoint completion** chips (verified, partial, needs review, suspicious, missed, total)
4. **Route quality** — confidence, GPS gaps, movement review count
5. **Sync result** messaging when summary may be incomplete
6. **Positive feedback** alert for verified sessions
7. Expandable **technical details** (raw counters and per-checkpoint validation rows)

Logic lives in `patrolSummaryUtils.js`; M8 status chips reuse `patrolStatusUtils.js`.

## 6. Patrol Monitoring Dashboard Redesign

### KPI cards

- Total, **active** (highlighted when &gt; 0), completed, **needs review**, suspicious, partial/missed

### Filters

- Search guard/zone (existing)
- Status, zone
- **Attention** filter (client-side): active only, needs review, suspicious checkpoints

### M5-style states

- Initial load: `ListLoadingSkeleton`
- Refresh: `LinearProgress` + table remains visible (`isRefreshing`)
- Empty: contextual `ContentEmptyState`
- Error: `ContentErrorState` with retry (does not clear existing rows when data was already loaded)

## 7. Patrol Session Detail and Replay UX

### Session detail (map-first)

- Compact metadata strip (guard, zone, status, times, confidence, completion)
- **Replay controls** then **route map** at top
- Movement review list beside map when anomalies exist
- Checkpoint summary + confidence cards below map
- Checkpoint events table at bottom
- **Re-run Validation** and realtime snackbar preserved

### Replay controls

- Empty states: unavailable (active patrol), no route data, not enough points
- Timeline scrubber with **Point N of M** label
- Current time, coordinates, accuracy, progress
- Route concern chip at current segment (calmer copy)

## 8. State Handling and Realtime Behavior

| Concern | Behavior |
|---------|----------|
| GPS lifecycle | Still owned by `usePatrolController` → `geolocationService`; UI reads `gpsHealthStatus` only |
| PWA logs | Unsynced logs never deleted on stop/sync/validation failure |
| Monitoring refresh | `sessionsRef` prevents wiping rows on transient load errors when data exists |
| Realtime / polling | `PatrolSessionStarted` and `PatrolSessionCompleted` refresh stats and reload sessions via `loadStats()` / `loadSessions()` instead of upserting into the current filtered page; filters and pagination only reset on explicit user filter changes |
| Refresh errors | `sessionsRef` prevents wiping rows on transient load errors when data already exists |

## 9. Testing Evidence

Commands run:

```bash
cd frontend
npx vitest run src/feature/patrol src/feature/patrol-monitoring
npm run build
```

**Vitest:** 11 files, **36 tests passed**

**Build:** `npm run build` succeeded.

Backend tests were **not** run (no backend changes).

### Test coverage highlights

- Start panel vs active panel
- Stop confirmation before `completePatrol`
- Summary verified / needs-review language
- Dashboard refresh keeps rows; empty and error states
- Replay empty states and timeline labels
- M8 status mapping (existing `patrolM8Utils.test.js`)
- GPS health derivation (mocked geolocation support)

## 10. Acceptance Criteria Mapping

| Criterion | Status |
|-----------|--------|
| Guard understands recording state | Met — active panel + Recording chip |
| GPS permission/accuracy visible | Met — `gpsHealthStatus` + accuracy |
| Offline sync count visible | Met — `PatrolPwaStatusPanel` |
| Stop shows validation/summary flow | Met — dialog + `finalizingStep` + summary card; offline stop exposes **Finalize patrol online** via `offlineFinalizationPending` |
| Summary understandable without raw metrics | Met — outcome headline + explanation |
| Needs-review not punitive | Met — explicit copy in `buildOutcomeExplanation` |
| Active/problematic patrols identifiable | Met — KPIs + attention filter + table column |
| M5 loading/empty/error | Met — shared state components |
| Realtime does not reset filters/pagination | Met — realtime session start/complete reloads the list through current filters; refresh errors preserve existing rows |
| Map-first detail | Met — replay + map before metadata-heavy sections |
| Replay empty states | Met — `PatrolReplayControls` |
| M8 statuses preserved | Met — no legacy `uncertain`/`rejected` in default UI |

## 11. Known Limitations

- **Attention filter** applies client-side to the loaded batch (up to 100 sessions when filter active); server-paginated totals may not reflect global attention counts without a future API filter.
- **Offline stop patrol** stops GPS recording and preserves local logs. **`offlineFinalizationPending`** keeps a **Finalize patrol online** action visible in `PatrolSummaryCard` so the guard can complete server validation after reconnecting in the **same browser session**.
- **Offline finalization state is in-memory only.** `offlineFinalizationPending` and `offlineFinalizationProgressRef` do not survive a full page reload or PWA/browser kill. Unsynced location logs remain in IndexedDB, but the finalize button will not reappear until a future persistence layer is added.
- **Stop patrol** still shows a browser `alert` on successful online completion from `completePatrol` (pre-existing); summary card is the primary structured result.
- **GPS permission** state is inferred from geolocation errors and fixes, not a separate Permissions API poll in the UI.
- No screenshot or demo recording artifacts were produced for M9.

## 12. Follow-Up Recommendations

1. **Persist pending offline finalization** — store `pendingFinalizationPatrolId` and captured completion progress in IndexedDB (or Dexie alongside patrol logs) and hydrate on `/patrol` load so **Finalize patrol online** survives reload.
2. Add optional backend query params for attention filtering (`needs_review`, `uspicious`) to align KPIs with paginated lists.
3. Replace success `alert` in `completePatrol` with in-page toast or summary-only feedback.
4. Add integration/E2E tests for full stop-patrol → summary flow with mocked API.
5. Consider collapsible PWA panel sections on small screens to reduce scroll during active patrol.
