# M2 — Laravel Database Foundation

**Milestone:** M2  
**Status:** Complete  
**Implementation repository:** `backend/`  
**Planning reference:** [`blockchain-module.md`](../blockchain-module.md)  
**Prior milestone:** [`m1-ethereum-project-foundation.md`](m1-ethereum-project-foundation.md)

This document lives under `blockchain/docs/` as **project-level blockchain milestone documentation**. The M2 code changes are implemented in the Laravel backend only.

> **Access policy (current):** Blockchain record read APIs are **Admin only** (`admin` middleware). References below to Admin/Security Operator access reflect the original M2 draft; Profile M13 reconfirmed Admin-only. See [`m11-blockchain-monitoring-frontend.md`](m11-blockchain-monitoring-frontend.md).

---

## 1. Milestone Summary

M2 establishes the **Laravel database foundation** for the Blockchain Module: aligned `blockchain_records` schema, new `blockchain_jobs` and `blockchain_verifications` tables, Eloquent models, factories, API resources, seeders, and automated tests.

**Delivered:**

- Expanded `blockchain_records` aligned with `blockchain-module.md`
- `blockchain_jobs` and `blockchain_verifications` tables with foreign keys
- Models, relationships, factories, and JSON resources
- Feature tests under `tests/Feature/Blockchain/`
- Updated `BlockchainRecordSeeder` and read API validation for new enums

**Not delivered:** hashing services, Laravel config, Ethereum RPC, queue execution, Sepolia, ANPR auto-anchoring, React dashboard.

---

## 2. Objective

Provide a durable, testable persistence layer so later milestones can:

1. Create and track proof rows (`blockchain_records`).
2. Audit anchoring/verification job attempts (`blockchain_jobs`).
3. Store verification outcomes (`blockchain_verifications`).
4. Expose safe metadata through API resources without leaking secrets.

---

## 3. Scope

| Area | M2 work |
| --- | --- |
| Migrations | Align `blockchain_records`; add `blockchain_jobs`, `blockchain_verifications` |
| Models | `BlockchainRecord`, `BlockchainJob`, `BlockchainVerification` |
| Resources | `BlockchainRecordResource`, `BlockchainJobResource`, `BlockchainVerificationResource` |
| Factories | All three with realistic states |
| Tests | `BlockchainDatabaseFoundationTest` (12 cases after M2 cleanup) |
| Seeder | `BlockchainRecordSeeder` updated for new fields (**opt-in** — not run by default) |
| Controller | Expanded status/environment filters; `show` eager-loads related rows; **Admin only** access |

---

## 4. Out of Scope

| Item | Milestone |
| --- | --- |
| `config/blockchain.php` | M3 |
| `BlockchainHashService` / canonical JSON | M4 |
| `BlockchainRecordService` / write APIs | M5 |
| `EthereumRpcClient` / anchoring jobs | M6–M7 |
| Verification service logic | M8 |
| Sepolia deployment | M9 |
| ANPR auto-anchoring | M10 |
| React blockchain dashboard | M11 |
| Solidity / Hardhat changes | Not in M2 |

---

## 5. Architecture Alignment

| Module | M2 role |
| --- | --- |
| `backend` | Database schema, models, factories, resources, tests |
| `blockchain` | Unchanged — M1 contract/deploy artifact only |
| `frontend` | Unchanged — no Ethereum RPC; dashboard remains M11 |
| `anpr` | Unchanged — Laravel-only delivery |

Laravel remains the **source of truth**. On-chain anchoring is still **not** implemented in M2.

---

## 6. Files Created or Updated

### Created

| Path |
| --- |
| `database/migrations/2026_06_24_100000_create_blockchain_jobs_table.php` |
| `database/migrations/2026_06_24_100001_create_blockchain_verifications_table.php` |
| `app/Models/BlockchainJob.php` |
| `app/Models/BlockchainVerification.php` |
| `database/factories/BlockchainRecordFactory.php` |
| `database/factories/BlockchainJobFactory.php` |
| `database/factories/BlockchainVerificationFactory.php` |
| `app/Http/Resources/BlockchainJobResource.php` |
| `app/Http/Resources/BlockchainVerificationResource.php` |
| `tests/Feature/Blockchain/BlockchainDatabaseFoundationTest.php` |

### Updated

| Path |
| --- |
| `database/migrations/2026_05_07_004434_create_blockchain_records_table.php` |
| `app/Models/BlockchainRecord.php` |
| `app/Models/User.php` |
| `app/Http/Resources/BlockchainRecordResource.php` |
| `app/Http/Controllers/Api/BlockchainRecordController.php` |
| `database/seeders/BlockchainRecordSeeder.php` |
| `database/seeders/DatabaseSeeder.php` |
| `backend/documentation.md` |
| `frontend/documentation.md` |

---

## 7. Database Schema Summary

### `blockchain_records` (aligned)

| Column | Notes |
| --- | --- |
| `record_hash` | Replaces legacy `hash` (char 64) |
| `proof_type`, `canonical_version`, `hash_algorithm` | Proof metadata |
| `payload_summary` | JSON nullable — safe dashboard metadata only |
| `environment` | `local`, `staging`, `production` (replaces `development`/`production`) |
| `chain_id`, `contract_address`, `confirmations` | On-chain metadata placeholders |
| `status` | `pending`, `queued`, `processing`, `submitted`, `confirmed`, `failed` |
| `last_error` | Replaces legacy `error_message` |
| Unique | `(entity_type, entity_id, proof_type, canonical_version, environment)` |

### `blockchain_jobs`

Tracks business-level job attempts per record (`anchor`, `retry_anchor`, `verify`, `refresh_confirmation`).

### `blockchain_verifications`

Stores verification attempts and results (`valid`, `tampered`, `pending`, `failed`, `onchain_missing`). Append-only (`created_at` only).

---

## 8. Eloquent Model Relationships

```text
BlockchainRecord hasMany BlockchainJob
BlockchainRecord hasMany BlockchainVerification
BlockchainRecord morphTo entity (semantic key — see caveat below)

BlockchainJob belongsTo BlockchainRecord

BlockchainVerification belongsTo BlockchainRecord
BlockchainVerification belongsTo User (verifiedBy)

User hasMany BlockchainVerification (verified_by)
```

**`entity()` caveat:** `entity_type` values such as `anpr_event` are semantic module keys. `morphTo()` is retained for future use but **must not** be relied on until a morph map or resolver is added in M4/M5+.

---

## 9. Factory and Test Coverage

**Factories** support states such as `pending`, `queued`, `submitted`, `confirmed`, `failed` records; successful/failed jobs; valid/tampered/pending/failed/onchain_missing verifications.

**Tests** (`php artisan test --filter=Blockchain`): 12 passing cases covering migrations/schema, factories, relationships, casts, scopes, unique constraint, resource field safety, show API with related rows, and Admin-only access boundary (Security Operator and Guard forbidden).

**Seeding:** `BlockchainRecordSeeder` provides safe mock demo rows. It is **not** registered in `DatabaseSeeder` by default; run `php artisan db:seed --class=BlockchainRecordSeeder` when demo blockchain rows are needed locally.

---

## 10. Privacy and Security Rules

| Rule | M2 enforcement |
| --- | --- |
| No raw evidence in DB blockchain tables | `payload_summary` is safe metadata only in factories/seeder |
| No secrets in resources | Resources exclude private keys, RPC URLs, wallet material |
| No canonical payloads in API | Resources expose `record_hash` and `payload_summary` only |
| Hash length | `record_hash` / verification hashes are 64-char hex |

---

## 11. Known Limitations

1. **No live anchoring** — `tx_hash` / `confirmed` rows in seeds are mock/demo data.
2. **Read-only HTTP API** — existing `blockchain-records` index/show only; job/verification list APIs are M5+.
3. **No queue workers** — `blockchain_jobs` rows are not dispatched or processed in M2.
4. **Migration strategy** — `blockchain_records` create migration was aligned in place for development `migrate:fresh` workflows.

---

## 12. Acceptance Criteria

| Criterion | Met |
| --- | --- |
| `blockchain_records` aligned with module design | Yes |
| `blockchain_jobs` and `blockchain_verifications` created | Yes |
| Models, relationships, factories, resources | Yes |
| Tests pass (`--filter=Blockchain`) | Yes (12/12) |
| `migrate:fresh` succeeds | Yes |
| No Ethereum RPC / hashing / queue execution | Yes |
| Documentation updated | Yes |

---

## 13. Handoff to M3

**M3 — Configuration and environment management** should:

1. Add `config/blockchain.php` and `.env.example` blockchain variables.
2. Point `BLOCKCHAIN_CONTRACT_ABI_PATH` to `../blockchain/deployments/ganache/EvidenceStore.json`.
3. Validate required config when blockchain is enabled.

M2 provides the tables and models M3+ services will use. Do not start hashing (M4) or anchoring (M6) before configuration (M3) is in place.

---

## 14. M2 Cleanup Follow-Up (post-review)

Small hardening applied after initial M2 acceptance. **No M3+ functionality was added.**

| Item | Resolution |
| --- | --- |
| `BlockchainRecord::entity()` | Kept with docblock — semantic `entity_type` keys require a future morph map before business logic should call `entity()` |
| `BlockchainRecordController@show` | Eager-loads `jobs`, `verifications`, `verifications.verifiedBy` |
| API access control | `admin` middleware — **Admin only** (Security Operator and Guard forbidden) |
| `BlockchainRecordSeeder` | Remains **opt-in**; commented in `DatabaseSeeder` with explicit note |
| Documentation | Backend + frontend docs updated; file list corrected in this document |
| Frontend | No blockchain UI implemented — dashboard remains **M11**; SPA still must not call Ethereum RPC directly |

---

## References

- [`../blockchain-module.md`](../blockchain-module.md) — §9 Database Design
- [`m0-architecture-finalization-and-repository-split.md`](m0-architecture-finalization-and-repository-split.md)
- [`m1-ethereum-project-foundation.md`](m1-ethereum-project-foundation.md)
- [`../../backend/documentation.md`](../../backend/documentation.md)
