# M7 — Retry and Failure Handling

**Milestone:** M7  
**Status:** Complete  
**Implementation repository:** `backend/`  
**Contract reference:** `blockchain/contracts/EvidenceStore.sol` (unchanged)  
**Planning reference:** [`blockchain-module.md`](../blockchain-module.md)  
**Prior milestone:** [`m6-ganache-anchoring-end-to-end.md`](m6-ganache-anchoring-end-to-end.md)

This document lives under `blockchain/docs/` as **project-level blockchain milestone documentation**. M7 Laravel retry logic runs in `backend/`; the on-chain contract is unchanged.

> **Access policy (current):** All `GET/POST /api/blockchain-records/*` endpoints are **Admin only** (`admin` middleware). Sections below that mention Security Operator verify access reflect later-milestone drafts superseded by Admin-only policy. See [`m11-blockchain-monitoring-frontend.md`](m11-blockchain-monitoring-frontend.md).

---

## 1. Milestone Summary

M7 adds **reliable retry and failure handling** for Laravel Ganache anchoring when JSON-RPC or network calls fail.

**Delivered:**

- `App\Services\Blockchain\BlockchainRetryService` — exponential backoff, retry eligibility, centralized error sanitization
- Refactored `App\Jobs\AnchorBlockchainRecordJob` — explicit business retries (Laravel queue `tries = 1`)
- `BlockchainRecordService::retryFailedRecord()` — manual admin retry
- `POST /api/blockchain-records/{id}/retry` — Admin-only manual retry API
- Extended `blockchain_jobs` audit history with `retry_anchor` rows
- Receipt-first recovery when `tx_hash` already exists (prevents duplicate `storeHash` submissions)
- Automated tests with mocked JSON-RPC (no live Ganache required)

**Not delivered:** Sepolia anchoring, M8 verification APIs, M10 ANPR auto-anchoring, M11 React dashboard, Solidity changes.

---

## 2. Architecture Flow

```text
blockchain_records (pending/queued/failed)
    → AnchorBlockchainRecordJob (tries = 1)
    → [if tx_hash exists] transactionReceipt poll only
    → [else] EthereumRpcClient.storeHash(bytes32)
    → success → confirmed + blockchain_jobs.success
    → failure → sanitized last_error + blockchain_jobs.failed
        → if attempts < BLOCKCHAIN_MAX_RETRIES
            → next_attempt_at = now + exponential backoff
            → record.status = queued (last_error preserved)
            → delayed AnchorBlockchainRecordJob (retry_anchor)
        → else permanent failed (retryable via admin API)
```

---

## 3. Retry Lifecycle

| Stage | `blockchain_records.status` | `blockchain_jobs` |
| --- | --- | --- |
| Initial dispatch | `queued` → `processing` | `job_type = anchor`, `status = processing` |
| RPC / receipt failure (retryable) | `failed` → `queued` | failed row with `next_attempt_at`, new delayed `retry_anchor` queued |
| Automatic retry execution | `processing` | `job_type = retry_anchor`, `status = processing` |
| Success | `confirmed` | `status = success`, `last_error = null` |
| Max attempts exhausted | `failed` | `status = failed`, `next_attempt_at = null` |
| Admin manual retry | `failed` → `queued` | new `retry_anchor` row, immediate dispatch |

---

## 4. Automatic Retry Behavior

| Setting | Env variable | Default |
| --- | --- | --- |
| Max anchoring attempts | `BLOCKCHAIN_MAX_RETRIES` | `5` |
| Backoff base delay (seconds) | `BLOCKCHAIN_RETRY_BASE_SECONDS` | `10` |

**Backoff formula:**

```text
delay_seconds = retry_base_seconds × 2^(attempt_number − 1)
```

| Failure # | Delay (base = 10s) |
| --- | --- |
| 1 | 10s |
| 2 | 20s |
| 3 | 40s |
| 4 | 80s |

**Rules:**

- Business retries are **not** driven by Laravel worker `--tries`; `AnchorBlockchainRecordJob::$tries = 1`.
- `retry_count` on `blockchain_records` increments only on failure (not on success).
- `last_error` on the record is preserved during automatic re-queue for dashboard visibility.
- Confirmed records are skipped safely (no RPC calls).
- If `tx_hash` is already set, the job polls `eth_getTransactionReceipt` before attempting another `storeHash`.
- Automatic retries create a visible queued `retry_anchor` audit row before dispatch; the delayed Laravel job carries that row's id.
- Before RPC, retry jobs validate their queued audit row is still current; stale jobs are marked `cancelled` without incrementing `retry_count` or calling RPC.
- Queued retry jobs are also cancelled before RPC if the record has already advanced to `processing`, `submitted`, or `confirmed`.
- Confirmed-record short-circuit only cancels matching queued `retry_anchor` jobs for the same record.
- Stale retry cancellation uses the same record/type/status guard as confirmed-record short-circuit cancellation.
- Manual retry cancels superseded queued `retry_anchor` rows for the same record before dispatching a new retry.
- `GET /api/blockchain-records/{id}` returns related `jobs` newest-first (`created_at` desc).

---

## 5. Manual Retry Endpoint

| Property | Value |
| --- | --- |
| Method / path | `POST /api/blockchain-records/{blockchain_record}/retry` |
| Auth | `auth:api` + `admin` middleware |
| Allowed roles | **Admin** only |
| Denied roles | Security Operator, Guard |
| Eligible record status | `failed` only |
| Request body | None required |
| Response | `BlockchainRecordResource` with loaded `jobs` |

**Rejected cases (422):**

- `confirmed`, `queued`, `processing`, `submitted`, or `pending` records

Manual retry creates a visible `retry_anchor` audit row and dispatches `AnchorBlockchainRecordJob` immediately. History is preserved (`retry_count` is not reset).

---

## 6. Error Sanitization Policy

Centralized in `BlockchainRetryService::sanitizeError()` (also used by `EthereumRpcClient`):

| Redacted pattern | Replacement |
| --- | --- |
| HTTP(S) URLs (RPC endpoints) | `[rpc-url-redacted]` |
| 64-character `0x` hex strings | `[secret-redacted]` |
| Bearer / token-like values | `[token-redacted]` |
| Configured `BLOCKCHAIN_PRIVATE_KEY` value | `[secret-redacted]` |

Stored errors are truncated to **1000 characters**. Useful context (e.g. `Sender account not authorized`, `Connection refused`) is preserved.

---

## 7. Files Created or Updated

### Created

| Path |
| --- |
| `backend/app/Services/Blockchain/BlockchainRetryService.php` |
| `backend/tests/Unit/Blockchain/BlockchainRetryServiceTest.php` |
| `backend/tests/Feature/Blockchain/BlockchainRetryTest.php` |
| `blockchain/docs/m7-retry-and-failure-handling.md` |

### Updated

| Path |
| --- |
| `backend/app/Jobs/AnchorBlockchainRecordJob.php` |
| `backend/app/Services/Blockchain/BlockchainRecordService.php` |
| `backend/app/Services/Blockchain/EthereumRpcClient.php` |
| `backend/app/Http/Controllers/Api/BlockchainRecordController.php` |
| `backend/routes/api.php` |
| `backend/tests/Feature/Blockchain/BlockchainAnchoringTest.php` |
| `backend/tests/Unit/Blockchain/EthereumRpcClientTest.php` |
| `backend/documentation.md` |
| `frontend/documentation.md` |
| `blockchain/README.md` |

---

## 8. API Resources (M7 fields)

`BlockchainRecordResource` and `BlockchainJobResource` expose dashboard-ready fields without secrets:

| Resource | Fields |
| --- | --- |
| Record | `status`, `retry_count`, `last_error`, `tx_hash`, `confirmations`, … |
| Job | `job_type`, `status`, `attempts`, `max_attempts`, `next_attempt_at`, `started_at`, `finished_at`, `last_error` |

No canonical JSON, private keys, or raw RPC URLs are returned.

---

## 9. Testing Summary

| Command | Result |
| --- | --- |
| `php artisan test --filter=BlockchainAnchoring` | **6/6** passed |
| `php artisan test --filter=BlockchainRetryService` | **12/12** passed |
| `php artisan test --filter=BlockchainRetry` | **37/37** passed |
| `php artisan test --filter=Blockchain` | **122/122** passed |
| `php artisan test` (full backend) | **243/243** passed |

**Coverage highlights:**

1. M6 success path preserved
2. RPC failure records failed job + sanitized error
3. Temporary failure schedules `next_attempt_at`
4. Exponential backoff increases delay
5. Retry stops after `BLOCKCHAIN_MAX_RETRIES`
6. Successful retry reaches `confirmed`
7. Confirmed records skipped safely
8. Manual retry: Admin allowed; Security Operator and Guard denied; non-failed records rejected
9. Error sanitization redacts RPC URLs and private-key-like values
10. Show API includes retry/job fields
11. Stale delayed retry jobs are skipped without RPC or retry increment
12. Manual retry cancels superseded queued retry jobs
13. Valid delayed retry jobs still execute and can confirm records
14. Show API returns jobs newest-first

Tests use `Http::fake()` and `Queue::fake()` where delayed dispatch must not run synchronously.

---

## 10. Out of Scope

| Item | Milestone |
| --- | --- |
| Sepolia deployment / signed testnet transactions | M9 |
| Verification service / `POST …/verify` | M8 |
| ANPR auto-anchoring on event create | M10 |
| React blockchain dashboard UI | M11 |
| Direct Ethereum calls from React or AI ANPR | Never |
| Solidity contract changes | Not required for M7 |

---

## 11. Handoff to M8

**M8 — Verification Service** should:

1. Implement hash recomputation and on-chain `verifyHash(bytes32)` comparison.
2. Persist results in `blockchain_verifications`.
3. Add `POST /api/blockchain-records/{id}/verify` for **Admin only**.
4. Reuse M7 sanitized error patterns and job audit conventions (`job_type = verify`).
5. Build on M7 retry state — failed anchors remain visible and manually retryable; confirmed records are the primary verification target.

M7 provides resilient anchoring with full job audit visibility. Do not add Sepolia anchoring until M9 contract deployment exists.
