# M6 — Ganache Anchoring End-to-End

**Milestone:** M6  
**Status:** Complete  
**Implementation repository:** `backend/`  
**Contract reference:** `blockchain/contracts/EvidenceStore.sol`  
**Planning reference:** [`blockchain-module.md`](../blockchain-module.md)  
**Prior milestone:** [`m5-blockchain-record-service-and-read-apis.md`](m5-blockchain-record-service-and-read-apis.md)

This document lives under `blockchain/docs/` as **project-level blockchain milestone documentation**. M6 Laravel anchoring code runs in `backend/`; the on-chain contract remains in this Ethereum project.

---

## 1. Milestone Summary

M6 implements **Ganache anchoring end-to-end** from Laravel:

```text
blockchain_records (pending/queued)
    → AnchorBlockchainRecordJob
    → EthereumRpcClient
    → Ganache JSON-RPC
    → EvidenceStore.storeHash(bytes32)
    → tx_hash + block_number + confirmations
    → blockchain_records.status = confirmed
```

**Delivered:**

- `App\Services\Blockchain\EthereumRpcClient` — JSON-RPC client for Ganache unlocked-account transactions
- `App\Jobs\AnchorBlockchainRecordJob` — anchoring worker with `blockchain_jobs` audit rows
- `BlockchainRecordService` integration — queue dispatch when `BLOCKCHAIN_ENABLED=true`
- Automated tests with mocked JSON-RPC (no live Ganache required)

**Not delivered:** Sepolia anchoring, M7 retry/backoff, M8 verification APIs, M10 ANPR auto-anchoring, M11 React dashboard, private-key raw transaction signing for testnets.

---

## 2. Objective

Allow Laravel to:

1. Submit `storeHash(bytes32)` transactions to the Ganache-deployed `EvidenceStore` contract.
2. Persist `tx_hash`, `block_number`, `confirmations`, `submitted_at`, and `confirmed_at`.
3. Transition `blockchain_records` through anchoring lifecycle states.
4. Record minimal `blockchain_jobs` audit rows for anchor attempts.
5. Keep React and AI ANPR isolated from Ethereum.

---

## 3. Delivered Scope

| Area | M6 work |
| --- | --- |
| RPC client | `EthereumRpcClient` |
| Queue job | `AnchorBlockchainRecordJob` |
| Record service | Queue dispatch when blockchain enabled |
| Status lifecycle | `pending` → `queued` → `processing` → `submitted` → `confirmed` / `failed` |
| Job audit | `blockchain_jobs` rows (`job_type = anchor`) |
| Tests | `EthereumRpcClientTest`, `BlockchainAnchoringTest` |

---

## 4. Out of Scope

| Item | Milestone |
| --- | --- |
| Sepolia deployment / Sepolia anchoring | M9 |
| Retry scheduling, exponential backoff, retry API | M7 |
| Verification service / manual verify endpoint | M8 |
| ANPR auto-anchoring on `AnprEventController@store` | M10 |
| React blockchain dashboard | M11 |
| Public blockchain record mutation APIs | Not planned |
| Signed Sepolia transactions via `BLOCKCHAIN_PRIVATE_KEY` | M6+ (not M6) |

---

## 5. Files Created or Updated

### Created

| Path |
| --- |
| `backend/app/Services/Blockchain/EthereumRpcClient.php` |
| `backend/app/Jobs/AnchorBlockchainRecordJob.php` |
| `backend/tests/Unit/Blockchain/EthereumRpcClientTest.php` |
| `backend/tests/Feature/Blockchain/BlockchainAnchoringTest.php` |
| `blockchain/docs/m6-ganache-anchoring-end-to-end.md` |

### Updated

| Path |
| --- |
| `backend/app/Services/Blockchain/BlockchainRecordService.php` |
| `backend/tests/Unit/Blockchain/BlockchainRecordServiceTest.php` |
| `backend/.env.example` |
| `backend/documentation.md` |
| `frontend/documentation.md` |
| `blockchain/README.md` |

---

## 6. Laravel Anchoring Flow

1. Caller invokes `BlockchainRecordService::createForEntity()` (M5 API remains read-only).
2. When `BLOCKCHAIN_ENABLED=false`, behavior stays M5: create/return `pending` row, no queue dispatch.
3. When `BLOCKCHAIN_ENABLED=true`:
   - New record: create `pending`, mark `queued`, dispatch `AnchorBlockchainRecordJob`.
   - Existing record: idempotent return; queue only if status is still `pending`.
4. Job loads record, skips if already `confirmed`.
5. Job marks record `processing`, creates/updates `blockchain_jobs` audit row.
6. `EthereumRpcClient::storeHash()` sends `eth_sendTransaction` to `EvidenceStore`.
7. Job fetches receipt, validates success, computes confirmations.
8. When confirmations ≥ `BLOCKCHAIN_CONFIRMATION_BLOCKS`, record becomes `confirmed`.
9. On failure, record becomes `failed` with sanitized `last_error`; job row becomes `failed`.

---

## 7. `EthereumRpcClient` Design

| Method | Purpose |
| --- | --- |
| `chainId()` | `eth_chainId` |
| `blockNumber()` | `eth_blockNumber` |
| `accounts()` | `eth_accounts` |
| `resolveSenderAddress()` | Configured wallet or first unlocked Ganache account |
| `storeHash($recordHash, $contractAddress)` | `eth_sendTransaction` with encoded `storeHash(bytes32)` |
| `transactionReceipt($txHash)` | `eth_getTransactionReceipt` |
| `confirmationsForReceipt($receipt)` | Latest block minus receipt block + 1 |
| `encodeStoreHashCallData($recordHash)` | `0x7fe88885` + 64-char hash hex |
| `normalizeRecordHash($recordHash)` | Validates and normalizes SHA-256 hex to `bytes32` |

**Call data encoding:**

```text
selector: storeHash(bytes32) → 0x7fe88885
data:     0x7fe88885 + <64 lowercase hex chars without extra 0x prefix>
```

**Contract address resolution:** `BlockchainRecord.contract_address` if set, else `config('blockchain.contract_address')`.

**Chain guard:** Live `eth_chainId` must match configured `BLOCKCHAIN_CHAIN_ID` when configured.

---

## 8. `AnchorBlockchainRecordJob` Design

| Step | Action |
| --- | --- |
| Load record | Skip if missing or `confirmed` |
| Processing | `BlockchainRecord::markAsProcessing()` |
| Audit row | `blockchain_jobs` with `job_type = anchor`, `status = processing`, `attempts` incremented |
| Submit | `EthereumRpcClient::storeHash()` |
| Submitted | `markAsSubmitted($txHash)` |
| Receipt | `transactionReceipt()` + success check |
| Confirmed | `markAsConfirmed()` when confirmations sufficient |
| Failure | `markAsFailed()` + job `failed` with sanitized error |

M6 does **not** schedule M7 retries or exponential backoff.

---

## 9. Status Transition Lifecycle

| Status | Meaning in M6 |
| --- | --- |
| `pending` | M5 local proof row; not yet queued |
| `queued` | Anchoring job dispatched |
| `processing` | Job started RPC work |
| `submitted` | `tx_hash` received; awaiting/storing receipt metadata |
| `confirmed` | Receipt successful and confirmations met |
| `failed` | RPC/transaction/receipt failure |

---

## 10. Transaction Metadata Persisted

| Field | When set |
| --- | --- |
| `tx_hash` | After `eth_sendTransaction` |
| `submitted_at` | On `markAsSubmitted()` |
| `block_number` | From transaction receipt |
| `confirmations` | From receipt + latest block |
| `confirmed_at` | On `markAsConfirmed()` |
| `last_error` | On failure (sanitized; no RPC URLs or private keys) |

---

## 11. JSON-RPC Calls Used

| Method | Purpose |
| --- | --- |
| `eth_chainId` | Chain validation |
| `eth_accounts` | Sender resolution when wallet address empty |
| `eth_sendTransaction` | Submit `storeHash(bytes32)` |
| `eth_getTransactionReceipt` | Confirm transaction success and block |
| `eth_blockNumber` | Confirmation count |

---

## 12. Ganache Configuration

Example Laravel `.env` for local M6:

```env
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_MODE=local
BLOCKCHAIN_NETWORK=ganache
BLOCKCHAIN_ENVIRONMENT=local
BLOCKCHAIN_CHAIN_ID=1337
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
BLOCKCHAIN_CONTRACT_ADDRESS=<from deployments/ganache/EvidenceStore.json>
BLOCKCHAIN_CONTRACT_ABI_PATH=../blockchain/deployments/ganache/EvidenceStore.json
BLOCKCHAIN_WALLET_ADDRESS=<optional Ganache owner account>
BLOCKCHAIN_PRIVATE_KEY=
BLOCKCHAIN_CONFIRMATION_BLOCKS=1
```

**Notes:**

- Copy `BLOCKCHAIN_CONTRACT_ADDRESS` from `blockchain/deployments/ganache/EvidenceStore.json` after `npm run deploy:ganache`.
- `BLOCKCHAIN_PRIVATE_KEY` is **not** required for M6 unlocked Ganache anchoring.
- `BLOCKCHAIN_ENABLED` remains `false` by default in `.env.example`.

### Manual local validation

```bash
cd blockchain
npm run deploy:ganache
npm run verify:ganache
```

Then configure Laravel `.env`, create a record via `BlockchainRecordService` (Tinker/tests), and process the anchoring queue.

### Database queue workflow

When `.env` uses:

```env
QUEUE_CONNECTION=database
```

`AnchorBlockchainRecordJob` is queued in the `jobs` table and **does not run automatically**. Keep a separate Laravel terminal running:

```bash
cd backend
php artisan queue:work
```

**Expected behavior:**

1. After `BlockchainRecordService::createForEntity()` with `BLOCKCHAIN_ENABLED=true`, the row may show `status = queued`.
2. When `php artisan queue:work` processes `AnchorBlockchainRecordJob`, the row should transition to `confirmed` (Ganache success path).
3. Persisted fields include `tx_hash`, `block_number`, `confirmations`, `submitted_at`, and `confirmed_at`.
4. The related `blockchain_jobs` audit row should show `job_type = anchor`, `status = success`, and `attempts = 1` on first success.

PHPUnit uses `QUEUE_CONNECTION=sync` in `phpunit.xml`, so automated tests do not require a running queue worker.

---

## 13. Security and Privacy Rules

| Rule | M6 enforcement |
| --- | --- |
| Hash-only on-chain | Only `bytes32` `record_hash` is sent in transaction data |
| No raw evidence on-chain | No plates, GPS, images, or canonical JSON in RPC payloads |
| Private keys optional for M6 | Ganache unlocked accounts via `eth_accounts` |
| Sanitized errors | `last_error` redacts RPC URLs and long secrets |
| Frontend isolation | No Web3/Ethereum in React (dashboard remains M11) |
| AI ANPR isolation | Python runtime does not call Ethereum |

---

## 14. Testing Summary

| Suite | Result |
| --- | --- |
| `php artisan test --filter=EthereumRpcClient` | **10/10** passed |
| `php artisan test --filter=BlockchainAnchoring` | **6/6** passed |
| `php artisan test --filter=Blockchain` | **83/83** passed |
| `php artisan test` (full backend) | **204/204** passed |

Tests use `Http::fake()` for JSON-RPC. **No live Ganache node is required** for automated tests.

---

## 15. Acceptance Criteria

| Criterion | Met |
| --- | --- |
| Laravel can call `storeHash(bytes32)` on Ganache via JSON-RPC | Yes |
| `blockchain_records` can reach `confirmed` with tx metadata | Yes |
| `blockchain_jobs` audit rows recorded | Yes |
| M5 behavior preserved when `BLOCKCHAIN_ENABLED=false` | Yes |
| No Sepolia anchoring | Yes |
| No M7 retry/backoff | Yes |
| No M8 verification APIs | Yes |
| No M10/M11 scope | Yes |
| Mocked RPC tests pass without live Ganache | Yes |

---

## 16. Known Limitations

1. **Ganache local default** — M6 uses `eth_sendTransaction` on Ganache; Sepolia uses signed txs via `EthereumTransactionSigner` (M9).
2. **Retry and refresh** — Implemented in M7/M8+ (`BlockchainRetryService`, `RefreshSubmittedBlockchainRecordJob`, Admin retry/refresh APIs).
3. **No public create API** — Records are created via integration services internally.
4. **Sync receipt assumption** — Job expects receipt available after send (typical on Ganache).
5. **Owner-only contract** — Laravel wallet must be `EvidenceStore` owner on the target network.

---

## 17. Handoff to M7

**M7 — Retry Strategy and Failure Handling** — **Complete**. See [`m7-retry-and-failure-handling.md`](m7-retry-and-failure-handling.md).

M6 provides the first successful Ganache anchoring path. Sepolia anchoring is documented in M9.
