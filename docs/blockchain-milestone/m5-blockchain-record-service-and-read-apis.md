# M5 — Blockchain Record Service and Read APIs

**Milestone:** M5  
**Status:** Complete  
**Implementation repository:** `backend/`  
**Planning reference:** [`blockchain-module.md`](../blockchain-module.md)  
**Prior milestone:** [`m4-deterministic-hashing-architecture.md`](m4-deterministic-hashing-architecture.md)

This document lives under `blockchain/docs/` as **project-level blockchain milestone documentation**. M5 code changes are implemented in the Laravel backend only.

> **Access policy (current):** All `GET/POST /api/blockchain-records/*` endpoints are **Admin only** (`admin` middleware). Sections below that mention Security Operator access reflect the original M5 draft; Profile M13 reconfirmed Admin-only. See [`m11-blockchain-monitoring-frontend.md`](m11-blockchain-monitoring-frontend.md).

---

## 1. Milestone Summary

M5 adds **pending blockchain proof row creation** for supported Laravel entities and preserves **read-only monitoring APIs** for **Admin** role. Proof rows are created locally in `blockchain_records` using M4 deterministic hashing. **Nothing is submitted to Ethereum.**

**Delivered:**

- `App\Services\Blockchain\BlockchainRecordService` — idempotent pending proof creation
- Safe `payload_summary` for ANPR events
- Optional `anpr_events.blockchain_record_id` back-link when empty
- Read API refinements verified by feature tests (`GET /api/blockchain-records`, `GET /api/blockchain-records/{id}`)
- Unit and feature tests for service behavior and API access

**Not delivered:** `EthereumRpcClient`, transaction signing, `AnchorBlockchainRecordJob`, queue dispatch, Sepolia deployment, verification service APIs, React dashboard, ANPR auto-anchoring on create.

---

## 2. Objective

Allow Laravel to:

1. Create `blockchain_records` rows in `pending` status for supported entities.
2. Reuse M4 `BlockchainHashService` for `record_hash` and proof metadata.
3. Prevent duplicate proofs per `(entity_type, entity_id, proof_type, canonical_version, environment)`.
4. Expose existing read-only blockchain record APIs for monitoring.
5. Operate without Ethereum RPC even when `BLOCKCHAIN_ENABLED=false`.

---

## 3. Scope

| Area | M5 work |
| --- | --- |
| Record service | `app/Services/Blockchain/BlockchainRecordService.php` |
| Hash integration | Calls `BlockchainHashService::hashEntity()` |
| Persistence | `blockchain_records` pending rows |
| ANPR back-link | Updates `anpr_events.blockchain_record_id` when null |
| Read APIs | Existing `BlockchainRecordController@index` / `show` |
| Authorization | **Admin only** via `admin` middleware |
| Tests | `BlockchainRecordServiceTest`, extended `BlockchainDatabaseFoundationTest` |

---

## 4. Out of Scope

| Item | Milestone |
| --- | --- |
| `EthereumRpcClient` / live RPC | M6 |
| `AnchorBlockchainRecordJob` / queue anchoring | M6–M7 |
| Transaction signing / `tx_hash` population | M6+ |
| `BlockchainVerificationService` write APIs | M8 |
| Sepolia deployment | M9 |
| ANPR auto-anchoring on `AnprEventController@store` | M10 |
| React blockchain dashboard | M11 |
| Public HTTP create/update/delete for blockchain records | Not in M5 |

---

## 5. Files Created or Updated

### Created

| Path |
| --- |
| `backend/app/Services/Blockchain/BlockchainRecordService.php` |
| `backend/tests/Unit/Blockchain/BlockchainRecordServiceTest.php` |
| `blockchain/docs/m5-blockchain-record-service-and-read-apis.md` |

### Updated

| Path |
| --- |
| `backend/tests/Feature/Blockchain/BlockchainDatabaseFoundationTest.php` |
| `backend/documentation.md` |
| `frontend/documentation.md` |
| `blockchain/README.md` |

---

## 6. Service Design

### `BlockchainRecordService`

| Method | Purpose |
| --- | --- |
| `createForEntity(Model $entity, string $proofType = 'entity_created')` | Create or return existing pending proof row |
| `findExistingProof(array $canonicalPayload, string $canonicalVersion, string $environment)` | Lookup by unique proof key |

**Creation flow:**

1. Call `BlockchainHashService::hashEntity($entity, $proofType)`.
2. Check for existing row via `findExistingProof()`.
3. If found, optionally link `AnprEvent.blockchain_record_id` when null and return existing row.
4. Otherwise create `blockchain_records` row with `status = pending`.
5. Persist hash metadata, config network/environment/chain fields, and safe `payload_summary`.
6. Link `anpr_events.blockchain_record_id` only when currently null.

**Idempotency:** Duplicate calls with the same entity and proof type return the same record without a database exception.

**Config behavior:** Works when `BLOCKCHAIN_ENABLED=false`. Metadata reflects `config('blockchain.network')`, `environment`, `chain_id`, and `contract_address`. Invalid local `chain_id` values (malformed strings, zero, or negative) are normalized to `null` on persisted rows rather than misleading `0`; strict validation remains in `BlockchainConfigValidator`.

---

## 7. Safe `payload_summary` (ANPR)

| Field | Included |
| --- | --- |
| `module` | `anpr` |
| `entity_type`, `entity_id`, `proof_type` | Yes |
| `plate_number`, `camera_id` | Yes |
| `detection_time` | UTC ISO-8601 `Z` |
| `confidence` | Four decimal places |
| `is_valid`, `is_flagged` | Yes |

| Excluded from `payload_summary` |
| --- |
| `canonical_json`, private keys, RPC URLs, ABI |
| GPS `latitude` / `longitude` |
| Raw images, logs, user PII |
| Full canonical payload |

---

## 8. Read API Behavior

| Endpoint | Access | Behavior |
| --- | --- | --- |
| `GET /api/blockchain-records` | **Admin only** | Paginated list; filters: `status`, `network`, `environment`, `entity_type`, `entity_id`; sort: `created_at`, `confirmed_at`, `block_number` |
| `GET /api/blockchain-records/{id}` | **Admin only** | Record detail with `jobs`, `verifications`, `verifications.verifiedBy` |
| Security Operator / Guard | Forbidden | `403` |

**No M5 mutation endpoints.** Record creation is service-only (future M10/M6 callers).

---

## 9. Security and Privacy Notes

| Rule | M5 enforcement |
| --- | --- |
| No Ethereum calls | Service creates local `pending` rows only |
| No queue dispatch | `BlockchainRecordService` does not enqueue jobs |
| No private keys in API/resources | Resources expose `record_hash` and safe `payload_summary` only |
| GPS excluded | Latitude/longitude not stored in `payload_summary` |
| Frontend isolation | React must not call Ethereum; dashboard remains M11 |
| AI ANPR isolation | Python runtime does not create blockchain records |

---

## 10. Testing Summary

| Suite | Result |
| --- | --- |
| `php artisan test --filter=BlockchainRecordService` | **17/17** passed |
| `php artisan test --filter=Blockchain` | **66/66** passed (M2 + M3 + M4 + M5) |
| `php artisan test` (full backend) | **187/187** passed |

**Service tests:** pending creation, M4 hash metadata, config metadata, safe `payload_summary`, sensitive field exclusion, idempotent duplicates, different proof types, unsupported entities, ANPR back-link rules, no queue dispatch, works when blockchain disabled.

**Feature tests:** authorization, list filters/pagination, show with relations, Guard forbidden, service-created records visible via API without secrets.

---

## 11. Acceptance Criteria

| Criterion | Met |
| --- | --- |
| Pending `blockchain_records` rows can be created for `AnprEvent` | Yes |
| Uses M4 `BlockchainHashService` | Yes |
| Duplicate proof prevention is idempotent | Yes |
| Safe `payload_summary` without canonical JSON or GPS | Yes |
| Read APIs work for Admin | Yes |
| Security Operator / Guard denied | Yes |
| Guard users forbidden | Yes |
| No Ethereum RPC, signing, or queue anchoring | Yes |
| No ANPR auto-anchoring on HTTP store | Yes |
| M2–M4 blockchain tests still pass | Yes |

---

## 12. Known Limitations

1. **ANPR only** — `createForEntity()` supports `AnprEvent` via `BlockchainHashService`.
2. **Pending only** — Rows remain `pending` until M6 anchoring jobs run.
3. **No public create API** — Callers must use `BlockchainRecordService` internally.
4. **Conservative ANPR link** — `blockchain_record_id` is set only when null; multiple proof types may exist while FK points to the first linked record.

---

## 13. Handoff to M6

**M6 — Ganache Anchoring and RPC Client** — **Complete**. See [`m6-ganache-anchoring-end-to-end.md`](m6-ganache-anchoring-end-to-end.md).

M5 provides local proof rows and read APIs. M6+ adds `EthereumRpcClient`, `AnchorBlockchainRecordJob`, and status transitions through `confirmed`.
