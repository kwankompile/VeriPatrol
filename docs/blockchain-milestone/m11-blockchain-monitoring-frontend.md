# M11 — Blockchain Monitoring Frontend

**Milestone:** M11  
**Status:** Complete  
**Implementation repositories:** `frontend`, `backend` (summary + search support)  
**Prior milestone:** M10 — ANPR Module Integration

## 1. Milestone summary

M11 delivers the **React blockchain monitoring dashboard** for **administrators**. The UI surfaces Laravel-managed `blockchain_records`, related jobs, verifications, and safe payload summaries. All data is loaded through **Laravel REST APIs only** — no Web3, wallet connection, browser RPC calls, or direct Ethereum access in React.

The dashboard supports list filtering, summary metrics, record inspection, manual verification, retry for failed records, and optional confirmation refresh for submitted records with a transaction hash.

> **Access policy (current):** All `GET/POST /api/blockchain-records/*` routes and the React dashboard use **Admin only** (`admin` middleware + `adminOnly()` route guard). Earlier drafts described Security Operator access; that policy was not implemented. Profile M13 reconfirmed this Admin-only model when adding `user_profile` proof visibility.

A **follow-up polish patch** after initial M11 delivery addressed dashboard request concurrency, backend-aligned status labels, and README milestone consistency. No new API endpoints or routes were added in that patch.

## 2. Scope and non-scope

### In scope

| Area | Delivered |
|------|-----------|
| Feature module | `frontend/src/feature/blockchain-monitoring/` |
| Dashboard | Summary cards, filters, paginated table, failed-state alert |
| Record detail | Status, hashes, jobs timeline, verification panel, payload summary |
| Routes | `/admin/blockchain-monitoring`, `/admin/blockchain-monitoring/:blockchainRecordId` |
| Role access | **Admin only** (`adminOnly` route guard + Laravel `admin` middleware) |
| Backend support | `GET /api/blockchain-records/summary`, `search` on index, `entity_type`-only filter |
| Tests | Frontend Vitest + backend `BlockchainMonitoringApiTest` |

### Out of scope

| Item | Notes |
|------|-------|
| Web3 / ethers.js in React | Explicitly prohibited |
| Wallet connection UI | Not required |
| Browser Ethereum RPC | Not implemented |
| Private keys / RPC secrets in frontend | Not exposed |
| Raw canonical JSON display | Not shown |
| Solidity / Hardhat changes | Not touched |
| AI ANPR changes | Not touched |
| Automatic anchoring logic | Existing M6–M10 backend behavior unchanged |

## 3. Architecture overview

```text
React (blockchain-monitoring feature)
    ↓ JWT via src/api/api.js
Laravel BlockchainRecordController
    ↓
blockchain_records / blockchain_jobs / blockchain_verifications
    ↓ (async, server-side only)
EthereumRpcClient → Ganache or Sepolia
```

**Design principles:**

- **Laravel is the source of truth** for monitoring data.
- **Solidity remains hash-only** on-chain.
- **React displays safe, normalized fields** from API resources.
- **Admin retry** and **verify** actions call Laravel endpoints; React never signs transactions.

## 4. Frontend feature structure

```text
frontend/src/feature/blockchain-monitoring/
├── components/
│   ├── BlockchainMetricCards.jsx
│   ├── BlockchainRecordTable.jsx
│   ├── BlockchainRecordFilters.jsx
│   ├── BlockchainStatusChip.jsx
│   ├── BlockchainNetworkBadge.jsx
│   ├── BlockchainJobTimeline.jsx
│   ├── BlockchainVerificationPanel.jsx
│   ├── BlockchainPayloadSummary.jsx
│   └── BlockchainMonitoringComponents.test.jsx
├── controllers/
│   ├── useBlockchainMonitoringController.js
│   ├── useBlockchainMonitoringController.test.jsx
│   └── useBlockchainRecordDetailController.js
├── datasources/
│   └── blockchainMonitoringService.js
├── repositories/
│   ├── BlockchainMonitoringRepository.js
│   └── BlockchainMonitoringRepository.test.js
└── views/
    ├── BlockchainDashboard.jsx
    └── BlockchainRecordDetail.jsx
```

Layering mirrors `feature/anpr-monitoring` and `feature/patrol-monitoring`:

| Layer | Responsibility |
|-------|----------------|
| **views** | Page layout, MainCard, loading/error states |
| **controllers** | State, filters, pagination, actions |
| **repositories** | Query building, envelope normalization, display helpers |
| **datasources** | HTTP calls + error normalization |
| **components** | Presentational UI |

### Quality assurance — dashboard request concurrency

`useBlockchainMonitoringController` uses **latest-request-wins** loading for the dashboard list and summary:

- Each `loadData()` call receives a monotonic request ID.
- Multiple in-flight requests are allowed (no `inFlightRef` early-return gate).
- Only the **latest** request may update `records`, `summary`, `pagination`, `loading`, `refreshing`, and `error`.
- Stale responses are ignored in success, error, and `finally` paths.
- This protects **manual refresh** and **filter/search/page** changes made while an earlier request is still unresolved.

## 5. Routes and role access

| Route | Component | Roles |
|-------|-----------|-------|
| `/admin/blockchain-monitoring` | `BlockchainDashboard` | **Admin only** |
| `/admin/blockchain-monitoring/:blockchainRecordId` | `BlockchainRecordDetail` | **Admin only** |

**Sidebar:** Admin menu → **Blockchain Monitoring** (`IconShieldCheck`), URL `/admin/blockchain-monitoring`.

**Guard:** Security Operators and Guards receive **403** from Laravel and cannot access routes (React `RoleProtectedRoute` redirects to `/forbidden`).

## 6. API endpoints used

| Method | Endpoint | Used by | Roles |
|--------|----------|---------|-------|
| `GET` | `/api/blockchain-records` | Dashboard table | **Admin only** |
| `GET` | `/api/blockchain-records/summary` | Dashboard metric cards | **Admin only** |
| `GET` | `/api/blockchain-records/{id}` | Record detail | **Admin only** |
| `POST` | `/api/blockchain-records/{id}/verify` | Manual verification | **Admin only** |
| `POST` | `/api/blockchain-records/{id}/retry` | Retry failed record | **Admin only** |
| `POST` | `/api/blockchain-records/{id}/refresh` | Refresh submitted confirmation | **Admin only** |

### List query parameters

| Parameter | Purpose |
|-----------|---------|
| `page`, `per_page` | Pagination |
| `status` | `pending`, `queued`, `processing`, `submitted`, `confirmed`, `failed` |
| `network` | `ganache`, `sepolia` |
| `environment` | `local`, `staging`, `production` |
| `entity_type` | e.g. `anpr_event`, `patrol_session` |
| `search` | Partial match on `record_hash`, `tx_hash`, `entity_id` |
| `sort_by`, `sort_order` | Default `created_at` desc |

## 7. Backend support changes

| File | Change |
|------|--------|
| `routes/api.php` | `GET blockchain-records/summary` registered **before** `apiResource` |
| `BlockchainRecordController@summary` | Returns status counts, network/environment breakdown, latest failed records |
| `BlockchainRecordController@index` | Added `search`; `entity_type` filter without requiring `entity_id` |
| `tests/Feature/Blockchain/BlockchainMonitoringApiTest.php` | Summary, search, entity_type, authorization tests |

**Summary response shape:**

```json
{
  "success": true,
  "message": "Blockchain monitoring summary retrieved.",
  "data": {
    "total": 0,
    "pending": 0,
    "queued": 0,
    "processing": 0,
    "submitted": 0,
    "confirmed": 0,
    "failed": 0,
    "network_counts": [],
    "environment_counts": [],
    "latest_failed_records": []
  }
}
```

Sensitive fields (`rpc_url`, `private_key`, raw canonical payload) are **not** included.

## 8. UI behavior

### Summary cards

- **Total records**
- **Pending / queued / processing** (combined in-flight count)
- **Submitted**
- **Confirmed**
- **Failed** (highlighted when &gt; 0)
- **Primary network** (from summary `network_counts`)

### Filters

- Search by record hash, tx hash, or entity ID
- Status, network, environment, entity type dropdowns
- Filter changes reset pagination to page 1

### Record table

Columns: No., entity/proof type, network/environment, status, short record hash, short tx hash, block/confirmations, created/submitted/confirmed times (`MalaysiaTime`), view action.

Uses `standardTableHeadCellSx`, `standardTablePaperSx`, `standardTableRowSx`, `PaginationFooter`, `TableActionButtons`.

### Detail page

- Back navigation to dashboard
- Record overview: status chip, entity type/ID, proof type, network, environment, chain ID, contract address (short), full record hash (monospace)
- Transaction hash with **Sepolia Etherscan link** only when `network === 'sepolia'` and `tx_hash` exists
- Block number, confirmations, retry count, timestamps
- Last error alert when present
- Safe `payload_summary` key-value display (filters keys containing `private`, `secret`, `rpc`)
- Job timeline: type, status, attempts, next attempt, started/finished, last error
- Verification panel: latest result, history, verified-by user, hash short values, manual verify button

### Verification

- **Admin** sees **Run verification** on the detail page
- Calls `POST /api/blockchain-records/{id}/verify` and reloads detail

### Retry failed record

- **Retry failed record** button visible to **Admin** when record status is `failed`
- Calls `POST /api/blockchain-records/{id}/retry`

### Refresh confirmation

- Shown for **submitted** records with a `tx_hash`
- Calls `POST /api/blockchain-records/{id}/refresh`

### Status display model

Frontend chips and repository labels align with backend enums. Unknown values render safely using **snake_case → title-case** fallback (for example `custom_state` → `Custom State`).

#### `blockchain_records.status`

| Raw value | Display label |
|-----------|---------------|
| `pending` | Pending |
| `queued` | Queued |
| `processing` | Processing |
| `submitted` | Submitted |
| `confirmed` | Confirmed |
| `failed` | Failed |

#### `blockchain_jobs.status`

| Raw value | Display label |
|-----------|---------------|
| `queued` | Queued |
| `processing` | Processing |
| `success` | Success |
| `failed` | Failed |
| `cancelled` | Cancelled |

#### `blockchain_verifications.result`

| Raw value | Display label |
|-----------|---------------|
| `valid` | Valid |
| `tampered` | Tampered |
| `pending` | Pending |
| `failed` | Failed |
| `onchain_missing` | On-chain Missing |

Implemented in `BlockchainStatusChip.jsx` and `BlockchainMonitoringRepository.js` (`formatStatusLabel`).

## 9. Security and privacy rules

| Rule | Implementation |
|------|----------------|
| Laravel API only | All HTTP via `blockchainMonitoringService.js` + `api.js` |
| No browser Ethereum RPC | No Web3/ethers dependency added |
| No private keys in frontend | Not stored, not displayed |
| Hash-only proof layer | UI shows hashes and safe summaries only |
| No raw canonical JSON | Repository strips unsafe payload keys |
| No sensitive ANPR evidence | Dashboard shows `payload_summary` metadata only |

## 10. Tests added/updated

### Frontend (`frontend`)

| File | Coverage |
|------|----------|
| `BlockchainMonitoringRepository.test.js` | Query params, pagination, summary, payload safety, Sepolia URL; backend-aligned job/verification labels (`success`, `cancelled`, `tampered`, `onchain_missing`); unknown fallback via `formatStatusLabel` |
| `useBlockchainMonitoringController.test.jsx` | Mount load; manual refresh reloads summary and records; filter change while first request is unresolved; stale first response does not overwrite latest response |
| `BlockchainMonitoringComponents.test.jsx` | Record status chip; job `success` and `cancelled`; verification `tampered`, `failed`, and `onchain_missing`; unknown fallback; network badge; payload summary |

### Backend (`backend`)

| File | Coverage |
|------|----------|
| `BlockchainMonitoringApiTest.php` | Summary auth (admin/guard; operator forbidden), search by hash/tx, status counts, entity_type filter |

### Commands run / verification

Reported results after M11 implementation and follow-up patch:

| Command | Result |
|---------|--------|
| `yarn test --run` | **48 passed** (7 files) |
| `yarn lint` | **0 errors** |
| `yarn build` | **Success** |
| `php artisan test --filter=Blockchain` | **227 passed** |
| `php artisan test` | **348 passed** |

```bash
cd frontend
yarn test --run
yarn lint
yarn build

cd backend
php artisan test --filter=Blockchain
php artisan test
```

## 11. Manual smoke-test steps

1. Log in as **Admin**.
2. Open sidebar → **Blockchain Monitoring** (`/admin/blockchain-monitoring`).
3. Confirm summary cards load (may be zero on empty database).
4. Apply status/network/entity type filters; confirm table updates.
5. Search by a known `record_hash` or `entity_id` fragment.
6. Click **View details** on a record.
7. Confirm jobs, verifications, payload summary, and timestamps render.
8. Click **Run verification**.
9. On a **failed** record, confirm **Retry failed record** works.
10. Log in as **Security Operator** → navigate to `/admin/blockchain-monitoring` → confirm **403** / forbidden.
11. Log in as **Guard** → navigate to `/admin/blockchain-monitoring` → confirm **403** / forbidden.
12. For a **submitted** Sepolia record with `tx_hash`, confirm Etherscan link opens `sepolia.etherscan.io`.

## 12. Known limitations

- Summary **primary network** uses the first entry from `network_counts`, not a weighted “active” network.
- Dashboard does not include live WebSocket updates (manual refresh only).
- No cross-link navigation from blockchain records to ANPR/patrol detail pages in M11.
- Contract address on summary card is not aggregated at API level (detail page shows per-record contract).
- Entity type `user_profile` is filterable; Profile M13 creates such records for sensitive profile changes.

## 13. M11 pass condition

M11 is **complete** when:

- [x] `feature/blockchain-monitoring` exists with documented structure
- [x] **Admin** can access `/admin/blockchain-monitoring`
- [x] Security Operator and Guard cannot access the route
- [x] Dashboard shows total, in-flight, submitted, confirmed, and failed counts
- [x] Table supports status, network, entity type, and search filters
- [x] Detail shows jobs, verifications, tx hash, block, confirmations, payload summary, errors
- [x] **Admin** can run manual verification, retry failed records, and refresh submitted confirmations
- [x] Frontend uses Laravel APIs only (no Web3/ethers)
- [x] M11 documentation exists at this path
- [x] Tests pass

## Related documentation

- [`m10-anpr-module-integration.md`](m10-anpr-module-integration.md)
- [`m8-verification-system.md`](m8-verification-system.md)
- [`m7-retry-and-failure-handling.md`](m7-retry-and-failure-handling.md)
- [`../blockchain-module.md`](../blockchain-module.md)
- [`../../frontend/documentation.md`](../../frontend/documentation.md)
- [`../../backend/documentation.md`](../../backend/documentation.md)
