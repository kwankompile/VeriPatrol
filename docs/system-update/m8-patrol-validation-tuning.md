# M8 — Patrol Validation Tuning

## 1. Milestone Summary

**Goal:** Reduce false “suspicious” results when a guard follows a plausible real-world road/path under realistic GPS noise, while preserving detection of true route deviations, impossible movement, and integrity issues.

**Scope:** Backend validation algorithm tuning, configurable thresholds, M8 status model, patrol summary API fields, patrol monitoring UI copy and status chips, regression tests, and safe blockchain proof summaries.

**Final status:** **Complete** — regression test reproduced a false positive on baseline code; tuned validation passes focused backend and frontend test suites.

---

## 2. Files Changed

### Backend

| File | Change |
|------|--------|
| `config/patrol_validation.php` | **New** — configurable GPS, movement, corridor, checkpoint, and scoring thresholds |
| `app/Services/PatrolValidationService.php` | GPS filtering, route corridor, movement plausibility, M8 status assignment |
| `app/Services/PatrolSessionSummaryService.php` | M8 checkpoint counts; legacy API keys retained |
| `app/Services/PatrolPushNotificationService.php` | Softer push copy and M8 status handling |
| `app/Services/PatrolBroadcastService.php` | Broadcast review events for `needs_review` |
| `app/Support/CheckpointEventStatus.php` | **New** — canonical statuses, legacy normalization, validation rules |
| `app/Http/Requests/StoreCheckpointEventRequest.php` | M8 statuses + `prepareForValidation` normalization |
| `app/Http/Requests/UpdateCheckpointEventRequest.php` | M8 statuses + `prepareForValidation` normalization |
| `app/Http/Controllers/Api/CheckpointEventController.php` | Index filter normalizes legacy status aliases |
| `database/migrations/2026_07_04_100000_update_checkpoint_events_status_for_m8.php` | **New** — enum migration and legacy row mapping |

### Frontend

| File | Change |
|------|--------|
| `src/feature/patrol-monitoring/utils/patrolStatusUtils.js` | **New** — M8 labels, colors, legacy mapping |
| `src/feature/patrol-monitoring/utils/patrolAnomalyUtils.js` | Calmer anomaly labels; `route_deviation` support |
| `src/feature/patrol-monitoring/components/PatrolStatusChip.jsx` | M8 status chips |
| `src/feature/patrol-monitoring/components/PatrolAnomalyList.jsx` | “Movement review” copy |
| `src/feature/patrol-monitoring/components/PatrolConfidenceCard.jsx` | M8 counts and confidence explanation |
| `src/feature/patrol-monitoring/components/CheckpointStatusSummary.jsx` | M8 dashboard counts |
| `src/feature/patrol-monitoring/components/MapLegend.jsx` | Updated legend and copy |
| `src/feature/patrol-monitoring/components/PatrolRouteMap.jsx` | M8 checkpoint colors |
| `src/feature/patrol-monitoring/views/PatrolMonitoringDashboard.jsx` | Needs-review stat card |
| `src/feature/patrol-monitoring/views/PatrolSessionDetail.jsx` | “Movement review” section title |
| `src/feature/patrol-monitoring/controllers/usePatrolMonitoringController.js` | M8 event stats |
| `src/feature/patrol-monitoring/controllers/patrolRealtimeHandlers.js` | Status-aware realtime stats/copy (`resolveCheckpointRealtimeUpdate`) |
| `src/feature/patrol-monitoring/controllers/patrolRealtimeHandlers.test.js` | **New** — realtime `needs_review` handling tests |
| `src/feature/patrol/components/PatrolSummaryCard.jsx` | M8 validation and summary counts |
| `src/feature/patrol/controllers/usePatrolController.js` | Local `needs_review` on poor GPS reach |

### Tests

| File | Change |
|------|--------|
| `tests/Feature/CheckpointEventTest.php` | **New** — M8 store/update + legacy normalization |
| `tests/Unit/CheckpointEventStatusTest.php` | **New** — status helper unit tests |
| `tests/Feature/PatrolValidationTest.php` | M8 regression + corridor ordering/boundary tests |
| `tests/Unit/PatrolSessionSummaryServiceTest.php` | Updated confidence score arity |
| `src/feature/patrol-monitoring/utils/patrolM8Utils.test.js` | **New** — status and label tests |

### Docs

| File | Change |
|------|--------|
| `docs/system-update/m8-patrol-validation-tuning.md` | **This document** |
| `system-update-roadmap.md` | M8 completion reference |
| `backend/documentation.md` | M8 validation summary |
| `frontend/documentation.md` | M8 monitoring UI summary |

---

## 3. Current Baseline Findings

### Previous suspicious triggers

| Area | Baseline behavior |
|------|-------------------|
| Checkpoint proximity | `distance <= checkpoint.radius + accuracy * 0.5` |
| GPS accuracy scoring | Score 0 when accuracy > 50 m; any segment log > 50 m flagged `low_accuracy` |
| Gap handling | Gaps > 30 s split segments; gap factor 0.8 / 0.5; speed not computed across gaps |
| Speed anomaly | Effective speed > 41.67 m/s between consecutive logs within segment |
| GPS jump | Distance > 100 m within ≤ 5 s (no gap) → **major** immediately |
| Timestamp issues | Invalid/out-of-order → major; duplicate → minor |
| Status assignment | `integrity_factor < 1.0` (including **minor** poor GPS) + confidence 50–79 → **`suspicious`** |
| Poor GPS drift | Single poor-accuracy spike between good points could create apparent jump → suspicious checkpoint |

### Previous status model

`pending`, `verified`, `suspicious`, `uncertain`, `rejected`

### Previous frontend language problems

- “No suspicious movement detected” shown when no anomalies existed
- “Suspicious segment(s)” for all anomaly items including poor GPS
- Dashboard “Uncertain events” / “Rejected” dominated operational tone
- `needs_review` sessions visually equivalent to cheating signals

---

## 4. Implemented Backend Tuning

### GPS quality filtering

- Points with accuracy > **150 m** (`ignore_accuracy_meters`) are skipped for movement anomaly calculations.
- Poor accuracy (**75–150 m**) is discounted in speed/jump math when both endpoints are poor.
- Single poor-accuracy segment produces **minor** advisory items only.
- Accuracy scoring uses configurable good/poor thresholds with a floor score for very poor readings.

### Route corridor tolerance

- Corridor built from zone checkpoints ordered by **`created_at` then `id`** (composite sort).
- `distanceOutsideCorridorMeters()` returns raw excess distance outside the union of checkpoint circles and segment corridors; deviation when `> 0` (no double-buffer compare).
- **Suspicious** route signal requires severe deviation (≥ 180 m with good accuracy) or **3+** consecutive deviation points.
- `route_deviation` flat anomaly items emitted for map overlays when thresholds met.

### Movement plausibility

- Severe good-accuracy jump (≥ 300 m in ≤ 5 s) flagged immediately.
- Non-severe speed/jump requires **2+** bad transitions before strong/major classification.
- Transitions involving ignored-accuracy points are excluded.
- Gap boundaries prevent fake impossible speed across tracking gaps.

### Status model refinement

See section 6. `assignStatus()` uses **strong** vs **moderate** anomaly signals; only strong signals yield `suspicious`.

### Configurable thresholds

All magic numbers moved to `config/patrol_validation.php` with `PATROL_*` env overrides.

---

## 5. Implemented Frontend Updates

### Status chips

`PatrolStatusChip` and `patrolStatusUtils.js` support `verified`, `partial`, `needs_review`, `suspicious`, `missed`, `pending`. Legacy `uncertain` → **Needs review**, `rejected` → **Missed**.

### Anomaly language

| Before | After |
|--------|-------|
| No suspicious movement detected | No route concerns detected |
| suspicious segment(s) | movement review item(s) |
| Suspicious movement | Movement review |
| Speed anomaly | Speed review |

### Summary / confidence card

`PatrolConfidenceCard` and `PatrolSummaryCard` show M8 counts and explain that needs-review is not proof of misconduct.

### Map / replay

- M8 checkpoint colors on map
- Route concern (`route_deviation`) legend entry
- Minor vs major review items distinguished in list chips

---

## 6. Status Model

| Status | Meaning |
|--------|---------|
| `verified` | Strong continuous evidence, high confidence, no strong anomaly |
| `partial` | Checkpoint evidence exists but dwell/continuity incomplete |
| `needs_review` | Uncertain evidence: GPS quality, gaps, moderate deviation, resume |
| `suspicious` | Strong evidence: severe/repeated impossible movement, severe/repeated route deviation, major integrity issue |
| `missed` | No usable checkpoint evidence (confidence < 50 or not detected) |
| `pending` | Unprocessed / manual placeholder (unchanged) |

### Legacy mapping

| Legacy | Maps to |
|--------|---------|
| `uncertain` | `needs_review` |
| `rejected` | `missed` |
| `verified` | `verified` |
| `suspicious` | `suspicious` |

Migration `2026_07_04_100000_update_checkpoint_events_status_for_m8.php` updates existing rows on MySQL; SQLite accepts new string values directly.

---

## 7. Configuration

| Key | Default | Notes |
|-----|---------|-------|
| `PATROL_GPS_GOOD_ACCURACY_METERS` | 25 | Full accuracy score |
| `PATROL_GPS_POOR_ACCURACY_METERS` | 75 | Poor but usable |
| `PATROL_GPS_IGNORE_ACCURACY_METERS` | 150 | Excluded from movement math |
| `PATROL_GPS_ACCURACY_RADIUS_WEIGHT` | 0.5 | Checkpoint radius expansion |
| `PATROL_GAP_THRESHOLD_SECONDS` | 30 | Segment split / speed skip |
| `PATROL_MAX_SPEED_MPS` | 41.67 | ~150 km/h |
| `PATROL_GPS_JUMP_DISTANCE_METERS` | 100 | Jump threshold |
| `PATROL_GPS_JUMP_MAX_SECONDS` | 5 | Jump time window |
| `PATROL_SEVERE_JUMP_DISTANCE_METERS` | 300 | Immediate major jump |
| `PATROL_MIN_CONSECUTIVE_BAD_SEGMENTS` | 2 | Before strong movement flag |
| `PATROL_ROUTE_CORRIDOR_ENABLED` | true | Toggle corridor checks |
| `PATROL_ROUTE_CORRIDOR_METERS` | 75 | Corridor buffer |
| `PATROL_ROUTE_SEVERE_DEVIATION_METERS` | 180 | Severe deviation |
| `PATROL_ROUTE_MIN_CONSECUTIVE_DEVIATION_POINTS` | 3 | Repeated deviation |
| `PATROL_MIN_CONTINUOUS_DWELL_SECONDS` | 3 | Continuous detection |
| `PATROL_RESUME_MAX_CONFIDENCE` | 79 | Resume cap |

**Demo tuning:** Increase `PATROL_ROUTE_CORRIDOR_METERS` or `PATROL_GPS_POOR_ACCURACY_METERS` for noisy demo hardware; decrease `PATROL_MIN_CONSECUTIVE_BAD_SEGMENTS` only in controlled fraud-detection demos.

---

## 8. Testing Evidence

### Commands run

```bash
cd backend
php artisan test --filter=CheckpointEvent   # 11 passed
php artisan test --filter=PatrolValidation   # 22 passed
php artisan test --filter=PatrolBroadcast    # 5 passed
php artisan test --filter=Patrol             # 77 passed
php artisan test --filter=Pwa                # 13 passed
php artisan test --filter=Blockchain         # 270 passed

cd frontend
npx vitest run src/feature/patrol src/feature/patrol-monitoring   # 6 passed
npm run build                                                     # succeeded
```

### Regression test

`test_road_following_route_with_realistic_gps_noise_is_not_marked_suspicious` **failed** on baseline (Block B → `suspicious` due to poor-accuracy drift jump) and **passes** after M8 tuning.

### Known unrelated failures

None in the focused filters above.

---

## 9. Acceptance Criteria Mapping

| Requirement | Evidence |
|-------------|----------|
| **M8.1** Audit + failing test before tuning | Sections 3 and 8; regression test failed pre-tune |
| **M8.2** GPS quality filtering | `PatrolValidationService` ignore/discount logic; tests for poor spike and ignored points |
| **M8.3** Route corridor tolerance | `assessRouteCorridor()`; config thresholds; road-following regression test |
| **M8.4** Movement plausibility | Consecutive bad segments, severe jump, gap-aware speed; dedicated tests |
| **M8.5** Status model | Migration + `assignStatus()` + summary counts + API legacy keys |
| **M8.6** Monitoring UI | Status chips, anomaly copy, confidence card, map legend, dashboard stats |

---

## 10. Known Limitations

- **No road-network geometry:** Corridor uses straight segments between checkpoints; guards following roads around blocks rely on corridor buffer, not OSM/map matching.
- **Checkpoint order:** When explicit route order is absent, ordering uses `created_at` / `id` — may not match real patrol sequence in all zones.
- **GPS hardware:** Extremely poor fixes (> 150 m) are ignored for movement math; checkpoint proximity still depends on device-reported accuracy.
- **Single-checkpoint zones:** Route corridor assessment is skipped when fewer than two checkpoints exist.

---

## 12. Hardening patch (review follow-up)

| Issue | Fix |
|-------|-----|
| Legacy `uncertain`/`rejected` accepted but not persistable after MySQL enum migration | `CheckpointEventStatus` helper; `prepareForValidation()` on store/update requests |
| Realtime dashboard incremented `suspiciousEvents` for all review broadcasts | `resolveCheckpointRealtimeUpdate()` branches on `suspicious` vs `needs_review` vs `partial` |
| Checkpoint ordering used `sortBy(id)` overwriting `created_at` | Composite `sortBy([created_at, id])` |
| Route corridor double-buffer compare | `distanceOutsideCorridorMeters()` returns excess outside allowed union; compare `> 0` |
| Non-scalar `status` in JSON body | `CheckpointEventStatus::normalizeInput()` passes through; `string` validation returns 422 |

### Partial status and realtime

Backend `PatrolBroadcastService::checkpointUpdated()` emits `PatrolCheckpointVerified` for `verified` and `PatrolCheckpointSuspicious` for `suspicious`, `needs_review`, or legacy `uncertain`. It does **not** broadcast a dedicated event for `partial` or `missed`.

The frontend `resolveCheckpointRealtimeUpdate()` includes a `partial` branch (info toast, no dashboard counter increment) for forward compatibility, but operators should expect **`partial` checkpoint evidence to appear after validation completes**, session reload, or **Re-run Validation** — not as a live monitoring alert.

---

## 11. Final M8 Pass Statement

**M8 passes:** A guard following a plausible road path with realistic GPS noise (including a poor-accuracy drift spike) is no longer marked `suspicious`; true severe GPS jumps and missed checkpoints remain detectable; the UI uses operational review language; configurable thresholds and documentation are in place; focused backend and frontend test suites pass.
