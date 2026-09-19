# M8 — Verification System

**Milestone:** M8  
**Status:** Complete  
**Implementation repository:** `backend/`  
**Contract reference:** `blockchain/contracts/EvidenceStore.sol`  
**Planning reference:** [`blockchain-module.md`](../blockchain-module.md)  
**Prior milestone:** [`m7-retry-and-failure-handling.md`](m7-retry-and-failure-handling.md)

This document lives under `blockchain/docs/` as **project-level blockchain milestone documentation**. M8 verification logic runs in `backend/`; the on-chain contract is unchanged.

> **Access policy (current):** All `GET/POST /api/blockchain-records/*` endpoints are **Admin only** (`admin` middleware). Sections below that mention Security Operator access reflect the original M8 draft; Profile M13 reconfirmed Admin-only. See [`m11-blockchain-monitoring-frontend.md`](m11-blockchain-monitoring-frontend.md).

---

## 1. Milestone Summary

M8 implements a **backend verification system** that answers whether a blockchain record is still valid, tampered, pending anchoring, failed to verify, or missing on-chain.

**Delivered:**

- `App\Services\Blockchain\BlockchainVerificationService` — recompute hash, compare locally, optional on-chain `verifyHash(bytes32)` read
- `EthereumRpcClient::verifyHash()` — `eth_call` read-only contract query
- `POST /api/blockchain-records/{id}/verify` — **Admin only** manual verification
- `blockchain_verifications` persistence for every attempt
- `blockchain_jobs` audit rows with `job_type = verify`
- PHPUnit coverage with mocked JSON-RPC (no live Ganache required)

**Not delivered:** Sepolia deployment (M9), React dashboard UI (M11), ANPR auto-anchoring (M10), Solidity changes.

---

## 2. Architecture Flow

```text
POST /api/blockchain-records/{id}/verify
    → BlockchainVerificationService::verify()
    → blockchain_jobs (verify, processing)
    → [if not confirmed] result = pending (no RPC)
    → [if confirmed] resolve source entity (anpr_event)
    → BlockchainHashService::hashEntity()
    → compare recomputed_hash vs stored record_hash
        → mismatch → tampered (no RPC)
        → match → EthereumRpcClient::verifyHash() via eth_call
            → true  → valid
            → false → onchain_missing
    → persist blockchain_verifications
    → finalize blockchain_jobs (success or failed)
    → return BlockchainVerificationResource
```

Laravel remains the source of truth. React and AI ANPR call Laravel APIs only.

---

## 3. Verification Decision Model

| Condition | `result` | RPC call | Verify job |
| --- | --- | --- | --- |
| Record not `confirmed` | `pending` | No | `success` |
| Unsupported / missing entity | `failed` | No | `failed` |
| Recomputed hash ≠ stored hash | `tampered` | No | `success` |
| Recomputed hash matches + on-chain true | `valid` | `eth_call` | `success` |
| Recomputed hash matches + on-chain false | `onchain_missing` | `eth_call` | `success` |
| Unexpected exception / RPC error | `failed` | May have been attempted | `failed` |

Hashes are stored as lowercase 64-character hex strings without `0x`, matching `blockchain_records.record_hash`.

---

## 4. Manual Verification Endpoint

| Property | Value |
| --- | --- |
| Method / path | `POST /api/blockchain-records/{blockchain_record}/verify` |
| Auth | `auth:api` + `admin` middleware |
| Allowed roles | **Admin** |
| Denied roles | **Security Operator**, **Guard** |
| Request body | None required |
| Response | `BlockchainVerificationResource` (**201 Created**) |

`POST /api/blockchain-records/{id}/retry` remains **Admin-only** (M7 unchanged).

---

## 5. Verification Audit Persistence

Each attempt creates:

**`blockchain_verifications`**

- `verification_type` (`manual` for API)
- `stored_hash`, `recomputed_hash`, `onchain_hash`
- `onchain_found`, `result`, `error_message`, `verified_at`
- `verified_by` (nullable; set for manual API calls)

**`blockchain_jobs`**

- `job_type = verify`
- `attempts = 1`, `max_attempts = 1`
- `status = success` for completed decisions (`valid`, `tampered`, `pending`, `onchain_missing`)
- `status = failed` for `failed` results

`GET /api/blockchain-records/{id}` returns `jobs` and `verifications` newest-first.

---

## 6. Ethereum RPC Read Call

`EthereumRpcClient::verifyHash()`:

- Selector: `verifyHash(bytes32)` → `0xef020f4a`
- Method: `eth_call` (read-only; no private key required)
- Decodes strict ABI-encoded `bool` return data: exactly `0x` + 64 hex characters
- Valid false: `0x` + 64 zeroes; valid true: `0x` + 63 zeroes + `1`
- Malformed `eth_call` results (wrong length, non-zero/non-one words, short values such as `0x1`, or non-string payloads) throw and are treated as verification failures
- Reuses chain ID validation and error sanitization from M6/M7

---

## 7. Authorization and Security

| Rule | Enforcement |
| --- | --- |
| Verify endpoint | `admin` middleware — **Admin only** |
| Retry endpoint | `admin` middleware — **Admin only** |
| Hash-only on-chain | Only `bytes32` hash sent in `eth_call` data |
| No raw evidence on-chain | No plates, GPS, images, or canonical JSON in RPC payloads |
| Sanitized errors | `BlockchainRetryService::sanitizeError()` redacts RPC URLs, secrets, tokens |
| No secrets in API | Responses exclude private keys, RPC URLs, canonical JSON |

---

## 8. Files Created or Updated

### Created

| Path |
| --- |
| `backend/app/Services/Blockchain/BlockchainVerificationService.php` |
| `backend/tests/Unit/Blockchain/BlockchainVerificationServiceTest.php` |
| `backend/tests/Feature/Blockchain/BlockchainVerificationTest.php` |
| `blockchain/docs/m8-verification-system.md` |

### Updated

| Path |
| --- |
| `backend/app/Services/Blockchain/EthereumRpcClient.php` |
| `backend/app/Http/Controllers/Api/BlockchainRecordController.php` |
| `backend/routes/api.php` |
| `backend/tests/Unit/Blockchain/EthereumRpcClientTest.php` |
| `backend/documentation.md` |
| `frontend/documentation.md` |
| `blockchain/README.md` |

---

## 9. Testing Summary

| Command | Result |
| --- | --- |
| `php artisan test --filter=EthereumRpcClient` | **28/28** passed |
| `php artisan test --filter=BlockchainVerificationService` | **20/20** passed |
| `php artisan test --filter=BlockchainVerification` | **33/3** passed |
| `php artisan test --filter=Blockchain` | **171/171** passed |
| `php artisan test` (full backend) | **292/292** passed |

Tests use `Http::fake()` for JSON-RPC. **No live Ganache node is required.**

---

## 10. Out of Scope

| Item | Milestone |
| --- | --- |
| Sepolia deployment / testnet-specific logic | M9 |
| React blockchain dashboard UI | M11 |
| ANPR auto-anchoring on event create | M10 |
| Solidity contract changes | Not required for M8 |
| Direct Ethereum calls from React or AI ANPR | Never |

---

## 11. Handoff to M9

**M9 — Sepolia deployment** should:

1. Deploy `EvidenceStore` to Sepolia and publish deployment metadata.
2. Configure Laravel `BLOCKCHAIN_NETWORK=sepolia` for staging/testnet environments.
3. Reuse M8 verification against Sepolia via configured RPC URL and contract address.
4. Keep M7 retry and M8 verification audit semantics unchanged across networks.

M8 provides manual and programmatic verification through Laravel. Dashboard consumption remains **M11**.
