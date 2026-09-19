# M12 — Patrol and Profile Integration

**Milestone:** Blockchain M12 — Patrol and Profile Integration  
**Status:** Complete  
**Implementation repositories:** `backend`, `frontend` (monitoring labels only)  
**Prior milestone:** M11 — Blockchain Monitoring Frontend

---

## 1. Milestone Summary

Blockchain **M12** extends the centralized Laravel proof layer to **patrol validation results** and **inspects Profile M13** for alignment without duplicating profile work.

Patrol integration anchors a deterministic hash after `POST /api/patrol-sessions/{id}/validate` completes. The proof uses `entity_type = patrol_session`, `proof_type = validation_result`, and the central `blockchain_records` table. Anchoring is asynchronous; the validation API does not wait for on-chain confirmation.

Profile M13 (`ProfileBlockchainService`) was inspected and confirmed **already aligned** — no profile code changes were required.

---

## 2. Scope

### In scope

| Area | Delivered |
|------|-----------|
| Patrol proof creation | After successful validation via `BlockchainPatrolIntegrationService` |
| Patrol canonical payload | Safe validation summary (no raw GPS or PII) |
| Patrol verification | Recompute hash from persisted session/checkpoint/metric data |
| Idempotency | `record_hash` in unique key; same result reuses row |
| Profile M13 inspection | Confirmed existing implementation meets criteria |
| Frontend monitoring | `patrol_session` → **Patrol Session** (pre-existing M11 labels verified) |

### Out of scope

| Item | Notes |
|------|-------|
| Solidity / Hardhat changes | Not required |
| AI ANPR changes | Not touched |
| New module-specific blockchain tables | Reuses `blockchain_records` |
| Profile re-implementation | M13 already complete |
| Broadening M11 Admin-only access | Preserved |

---

## 3. Baseline Audit (Pre-Implementation)

### Backend (before M12)

| Capability | State |
|------------|-------|
| `BlockchainRecordService::createForPayload()` | **Present** (Profile M13) |
| Hash-aware duplicate prevention (`record_hash` in unique key) | **Present** (migration `2026_06_29_120000`) |
| `user_profile` proof support | **Implemented** (Profile M13) |
| `patrol_session` real hashing/verification | **Missing** — seeder had display-only mock rows |
| Patrol validate → blockchain trigger | **Missing** |

### Frontend (before M12)

| Capability | State |
|------------|-------|
| `patrol_session` → **Patrol Session** | **Already present** in repository + filters |
| `user_profile` → **User Profile** | **Already present** |
| Safe `payload_summary` display | **Already present** (M11) |

---

## 4. Files Changed

### Backend (`backend`)

| File | Change |
|------|--------|
| `app/Services/Blockchain/BlockchainPatrolIntegrationService.php` | **New** — patrol proof creation after validation |
| `app/Services/Blockchain/BlockchainHashService.php` | Patrol validation payload + summary builders |
| `app/Services/Blockchain/BlockchainVerificationService.php` | Patrol session recomputation verification |
| `app/Services/PatrolValidationService.php` | `collectMovementAnomalySummary()` for read-only counts |
| `app/Http/Controllers/Api/PatrolSessionController.php` | Trigger patrol blockchain after validation |
| `tests/Feature/Blockchain/PatrolBlockchainIntegrationTest.php` | **New** feature tests |
| `tests/Unit/Blockchain/BlockchainHashServiceTest.php` | Patrol payload unit tests |
| `tests/Unit/Blockchain/BlockchainVerificationServiceTest.php` | Patrol verification unit tests |

### Frontend (`frontend`)

| File | Change |
|------|--------|
| `src/feature/blockchain-monitoring/repositories/BlockchainMonitoringRepository.test.js` | Added explicit `patrol_session` label test |

### Documentation

| File | Change |
|------|--------|
| `blockchain/docs/m12-patrol-and-profile-future-integration.md` | **This document** |
| `backend/documentation.md` | Patrol validation blockchain note |
| `blockchain/README.md` | M12 status |

---

## 5. Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Proof trigger | `PatrolSessionController@validateSession` after `PatrolValidationService` | Validation must finish before hash reflects final checkpoint results |
| Integration service | `BlockchainPatrolIntegrationService` | Mirrors `BlockchainAnprIntegrationService`; keeps controller thin |
| Payload builder | `BlockchainHashService::buildPatrolSessionValidationPayloadFromDatabase()` | Single builder for anchor + verify; reads persisted checkpoint events/metrics |
| Movement counts | `PatrolValidationService::collectMovementAnomalySummary()` at verify time | Read-only; no GPS in payload; consistent gap/anomaly totals |
| Duplicate policy | Reuse row when `record_hash` matches | Schema unique key includes `record_hash` |
| Profile | Inspect only | M13 already implements password/email/2FA proofs |
| Frontend | No dashboard redesign | M11 labels already support patrol/profile entity types |

---

## 6. Patrol Blockchain Integration

### Flow

```text
POST /api/patrol-sessions/{id}/validate
    ↓
PatrolValidationService validates session (persists checkpoint_events + metrics)
    ↓
BlockchainPatrolIntegrationService::anchorValidationResult()
    ↓
BlockchainRecordService::createForPayload() → pending/queued blockchain_records row
    ↓
AnchorBlockchainRecordJob dispatched (when BLOCKCHAIN_ENABLED=true)
    ↓
API returns validation response immediately (no RPC wait)
```

### Record identity

| Field | Value |
|-------|-------|
| `entity_type` | `patrol_session` |
| `entity_id` | `patrol_sessions.id` |
| `proof_type` | `validation_result` |

### Failure handling

Blockchain creation failures are logged with sanitized messages. Patrol validation and checkpoint persistence **always succeed** independently.

---

## 7. Patrol Canonical Payload

Safe fields included in the canonical hash (not raw GPS):

| Field | Source |
|-------|--------|
| `module` | `patrol` |
| `entity_type`, `entity_id`, `proof_type` | Fixed proof identity |
| `patrol_session_id`, `zone_id`, `user_id` | UUID references only |
| `status`, `started_at`, `ended_at` | Session metadata (stable across re-validation) |
| `total_location_logs` | Count only |
| `total_checkpoint_count` | Zone checkpoint count |
| `total_checkpoint_result_count` | Persisted checkpoint event count |
| `total_gaps`, `total_anomalies` | Movement summary counts (no coordinates) |
| `checkpoint_results[]` | Per checkpoint: UUID, status, detection_type, normalized scores |

### Excluded from payload and summary

- `validated_at` / `processed_at` (volatile on re-validation; omitted so identical results reuse the same proof hash)
- Latitude, longitude, altitude
- Raw GPS route points
- Checkpoint names
- User name, email, phone, address
- Full anomaly messages with route details
- Tokens, secrets, private keys

---

## 8. Patrol Verification Behavior

`BlockchainVerificationService` handles `patrol_session` / `validation_result` by:

1. Loading the source `PatrolSession`
2. Recomputing movement counts via `collectMovementAnomalySummary()` (reads location log timestamps only — no coordinates enter the canonical payload)
3. Building canonical payload from persisted checkpoint events + metrics
4. Comparing recomputed hash with stored `record_hash`
5. Querying on-chain proof when confirmed

Verification reads location logs to recompute aggregate movement counts (`total_location_logs`, `total_gaps`, `total_anomalies`), but the **canonical payload and payload summary never include coordinates or route points**. Checkpoint tamper detection uses persisted session/checkpoint/metric fields.

| Condition | Result |
|-----------|--------|
| DB data unchanged + on-chain proof exists | `valid` |
| Persisted validation data changed | `tampered` |
| Record not confirmed | `pending` |
| On-chain hash missing | `onchain_missing` |
| Patrol session deleted | `failed` (safe error) |

Verification does **not** rely solely on stored `payload_summary` for patrol records.

---

## 9. Profile M13 Inspection Result

Profile blockchain integration under `profile-module.md` M13 was inspected against M12 criteria:

| Criterion | Status |
|-----------|--------|
| `entity_type = user_profile` | **Met** |
| Password change → `profile_password_changed` | **Met** |
| Email confirmation → `profile_email_changed` | **Met** |
| 2FA verify → `profile_2fa_reconfigured` | **Met** |
| Start/pending flows do not create records | **Met** (tests pass) |
| Safe payloads (no raw password/OTP/email/token) | **Met** |
| APIs do not wait for blockchain confirmation | **Met** |
| Blockchain failures do not roll back profile changes | **Met** |
| Frontend `user_profile` → **User Profile** | **Met** (M11) |
| Tests exist and pass | **Met** (`ProfileBlockchainIntegrationTest` — 12 passed) |

**Conclusion:** Profile M13 is aligned. **No profile code changes** were made in M12.

---

## 10. Frontend Monitoring Alignment

M11 already provides:

- Filter option **Patrol Session** (`patrol_session`)
- Filter option **User Profile** (`user_profile`)
- `ENTITY_TYPE_LABELS` in `BlockchainMonitoringRepository.js`
- Safe `payload_summary` key-value display (filters `private`, `secret`, `rpc`)
- No raw canonical JSON, Web3, or wallet dependency

M12 added one explicit Vitest case for `patrol_session` entity label normalization.

---

## 11. Security and Privacy Controls

| Control | Implementation |
|---------|----------------|
| Hash-only on-chain storage | Unchanged — Solidity stores `bytes32` only |
| No raw GPS on-chain | Patrol payload uses counts and checkpoint summaries only |
| No raw profile data on-chain | Profile M13 uses hashed email change fields only |
| Async anchoring | `AnchorBlockchainRecordJob`; API returns before confirmation |
| Laravel source of truth | DB holds business data; blockchain is proof layer |
| Central `blockchain_records` | No patrol/profile-specific blockchain tables |
| Admin-only monitoring | M11 access policy preserved |
| Sanitized failure logs | ANPR/patrol/profile integration services sanitize errors |

---

## 12. Tests Added or Updated

### Backend feature

| File | Coverage |
|------|----------|
| `PatrolBlockchainIntegrationTest.php` | Record creation, async behavior, disabled mode, idempotency (including time-advanced re-validation), hash-distinct re-proof, failure isolation, payload safety |

### Backend unit

| File | Coverage |
|------|----------|
| `BlockchainHashServiceTest.php` | Deterministic patrol payload, score normalization, tamper hash change, GPS exclusion |
| `BlockchainVerificationServiceTest.php` | Patrol valid/tampered/missing session |

### Profile regression

| File | Result |
|------|--------|
| `ProfileBlockchainIntegrationTest.php` | **12 passed** (unchanged) |

### Frontend

| File | Coverage |
|------|----------|
| `BlockchainMonitoringRepository.test.js` | `patrol_session` → **Patrol Session** |

---

## 13. Commands Run and Results

| Command | Result |
|---------|--------|
| `php artisan test --filter=PatrolBlockchainIntegrationTest` | **8 passed** |
| `php artisan test --filter=Blockchain` | **265 passed** |
| `php artisan test --filter=ProfileBlockchainIntegrationTest` | **12 passed** |
| `php artisan test --filter=BlockchainVerificationServiceTest` | **29 passed** |
| `npm run test -- --run src/feature/blockchain-monitoring` | **21 passed** (3 files) |
| `npm run build` (frontend) | **Success** |

Solidity/Hardhat commands were **not run** — no contract files changed.

```bash
cd backend
php artisan test --filter=Blockchain
php artisan test --filter=PatrolBlockchainIntegrationTest
php artisan test --filter=ProfileBlockchainIntegrationTest

cd frontend
npm run test -- --run src/feature/blockchain-monitoring
npm run build
```

---

## 14. Known Limitations

- `patrol_sessions.blockchain_record_id` links the **first** proof only (matches ANPR event pattern). Re-validation with a changed hash creates additional `blockchain_records` rows discoverable via entity filters; the session FK is not updated to the latest proof.
- Re-validation idempotency depends on stable canonical fields only; volatile timestamps such as checkpoint `processed_at` are **not** hashed.
- Verification re-reads location log timestamps to derive movement aggregate counts; coordinates are never included in payload or summary.
- Seeded demo patrol blockchain rows in `BlockchainRecordSeeder` remain mock metadata for empty-database demos; real proofs come from validation.
- No cross-link from blockchain dashboard to patrol session detail pages (M11 limitation unchanged).

---

## 15. Manual Demo Checklist

1. Enable blockchain in Laravel `.env` (`BLOCKCHAIN_ENABLED=true`) with Ganache contract configured.
2. Log in as a **Guard** and complete a patrol with location logs.
3. Call `POST /api/patrol-sessions/{id}/validate` (or use Stop Patrol in the PWA).
4. Confirm validation response returns immediately with checkpoint results.
5. Log in as **Admin** → **Blockchain Monitoring**.
6. Filter entity type **Patrol Session**; confirm a `validation_result` record appears.
7. Open record detail; verify safe `payload_summary` (no GPS coordinates).
8. After anchoring confirms, run **Verify** — expect **Valid** when data unchanged.
9. Tamper a `checkpoint_events.status` in the database; run **Verify** again — expect **Tampered**.
10. Confirm profile password/email/2FA changes still create **User Profile** records (M13 regression).

---

## 16. Completion Status

| Acceptance criterion | Status |
|---------------------|--------|
| Patrol validation creates blockchain record | **Complete** |
| `entity_type = patrol_session`, `proof_type = validation_result` | **Complete** |
| Validation API does not wait for confirmation | **Complete** |
| Patrol verification recomputes hash from DB | **Complete** |
| Tampering detectable | **Complete** |
| No raw GPS/profile data in payload | **Complete** |
| Profile M13 inspected, not duplicated | **Complete** |
| Monitoring displays patrol/profile records safely | **Complete** |
| Tests pass | **Complete** |
| M12 documentation created | **Complete** |

**Blockchain M12 — Patrol and Profile Future Integration is complete.**

---

## Related documentation

- [`m11-blockchain-monitoring-frontend.md`](m11-blockchain-monitoring-frontend.md)
- [`m10-anpr-module-integration.md`](m10-anpr-module-integration.md)
- [`../blockchain-module.md`](../blockchain-module.md)
- [`../../profile-module.md`](../../profile-module.md) — Profile M13
- [`../../backend/documentation.md`](../../backend/documentation.md)
