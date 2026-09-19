# M4 — Deterministic Hashing Architecture

**Milestone:** M4  
**Status:** Complete  
**Implementation repository:** `backend/`  
**Planning reference:** [`blockchain-module.md`](../blockchain-module.md)  
**Prior milestone:** [`m3-configuration-and-environment-management.md`](m3-configuration-and-environment-management.md)

This document lives under `blockchain/docs/` as **project-level blockchain milestone documentation**. M4 code changes are implemented in the Laravel backend only.

---

## 1. Milestone Summary

M4 adds **deterministic canonical JSON encoding and SHA-256 hashing** for supported Laravel entities. Hashing works entirely without Ethereum, Ganache, Sepolia, RPC calls, queue jobs, or transaction submission.

**Delivered:**

- `App\Support\BlockchainCanonicalJson` — stable canonical JSON encoder
- `App\Services\Blockchain\BlockchainHashService` — payload builders and SHA-256 hashing
- ANPR event v1 canonical payload rules (inclusion and exclusion lists)
- Unit tests under `tests/Unit/Blockchain/`

**Not delivered:** `blockchain_records` row creation, `BlockchainRecordService`, Ethereum RPC client, queue jobs, anchoring, verification APIs, Sepolia deployment, React dashboard, ANPR auto-anchoring on create.

---

## 2. Objective

Allow Laravel to:

1. Build stable canonical JSON from PHP arrays and supported entities.
2. Produce repeatable SHA-256 hashes for the same proof payload.
3. Normalize timestamps to UTC ISO-8601 with a `Z` suffix.
4. Tag hashes with `canonical_version` and `hash_algorithm` from M3 config.
5. Prepare a hashing foundation that M5 (`BlockchainRecordService`) will call.

---

## 3. Scope

| Area | M4 work |
| --- | --- |
| Canonical JSON helper | `app/Support/BlockchainCanonicalJson.php` |
| Hash service | `app/Services/Blockchain/BlockchainHashService.php` |
| Entity support | `AnprEvent` v1 payload (`entity_created` proof type) |
| Configuration | Reuses `config('blockchain.canonical_version')` and `config('blockchain.hash_algorithm')` |
| Tests | `BlockchainCanonicalJsonTest`, `BlockchainHashServiceTest` |
| Documentation | This file, `backend/documentation.md`, `frontend/documentation.md`, and `blockchain/README.md` |

---

## 4. Out of Scope

| Item | Milestone |
| --- | --- |
| `BlockchainRecordService` / pending proof rows | M5 |
| `AnchorBlockchainRecordJob` / queue execution | M6–M7 |
| `EthereumRpcClient` / live anchoring | M6+ |
| `BlockchainVerificationService` | M8 |
| Sepolia deployment | M9 |
| ANPR auto-anchoring on `AnprEventController@store` | M10 |
| React blockchain dashboard | M11 |
| Patrol session / image evidence payloads | Future milestones |

---

## 5. Files Created or Updated

### Created

| Path |
| --- |
| `backend/app/Support/BlockchainCanonicalJson.php` |
| `backend/app/Services/Blockchain/BlockchainHashService.php` |
| `backend/tests/Unit/Blockchain/BlockchainCanonicalJsonTest.php` |
| `backend/tests/Unit/Blockchain/BlockchainHashServiceTest.php` |
| `blockchain/docs/m4-deterministic-hashing-architecture.md` |

### Updated

| Path |
| --- |
| `backend/documentation.md` |
| `blockchain/README.md` |
| `frontend/documentation.md` (M4 backend-only note) |

---

## 6. Canonical JSON Design

`BlockchainCanonicalJson` converts PHP values into deterministic JSON suitable for hashing.

| Rule | Behavior |
| --- | --- |
| Associative arrays | Keys sorted alphabetically at every nesting level |
| List arrays | Element order preserved (`array_is_list`) |
| Empty PHP arrays | Encoded as JSON lists (`[]`), not objects (`{}`) |
| Scalars | `bool`, `null`, `int`, `float`, and `string` passed through unchanged |
| Timestamps | `DateTimeInterface` / Carbon normalized to UTC `Y-m-d\TH:i:s\Z` |
| Encoding flags | `JSON_UNESCAPED_SLASHES`, `JSON_UNESCAPED_UNICODE`, `JSON_THROW_ON_ERROR` |
| Whitespace | Compact JSON only (no pretty-print) |
| Unsupported types | Throws `InvalidArgumentException` |

**Public API:**

```php
BlockchainCanonicalJson::encode(array $payload): string;
BlockchainCanonicalJson::normalize(mixed $value): mixed;
```

---

## 7. Hash Service Design

`BlockchainHashService` reads M3 configuration and returns a testable result structure:

```php
[
    'canonical_version' => 'v1',
    'hash_algorithm' => 'sha256',
    'canonical_payload' => [...],
    'canonical_json' => '{"..."}',
    'record_hash' => '<64-character lowercase sha256 hex>',
]
```

| Method | Purpose |
| --- | --- |
| `hashPayload(array $payload)` | Canonicalize and SHA-256 hash a raw payload array |
| `buildAnprEventPayload(AnprEvent $event, string $proofType)` | Build ANPR v1 canonical fields |
| `buildCanonicalPayloadForEntity(Model $entity, string $proofType)` | Dispatch to supported entity builders |
| `hashEntity(Model $entity, string $proofType)` | Build entity payload and hash it |

**Algorithm (M4):** `record_hash = hash('sha256', canonical_json)` where `canonical_json` is produced by `BlockchainCanonicalJson::encode()`.

Only `sha256` is supported in M4. Other `BLOCKCHAIN_HASH_ALGORITHM` values throw `InvalidArgumentException`.

---

## 8. ANPR v1 Canonical Payload Fields

| Field | Source | Notes |
| --- | --- | --- |
| `entity_type` | Constant `anpr_event` | Semantic module key |
| `entity_id` | `(string) $event->id` | UUID |
| `proof_type` | Method argument (default `entity_created`) | Proof lifecycle tag |
| `camera_id` | `(string) $event->camera_id` | Required linkage |
| `plate_number` | `(string) $event->plate_number` | Normalized plate text |
| `confidence` | `number_format(..., 4, '.', '')` | Fixed four decimal places |
| `detection_time` | UTC ISO-8601 `Z` timestamp | From `detection_time` column |
| `is_flagged` | `(bool) $event->is_flagged` | Boolean |
| `is_valid` | `(bool) $event->is_valid` | Boolean |

Example canonical JSON field order after sorting:

```json
{
  "camera_id": "camera-uuid",
  "confidence": "0.9200",
  "detection_time": "2026-06-21T10:00:00Z",
  "entity_id": "anpr-event-uuid",
  "entity_type": "anpr_event",
  "is_flagged": false,
  "is_valid": true,
  "plate_number": "ABC1234",
  "proof_type": "entity_created"
}
```

---

## 9. Excluded Fields and Rationale

The following `AnprEvent` attributes are **not** included in the v1 canonical payload:

| Excluded field | Rationale |
| --- | --- |
| `created_at`, `updated_at` | Volatile persistence metadata |
| `blockchain_record_id` | Circular proof linkage; stored separately in `blockchain_records` |
| `vehicle_id` | May be linked or corrected later by Laravel business logic |
| `latitude`, `longitude` | GPS coordinates excluded from v1 hash proof (hash-only privacy rule) |
| Loaded relationships (`camera`, `vehicle`, `images`, `logs`) | Not part of entity scalar proof |
| Image rows / logs | Separate future `anpr_image` evidence hashes |
| On-chain transaction fields | Not present on `AnprEvent`; belong on `blockchain_records` |

---

## 10. Security and Privacy Notes

| Rule | M4 enforcement |
| --- | --- |
| Hash-only proof | Canonical payload excludes GPS, images, and raw metadata |
| No private keys in hashing | `BlockchainHashService` does not read wallet material |
| No Ethereum exposure | No RPC URLs, contracts, or transactions involved |
| Frontend isolation | React must not perform hashing for anchoring; Laravel remains source of truth |
| AI ANPR isolation | Python runtime does not build canonical blockchain payloads |
| Version tagging | `canonical_version` and `hash_algorithm` returned with every hash result |

---

## 11. Testing Summary

| Suite | Result |
| --- | --- |
| `php artisan test --filter=BlockchainCanonicalJson` | **8/8** passed |
| `php artisan test --filter=BlockchainHashService` | **10/10** passed |
| `php artisan test --filter=Blockchain` | **46/46** passed (M2 + M3 + M4) |
| `php artisan test` (full backend) | **167/167** passed |

**Canonical JSON tests:** key-order stability (top-level and nested), list order preservation, empty-array list encoding, scalar stability, UTC timestamp normalization, compact JSON output, unsupported type rejection.

**Hash service tests:** repeated hash stability, proof-type sensitivity, ANPR proof-field sensitivity, excluded-field insensitivity, metadata shape, lowercase 64-char SHA-256 hex, unsupported algorithm/entity exceptions, ANPR payload field inclusion rules.

---

## 12. Acceptance Criteria

| Criterion | Met |
| --- | --- |
| Same payload with different key order produces identical canonical JSON | Yes |
| Same supported entity produces the same SHA-256 hash repeatedly | Yes |
| ANPR v1 payload excludes volatile/privacy-sensitive fields | Yes |
| ANPR v1 payload includes required proof fields | Yes |
| Tests prove deterministic output, UTC normalization, SHA-256, version tagging | Yes |
| Hashing works without Ethereum/RPC/queues/transactions | Yes |
| No `blockchain_records` rows auto-created | Yes |
| No `AnprEventController@store` anchoring hook | Yes |
| M2/M3 blockchain tests still pass | Yes |

---

## 13. Known Limitations

1. **ANPR only** — `buildCanonicalPayloadForEntity()` supports `AnprEvent` only; other entity types throw `InvalidArgumentException`.
2. **No persistence** — M4 returns hash metadata in memory; M5 will write `blockchain_records` rows.
3. **Single algorithm** — Only `sha256` is implemented despite config allowing future values.
4. **Config coercion unchanged** — M3 `config/blockchain.php` integer casts remain for runtime access; validation behavior is unchanged from M3.

---

## 14. Handoff to M5

**M5 — Blockchain Record Service** should:

1. Introduce `BlockchainRecordService` to create pending `blockchain_records` rows.
2. Call `BlockchainHashService::hashEntity()` when registering proofs.
3. Persist `record_hash`, `canonical_version`, `hash_algorithm`, and a safe `payload_summary`.
4. Prevent duplicate proofs per `(entity_type, entity_id, proof_type, canonical_version, environment)`.
5. Remain read-only from the frontend until M11 dashboard work.

M4 provides the deterministic hashing foundation. Do not start anchoring (M6) before M5 record lifecycle exists.
