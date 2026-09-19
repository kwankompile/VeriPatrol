# Blockchain Module — Ethereum Proof Layer Architecture

**Document name:** `blockchain-module.md`  
**Target repositories:** `backend`, `frontend`, `anpr`, `blockchain`  
**Primary backend:** Laravel PHP  
**Smart contract stack:** Solidity + Hardhat  
**Blockchain networks:** Ganache for local development, Sepolia for public testnet verification  
**Status:** **Implemented** (M0–M13 complete in `blockchain`, `backend`, `frontend`)

> **Documentation audit:** Last aligned with implementation **2026-07-09**. Milestones M0–M13 are implemented. **Admin-only** access for all `blockchain-records` APIs and `/admin/blockchain-monitoring`. React uses Laravel APIs only (no Web3). AI ANPR does not call Ethereum. Laravel database remains the source of truth; the chain stores **hashes only**. Demo **screenshots** for M13 remain a local capture task — see [`docs/m13-final-hardening-testing-and-documentation.md`](docs/m13-final-hardening-testing-and-documentation.md).

---

## 1. Executive Summary

The Blockchain Module is a **tamper-evident proof layer** for the FYP surveillance platform. It does **not** replace the Laravel database, and it does **not** store raw ANPR images, patrol routes, user data, or sensitive evidence on-chain.

The module stores the operational data in the existing Laravel database, generates deterministic cryptographic hashes from selected records, and anchors those hashes onto an Ethereum-compatible blockchain. The blockchain transaction then becomes an external proof that a record existed in a specific form at a specific time.

The latest architecture decision is a **hybrid separation**:

```text
project-root/
├── backend/        # Laravel API, database, queues, hashing, verification APIs
├── frontend/         # React dashboard and monitoring UI
├── anpr/                # Python ANPR runtime; sends final ANPR data to Laravel only
└── blockchain/    # Solidity contract, Hardhat deployment, ABI, network scripts
```

This keeps the system efficient and maintainable:

- **Laravel PHP** owns application logic, database state, queue jobs, retries, verification records, and dashboard APIs.
- **Solidity** owns only the minimal on-chain hash storage and hash verification contract.
- **React** displays blockchain status, failed jobs, verification results, and record details.
- **AI ANPR** does not talk directly to Ethereum. It sends ANPR events and evidence to Laravel, then Laravel decides what to anchor.

### 1.1 Implementation snapshot (2026-07-09)

| Layer | Implemented behavior |
| ----- | -------------------- |
| **Solidity** | `EvidenceStore.sol` — owner-only `storeHash(bytes32)` / public `verifyHash(bytes32)` |
| **Hardhat** | Ganache + Sepolia deploy artifacts under `deployments/` |
| **Laravel** | Hashing, `blockchain_records` lifecycle, `AnchorBlockchainRecordJob`, `RefreshSubmittedBlockchainRecordJob`, verify/retry/refresh APIs |
| **Integrations** | ANPR (`BlockchainAnprIntegrationService`), patrol validation (`BlockchainPatrolIntegrationService`), profile sensitive changes (`ProfileBlockchainService`) |
| **React** | `feature/blockchain-monitoring` — Admin-only dashboard at `/admin/blockchain-monitoring` |
| **AI ANPR** | Posts to Laravel only; no Ethereum RPC in Python |

Normal ANPR, patrol, and profile APIs **return immediately** — they do not wait for blockchain confirmation.

## 2. Module Objective

The Blockchain Module must provide:

- **Data integrity** through deterministic cryptographic hashing.
- **Tamper detection** by recomputing hashes from database records and comparing them with stored/on-chain hashes.
- **Public testnet verifiability** through Sepolia transactions.
- **Local development support** through Ganache.
- **Reliable operation** through asynchronous Laravel queue jobs.
- **Centralized blockchain tracking** using one main table: `blockchain_records`.
- **Operational visibility** through `blockchain_jobs` and `blockchain_verifications` as supporting tables.

---

## 3. Latest Architecture Decisions

### 3.1 Decision Summary

| Decision | Final Choice | Reason |
|---|---|---|
| Blockchain application logic | Laravel PHP | Matches existing backend convention and owns source-of-truth records. |
| Smart contract language | Solidity | Ganache and Sepolia are Ethereum/EVM-based environments. |
| Contract project location | `blockchain/` at project root | Keeps Node/Hardhat/Solidity tooling separate from PHP/Composer. |
| Laravel blockchain services | `backend/app/Services/Blockchain/` | Blockchain proof creation, queueing, and verification are backend concerns. |
| On-chain storage | Hash only | Efficient, privacy-preserving, and defensible. |
| Database storage | One central `blockchain_records` table | Avoids duplicated module-specific blockchain tables. |
| Job tracking | `blockchain_jobs` plus Laravel queue jobs | Laravel queue executes work; table tracks business-level audit state. |
| Verification tracking | `blockchain_verifications` | Stores each verification attempt and result. |
| Environment strategy | One environment = one blockchain network | Local uses Ganache; server/demo uses Sepolia. No cross-network duplication. |

### 3.2 Why the Solidity Folder Is Separate

The Solidity project uses a different toolchain from Laravel:

```text
Solidity contract
Hardhat compiler
Node.js package manager
ABI/artifacts
Deployment scripts
Network RPC configuration
```

Placing it inside `backend/` would mix PHP/Composer and Node/Hardhat concerns. A separate `blockchain/` folder is cleaner, easier to test, and easier to document.

### 3.3 Why Laravel Blockchain Code Still Stays in Backend

Laravel owns the data and workflow:

```text
ANPR event created
Patrol session validated
Profile/security change saved
        ↓
Laravel generates canonical hash
        ↓
Laravel creates blockchain_records row
        ↓
Laravel dispatches queue job
        ↓
Laravel calls Ethereum RPC / contract
        ↓
Laravel stores tx_hash, block_number, status, errors
        ↓
Laravel exposes dashboard and verification APIs
```

Therefore, the Laravel-side blockchain module must stay inside `backend/`.

---

## 4. Core Design Principles

### 4.1 Backend Is the Source of Truth

The Laravel database remains the authoritative system of record. Blockchain stores proof, not business data.

### 4.2 Blockchain Is a Proof Layer

The blockchain contract stores only `bytes32` hashes. It does not store:

- Plate numbers.
- Owner names.
- User profiles.
- GPS coordinates.
- Raw ANPR images.
- Patrol routes.
- Full JSON payloads.

### 4.3 Asynchronous Anchoring

No API request should wait for a blockchain transaction. Data creation must remain fast.

Correct flow:

```text
API request → save DB record → create pending blockchain record → dispatch queue job → return response
```

The blockchain job runs in the background.

### 4.4 Deterministic Hashing

The same canonical data must always produce the same hash.

Rules:

- Use stable canonical JSON.
- Sort object keys.
- Normalize timestamps to UTC ISO-8601.
- Exclude volatile fields such as `updated_at` unless intentionally part of the proof.
- Store `canonical_version` so old records can still be verified after the hash format evolves.
- Store `hash_algorithm`, initially `sha256`.

### 4.5 One Environment Equals One Blockchain

Use one blockchain network per environment:

| Environment | Network | Purpose |
|---|---|---|
| Local development | Ganache | Fast local testing with fake ETH. |
| Server/demo/testnet | Sepolia | Public Ethereum testnet verification. |
| Production future | Mainnet or approved L2 | Not required for this FYP scope. |

No record should be anchored to both Ganache and Sepolia for the same environment lifecycle.

### 4.6 Centralized Records, Module-Agnostic Design

All blockchain-enabled modules use the same `blockchain_records` table.

Examples:

| Module | `entity_type` | `entity_id` | `proof_type` |
|---|---|---|---|
| ANPR | `anpr_event` | `anpr_events.id` | `entity_created` |
| ANPR image | `anpr_image` | `anpr_images.id` | `evidence_file` |
| Patrol | `patrol_session` | `patrol_sessions.id` | `validation_result` |
| Profile (password) | `user_profile` | `users.id` | `profile_password_changed` |
| Profile (email) | `user_profile` | `users.id` | `profile_email_changed` |
| Profile (2FA) | `user_profile` | `users.id` | `profile_2fa_reconfigured` |

---

## 5. High-Level Architecture

```text
AI ANPR Runtime / React PWA / Laravel Modules
                    ↓
              Laravel API
                    ↓
        MySQL Application Tables
  anpr_events, anpr_images, patrol_sessions, etc.
                    ↓
        BlockchainHashService
                    ↓
        blockchain_records
          status = pending
                    ↓
        Laravel Queue Job
                    ↓
        BlockchainRecordService
                    ↓
        EthereumRpcClient
                    ↓
        EvidenceStore Solidity Contract
                    ↓
        Ganache or Sepolia Ethereum Network
                    ↓
        tx_hash / block_number / confirmed_at
                    ↓
        Blockchain Dashboard + Verification APIs
```

---

## 6. Technology Stack

### 6.1 Laravel Backend

| Area | Technology |
|---|---|
| Backend framework | Laravel PHP |
| Database | MySQL or configured Laravel DB |
| Queue | Laravel Queue, preferably database queue first |
| Auth | Existing JWT auth |
| Blockchain service | Laravel service classes |
| Ethereum RPC call | Laravel HTTP client or dedicated Ethereum JSON-RPC client wrapper |
| Tests | PHPUnit / Laravel feature and unit tests |

### 6.2 Ethereum Contract Project

| Area | Technology |
|---|---|
| Smart contract language | Solidity |
| Development framework | Hardhat |
| Local network | Ganache |
| Public testnet | Sepolia |
| Contract artifact | ABI + deployed address JSON |
| Tests | Hardhat tests |

### 6.3 Frontend Dashboard

| Area | Technology |
|---|---|
| UI framework | React + Vite |
| UI components | Material UI |
| Feature pattern | `feature/<module>/components`, `controllers`, `datasources`, `repositories`, `views` |
| API client | Existing `src/api/api.js` fetch wrapper |

---

## 7. Ethereum, Ganache ETH, and Sepolia ETH

### 7.1 What Is Ethereum?

Ethereum is a programmable blockchain platform. It supports smart contracts, which are programs deployed to the blockchain. The native currency used to pay transaction fees is **ETH**.

For this project, Ethereum is used only to store and verify evidence hashes.

### 7.2 What Is Gas?

A blockchain write transaction consumes computation and storage on the network. Ethereum charges a fee called **gas** for that work. The fee is paid using ETH on the selected network.

For this module:

- `storeHash(...)` is a blockchain write transaction and costs gas.
- `verifyHash(...)` can be called as a read-only RPC call and normally does not spend wallet ETH.

### 7.3 What Is Ganache ETH?

**Ganache ETH** is fake local ETH generated by Ganache accounts.

Ganache is a personal local Ethereum blockchain for development. It gives local accounts pre-funded fake ETH so developers can deploy contracts and send transactions without using real money.

Characteristics:

- Runs locally on the developer machine.
- Free to use.
- Not public.
- Not connected to Ethereum mainnet.
- Ganache ETH has no real value.
- Accounts and balances are generated locally.
- Data may reset when the Ganache workspace is reset.
- Best for fast contract development and automated local testing.

Typical local RPC URL:

```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
```

or:

```env
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
```

depending on the Ganache setup.

### 7.4 What Is Sepolia ETH?

**Sepolia ETH** is testnet ETH used on the Ethereum Sepolia test network.

Sepolia is a public Ethereum testnet used by developers to test smart contracts and transactions before any production deployment. Sepolia ETH is used to pay gas fees on Sepolia, but it is not real mainnet ETH and should not be treated as having monetary value.

Characteristics:

- Public test network.
- Ethereum-compatible.
- Used for application and smart contract testing.
- Requires an RPC provider such as Infura, Alchemy, Google Cloud Web3, or another Ethereum RPC provider.
- Requires Sepolia ETH for write transactions.
- Sepolia ETH is normally obtained from faucets.
- Faucets are usually free but may have limits, login requirements, wallet age requirements, or anti-abuse rules.

Common places to obtain Sepolia ETH:

- Google Cloud Web3 Sepolia Faucet.
- Infura Sepolia Faucet.
- Alchemy Sepolia Faucet.
- Other reputable Sepolia faucets listed by the Ethereum ecosystem.

### 7.5 Is Sepolia ETH Free?

Usually, yes. Sepolia ETH is normally distributed by faucets for testing. However:

- Faucet availability can change.
- Faucet limits can change.
- Some faucets require an account.
- Some faucets require proof that the wallet is not abusive.
- Sepolia ETH should not be bought as if it were real ETH.

### 7.6 Is Ganache or Sepolia Required for FYP?

Recommended approach:

| FYP Phase | Network |
|---|---|
| Development and unit testing | Ganache |
| Final demonstration and screenshots | Sepolia |
| Production real-money deployment | Not required |

---

## 8. Folder Structure

## 8.1 Project Root

```text
project-root/
├── backend/
├── frontend/
├── anpr/
├── blockchain/
└── blockchain-module.md
```

---

## 8.2 Laravel Backend Folder Structure

```text
backend/
├── app/
│   ├── Models/
│   │   ├── BlockchainRecord.php
│   │   ├── BlockchainJob.php
│   │   └── BlockchainVerification.php
│   │
│   ├── Jobs/
│   │   ├── AnchorBlockchainRecordJob.php
│   │   └── RefreshSubmittedBlockchainRecordJob.php
│   │
│   ├── Services/
│   │   └── Blockchain/
│   │       ├── BlockchainAnprIntegrationService.php
│   │       ├── BlockchainConfigValidator.php
│   │       ├── BlockchainHashService.php
│   │       ├── BlockchainPatrolIntegrationService.php
│   │       ├── BlockchainRecordService.php
│   │       ├── BlockchainRetryService.php
│   │       ├── BlockchainSubmittedRecordRefreshService.php
│   │       ├── BlockchainVerificationService.php
│   │       ├── EthereumRpcClient.php
│   │       └── EthereumTransactionSigner.php
│   │
│   ├── Http/
│   │   ├── Controllers/
│   │   │   └── Api/
│   │   │       └── BlockchainRecordController.php
│   │   │
│   │   └── Resources/
│   │       ├── BlockchainRecordResource.php
│   │       ├── BlockchainJobResource.php
│   │       ├── BlockchainVerificationResource.php
│   │       └── BlockchainProofSummaryResource.php
│   │
│   └── Support/
│       └── BlockchainCanonicalJson.php
│
├── config/
│   └── blockchain.php
│
├── database/
│   ├── factories/
│   │   ├── BlockchainRecordFactory.php
│   │   ├── BlockchainJobFactory.php
│   │   └── BlockchainVerificationFactory.php
│   │
│   └── migrations/
│       ├── xxxx_xx_xx_create_blockchain_records_table.php
│       ├── xxxx_xx_xx_create_blockchain_jobs_table.php
│       └── xxxx_xx_xx_create_blockchain_verifications_table.php
│
├── routes/
│   └── api.php
│
└── tests/
    ├── Feature/
    │   └── Blockchain/
    │       ├── BlockchainMonitoringApiTest.php
    │       ├── BlockchainAnchoringTest.php
    │       ├── BlockchainVerificationTest.php
    │       ├── BlockchainRetryTest.php
    │       ├── BlockchainSubmittedRecordRefreshTest.php
    │       ├── AnprBlockchainIntegrationTest.php
    │       ├── PatrolBlockchainIntegrationTest.php
    │       └── BlockchainM13RegressionTest.php
    │
    └── Unit/
        └── Blockchain/
            ├── BlockchainHashServiceTest.php
            ├── BlockchainRecordServiceTest.php
            ├── BlockchainVerificationServiceTest.php
            ├── BlockchainRetryServiceTest.php
            ├── EthereumRpcClientTest.php
            └── EthereumTransactionSignerTest.php
```

> **Obsolete (not implemented):** `VerifyBlockchainRecordJob`, `BlockchainStatusService`, `EthereumTransactionParser`, `BlockchainJobController`, `BlockchainVerificationController`, `BlockchainDashboardController`, and `BlockchainDashboardResource` were early design placeholders. Jobs and verifications are nested on `GET /api/blockchain-records/{id}`; all Admin APIs are on `BlockchainRecordController` only.

> **Request validation:** Blockchain record request validation is handled in `BlockchainRecordController` through inline query/body validation and route-model binding; no dedicated Blockchain FormRequest classes are implemented.

### Backend Structure Rationale

- `Models/` follows Laravel Eloquent convention.
- `Jobs/` keeps blockchain writes asynchronous.
- `Services/Blockchain/` keeps Ethereum and hashing logic isolated from controllers.
- `Resources/` keeps JSON response format consistent with the backend API convention.
- `BlockchainRecordController` validates list filters and action inputs inline; dedicated `FormRequest` classes were not added for this module.
- `tests/Feature/Blockchain` and `tests/Unit/Blockchain` keep the module testable and maintainable.

---

## 8.3 Ethereum Contract Folder Structure

```text
blockchain/
├── README.md
├── package.json
├── package-lock.json
├── hardhat.config.js
├── .env.example
├── .gitignore
│
├── contracts/
│   └── EvidenceStore.sol
│
├── scripts/
│   ├── deploy-ganache.js
│   ├── deploy-sepolia.js
│   ├── export-abi.js
│   └── verify-deployment.js
│
├── test/
│   └── EvidenceStore.test.js
│
├── deployments/
│   ├── ganache/
│   │   └── EvidenceStore.json
│   └── sepolia/
│       └── EvidenceStore.json
│
├── artifacts/          # generated by Hardhat; ignored by Git unless needed
└── cache/              # generated by Hardhat; ignored by Git
```

### Ethereum Structure Rationale

- `contracts/` contains only Solidity source code.
- `scripts/` contains deployment and ABI export scripts.
- `deployments/` stores contract address, ABI path, chain ID, and deployment transaction hash.
- `test/` validates contract behavior independently from Laravel.
- `artifacts/` and `cache/` are generated by Hardhat and should usually be ignored.

---

## 8.4 Frontend Folder Structure

```text
frontend/
└── src/
    └── feature/
        └── blockchain-monitoring/
            ├── components/
            │   ├── BlockchainRecordTable.jsx
            │   ├── BlockchainStatusChip.jsx
            │   ├── BlockchainMetricCards.jsx
            │   ├── BlockchainJobTimeline.jsx
            │   ├── BlockchainVerificationPanel.jsx
            │   └── BlockchainNetworkBadge.jsx
            │
            ├── controllers/
            │   ├── useBlockchainMonitoringController.js
            │   └── useBlockchainRecordDetailController.js
            │
            ├── datasources/
            │   └── blockchainMonitoringService.js
            │
            ├── repositories/
            │   └── BlockchainMonitoringRepository.js
            │
            └── views/
                ├── BlockchainDashboard.jsx
                └── BlockchainRecordDetail.jsx
```

### Frontend Structure Rationale

This follows the existing project pattern:

```text
views → controllers → repositories → datasources → api.js → Laravel API
```

The frontend should not perform blockchain RPC calls directly. It should call Laravel APIs only.

---

## 9. Database Design

## 9.1 `blockchain_records`

This is the central proof table. Every blockchain-enabled module writes proof records here.

```text
blockchain_records
- id                         UUID primary key
- entity_type                string, indexed
- entity_id                  UUID/string, indexed
- proof_type                 string, indexed
- canonical_version          string, default 'v1'
- hash_algorithm             string, default 'sha256'
- record_hash                string(64)
- payload_summary            JSON nullable
- network                    enum: ganache, sepolia
- environment                enum: local, staging, production
- chain_id                   unsigned big integer nullable
- contract_address           string nullable
- tx_hash                    string nullable
- block_number               unsigned big integer nullable
- confirmations              unsigned integer default 0
- status                     enum: pending, queued, processing, submitted, confirmed, failed
- retry_count                unsigned integer default 0
- last_error                 text nullable
- submitted_at               timestamp nullable
- confirmed_at               timestamp nullable
- created_at                 timestamp
- updated_at                 timestamp
```

Recommended indexes:

```text
index(entity_type, entity_id)
index(status)
index(network, environment)
index(tx_hash)
index(record_hash)
unique(entity_type, entity_id, proof_type, canonical_version, environment, record_hash)
```

### Field Notes

| Field | Purpose |
|---|---|
| `entity_type` | Identifies the module/entity, for example `anpr_event`. |
| `entity_id` | ID of the real application record. |
| `proof_type` | Describes what is proven, for example `entity_created` or `evidence_file`. |
| `canonical_version` | Allows future hash format changes without breaking old verification. |
| `record_hash` | SHA-256 hash of canonical data. |
| `payload_summary` | Safe metadata for dashboard display; must not contain sensitive raw evidence. |
| `tx_hash` | Ethereum transaction hash after submission. |
| `block_number` | Block containing the confirmed transaction. |
| `status` | Current lifecycle status. |

---

## 9.2 `blockchain_jobs`

This table tracks business-level blockchain job attempts. It does not replace the Laravel queue tables; it explains what happened to each anchoring or verification job.

```text
blockchain_jobs
- id                         UUID primary key
- blockchain_record_id       UUID foreign key
- job_type                   enum: anchor, retry_anchor, verify, refresh_confirmation
- status                     enum: queued, processing, success, failed, cancelled
- attempts                   unsigned integer default 0
- max_attempts               unsigned integer default 5
- next_attempt_at            timestamp nullable
- started_at                 timestamp nullable
- finished_at                timestamp nullable
- last_error                 text nullable
- created_at                 timestamp
- updated_at                 timestamp
```

Recommended indexes:

```text
index(blockchain_record_id)
index(status)
index(job_type)
index(next_attempt_at)
```

---

## 9.3 `blockchain_verifications`

This table stores every verification attempt.

```text
blockchain_verifications
- id                         UUID primary key
- blockchain_record_id       UUID foreign key
- verified_by                UUID nullable
- verification_type          enum: manual, scheduled, api, system
- stored_hash                string(64)
- recomputed_hash            string(64) nullable
- onchain_hash               string(64) nullable
- onchain_found              boolean nullable
- result                     enum: valid, tampered, pending, failed, onchain_missing
- error_message              text nullable
- verified_at                timestamp
- created_at                 timestamp
```

Recommended indexes:

```text
index(blockchain_record_id)
index(result)
index(verified_at)
```

---

## 10. Status Models

### 10.1 `blockchain_records.status`

| Status | Meaning |
|---|---|
| `pending` | Record hash exists locally but has not been queued yet. |
| `queued` | A Laravel queue job has been dispatched. |
| `processing` | A worker is attempting blockchain submission. |
| `submitted` | Transaction hash exists, but confirmation is not fully complete. |
| `confirmed` | Transaction is confirmed and block metadata is stored. |
| `failed` | All retries failed or permanent error occurred. |

### 10.2 `blockchain_jobs.status`

| Status | Meaning |
|---|---|
| `queued` | Job is waiting to run. |
| `processing` | Job is currently running. |
| `success` | Job completed successfully. |
| `failed` | Job attempt failed. |
| `cancelled` | Job was manually cancelled or superseded. |

### 10.3 `blockchain_verifications.result`

| Result | Meaning |
|---|---|
| `valid` | Stored hash, recomputed hash, and on-chain proof match. |
| `tampered` | Current DB data no longer matches the original stored hash. |
| `pending` | Blockchain record is not confirmed yet. |
| `failed` | Verification could not complete due to error. |
| `onchain_missing` | Transaction/contract does not prove the expected hash. |

---

## 11. Smart Contract Design

### 11.1 Contract Responsibility

The smart contract must remain minimal:

- Store a `bytes32` hash.
- Reject empty hash.
- Prevent duplicate hash storage.
- Emit an event when a hash is stored.
- Verify whether a hash exists.

### 11.2 Recommended Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EvidenceStore {
    address public owner;

    mapping(bytes32 => bool) private stored;

    event HashStored(bytes32 indexed hash, address indexed sender, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function storeHash(bytes32 hash) external onlyOwner {
        require(hash != bytes32(0), "Invalid hash");
        require(!stored[hash], "Hash already stored");

        stored[hash] = true;
        emit HashStored(hash, msg.sender, block.timestamp);
    }

    function verifyHash(bytes32 hash) external view returns (bool) {
        return stored[hash];
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
```

### 11.3 Why `onlyOwner` Is Recommended

Without access control, any wallet could store random hashes in the contract. The system would still verify hashes, but the contract would be noisy and less controlled.

For this FYP system, only the backend-controlled wallet should anchor official evidence hashes.

---

## 12. Backend Service Design

## 12.1 `BlockchainHashService`

Responsibilities:

- Build canonical payload from a supported entity.
- Normalize dates to UTC ISO-8601.
- Sort object keys.
- Remove volatile fields.
- Generate SHA-256 hash.
- Return both canonical payload and hash.

Example canonical payload for ANPR event:

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

Hash:

```text
sha256(canonical_json)
```

---

## 12.2 `BlockchainRecordService`

Responsibilities:

- Create `blockchain_records` rows.
- Prevent duplicate proof creation for the same entity/proof/environment.
- Dispatch `AnchorBlockchainRecordJob`.
- Update lifecycle status.
- Retry failed records when allowed.
- Record safe dashboard summaries.

---

## 12.3 `EthereumRpcClient`

Responsibilities:

- Connect to configured RPC URL.
- Encode contract call data.
- Submit signed transaction to `storeHash(bytes32)`.
- Query transaction receipt.
- Call `verifyHash(bytes32)`.
- Return normalized results to Laravel services.

Implementation options:

- Use Laravel HTTP client with Ethereum JSON-RPC.
- Use a maintained PHP Ethereum/Web3 library if it is stable in the project environment.
- Keep the implementation behind `EthereumRpcClient` so it can be replaced without changing controllers or jobs.

---

## 12.4 `BlockchainVerificationService`

Responsibilities:

- Load the target `blockchain_records` row.
- Recompute the hash from the current database entity.
- Compare recomputed hash with `blockchain_records.record_hash`.
- Query the contract using `verifyHash(record_hash)`.
- Store the verification attempt in `blockchain_verifications`.
- Return `valid`, `tampered`, `onchain_missing`, `pending`, or `failed`.

---

## 13. API Design

All routes are under `/api` and use existing JWT authentication.

### 13.1 Record APIs

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/blockchain-records` | Admin | List records with filters. |
| `GET` | `/blockchain-records/{id}` | Admin | Show one record with jobs and verifications. |
| `POST` | `/blockchain-records/{id}/verify` | Admin | Run manual verification. |
| `POST` | `/blockchain-records/{id}/retry` | Admin | Retry failed anchoring. |
| `POST` | `/blockchain-records/{id}/refresh` | Admin | Poll receipt / advance `submitted` → `confirmed`. |
| `POST` | `/blockchain-records/verify-all` | Admin | Batch verify filtered confirmed records (dashboard action). |

Jobs and verifications are **not** separate top-level API resources. They are included on `GET /blockchain-records/{id}` via `jobs` and `verifications` relations.

### 13.2 Related data on record detail

`GET /blockchain-records/{id}` eager-loads:

| Relation | Content |
| -------- | ------- |
| `jobs` | Anchor, retry, verify, and refresh_confirmation attempts (`blockchain_jobs`) |
| `verifications` | Manual/scheduled verification results (`blockchain_verifications`) |

### 13.3 Dashboard API

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| `GET` | `/blockchain-records/summary` | Admin | Summary cards and health metrics. |

Dashboard metrics:

- Total records.
- Pending records.
- Confirmed records.
- Failed records.
- Average confirmation time.
- Retry rate.
- Current network.
- Current contract address.
- Recent failed jobs.
- Recent tampered verification results.

---

## 14. Configuration Design

## 14.1 Laravel `.env`

```env
BLOCKCHAIN_ENABLED=false
BLOCKCHAIN_MODE=local
BLOCKCHAIN_NETWORK=ganache
BLOCKCHAIN_ENVIRONMENT=local
BLOCKCHAIN_CHAIN_ID=1337
BLOCKCHAIN_RPC_URL=http://127.0.0.1:7545
BLOCKCHAIN_CONTRACT_ADDRESS=
BLOCKCHAIN_CONTRACT_ABI_PATH=../blockchain/deployments/ganache/EvidenceStore.json
BLOCKCHAIN_WALLET_ADDRESS=
BLOCKCHAIN_PRIVATE_KEY=
BLOCKCHAIN_CONFIRMATION_BLOCKS=1
BLOCKCHAIN_MAX_RETRIES=5
BLOCKCHAIN_RETRY_BASE_SECONDS=10
BLOCKCHAIN_CANONICAL_VERSION=v1
BLOCKCHAIN_HASH_ALGORITHM=sha256
```

Sepolia example:

```env
BLOCKCHAIN_ENABLED=true
BLOCKCHAIN_MODE=testnet
BLOCKCHAIN_NETWORK=sepolia
BLOCKCHAIN_ENVIRONMENT=staging
BLOCKCHAIN_CHAIN_ID=11155111
BLOCKCHAIN_RPC_URL=https://sepolia.infura.io/v3/<project-id>
BLOCKCHAIN_CONTRACT_ADDRESS=0x...
BLOCKCHAIN_CONTRACT_ABI_PATH=../blockchain/deployments/sepolia/EvidenceStore.json
BLOCKCHAIN_WALLET_ADDRESS=0x...
BLOCKCHAIN_PRIVATE_KEY=<server-wallet-private-key>
BLOCKCHAIN_CONFIRMATION_BLOCKS=2
```

Security rules:

- Never commit `BLOCKCHAIN_PRIVATE_KEY`.
- Never expose private keys to frontend.
- Use a dedicated wallet for the FYP module.
- Keep only minimal Sepolia ETH in the wallet.
- Rotate keys if exposed.

---

## 14.2 `config/blockchain.php`

```php
return [
    'enabled' => env('BLOCKCHAIN_ENABLED', false),
    'mode' => env('BLOCKCHAIN_MODE', 'local'),
    'network' => env('BLOCKCHAIN_NETWORK', 'ganache'),
    'environment' => env('BLOCKCHAIN_ENVIRONMENT', 'local'),
    'chain_id' => env('BLOCKCHAIN_CHAIN_ID', 1337),
    'rpc_url' => env('BLOCKCHAIN_RPC_URL'),
    'contract_address' => env('BLOCKCHAIN_CONTRACT_ADDRESS'),
    'contract_abi_path' => env('BLOCKCHAIN_CONTRACT_ABI_PATH'),
    'wallet_address' => env('BLOCKCHAIN_WALLET_ADDRESS'),
    'private_key' => env('BLOCKCHAIN_PRIVATE_KEY'),
    'confirmation_blocks' => env('BLOCKCHAIN_CONFIRMATION_BLOCKS', 1),
    'max_retries' => env('BLOCKCHAIN_MAX_RETRIES', 5),
    'retry_base_seconds' => env('BLOCKCHAIN_RETRY_BASE_SECONDS', 10),
    'canonical_version' => env('BLOCKCHAIN_CANONICAL_VERSION', 'v1'),
    'hash_algorithm' => env('BLOCKCHAIN_HASH_ALGORITHM', 'sha256'),
];
```

---

## 15. Module Integration Strategy

## 15.1 ANPR Integration

**Status: Implemented (M10)** via `BlockchainAnprIntegrationService` when `BLOCKCHAIN_ENABLED=true`.

Trigger flow:

```text
AnprEventController@store
        ↓
ANPR event saved (Laravel)
        ↓
BlockchainAnprIntegrationService::anchorEventCreation()
        ↓
BlockchainRecordService::createForEntity($anprEvent, 'entity_created')
        ↓
AnchorBlockchainRecordJob dispatched (async)
```

Evidence trigger:

```text
AnprImageController@uploadForEvent / @store
        ↓
Image stored by Laravel
        ↓
BlockchainAnprIntegrationService::anchorImageEvidence()
        ↓
BlockchainRecordService::createForEntity($anprImage, 'evidence_file')
```

Proof creation failures are logged and **do not** fail the ANPR write. See [`docs/m10-anpr-module-integration.md`](docs/m10-anpr-module-integration.md).

AI ANPR must not call Ethereum directly.

---

## 15.2 Patrol Integration

**Status:** Implemented in **Blockchain M12** (`BlockchainPatrolIntegrationService`).

Trigger:

```text
POST /patrol-sessions/{id}/validate
        ↓
PatrolValidationService stores checkpoint events and metrics
        ↓
BlockchainPatrolIntegrationService creates validation_result proof
        ↓
AnchorBlockchainRecordJob queued
```

The hash represents the final validation result from persisted checkpoint events and metrics, not raw GPS logs. See [`docs/m12-patrol-and-profile-future-integration.md`](docs/m12-patrol-and-profile-future-integration.md).

---

## 15.3 Profile Integration

**Status:** Implemented by **Profile M13** (`ProfileBlockchainService` → `BlockchainRecordService::createForPayload()`). Inspected and confirmed aligned in **Blockchain M12** — see [`docs/m12-patrol-and-profile-future-integration.md`](docs/m12-patrol-and-profile-future-integration.md).

Anchored flows (committed changes only):

- Password change → `profile_password_changed`
- Email change confirmation → `profile_email_changed`
- 2FA reconfiguration verification → `profile_2fa_reconfigured`

All use `entity_type = user_profile` and `entity_id = users.id`. Safe canonical payloads only; Profile APIs do not wait for on-chain confirmation. Display and verification are through the **Admin-only** Blockchain Monitoring dashboard.

**Excluded from M13 anchoring:**

- Phone and address updates (M9 online / M12 offline queue)
- Profile picture upload or removal (M10)
- Email-change start and 2FA reconfigure start (pending flows only)
- Offline profile queue replay (M12)

Never store raw personal data on-chain. Store only a hash of the audited change event.

---

## 16. Frontend Dashboard Design

### 16.1 Dashboard Route

Recommended routes:

```text
/admin/blockchain-monitoring
/admin/blockchain-monitoring/:blockchainRecordId
```

Allowed roles:

| Role | Access |
|---|---|
| Admin | Full dashboard, retry failed records, run verification, refresh submitted confirmations. |
| Security Operator | No access (`403`). |
| Guard | No access (`403`). |

### 16.2 Dashboard Pages

React (`feature/blockchain-monitoring`) calls **Laravel APIs only** — no Web3, wallet, or browser RPC. All mutations (`verify`, `retry`, `refresh`) go through `POST /api/blockchain-records/*`.

#### `BlockchainDashboard.jsx`

Displays:

- Total records.
- Pending records.
- Confirmed records.
- Failed records.
- Active network.
- Contract address.
- Latest records table.
- Failed job alert section.

#### `BlockchainRecordDetail.jsx`

Displays:

- Entity type and entity ID.
- Record hash.
- Network and environment.
- Transaction hash.
- Block number.
- Status timeline.
- Related blockchain jobs.
- Verification history.
- Manual verify button.
- Retry button for Admin only.

### 16.3 UI Principles

- Do not show private keys.
- Do not show raw sensitive canonical payloads.
- Show `payload_summary` only.
- Link to Sepolia block explorer when `network = sepolia` and `tx_hash` exists.
- For Ganache, show transaction hash without explorer link unless a local explorer is configured.

---

## 17. End-to-End Flow Examples

### 17.1 ANPR Event Hash Anchoring

```text
AI ANPR detects plate ABC1234
        ↓
AI uploads event and evidence to Laravel
        ↓
Laravel creates anpr_events row
        ↓
Laravel normalizes and links vehicle
        ↓
Laravel builds canonical ANPR event payload
        ↓
Laravel creates blockchain_records row with status pending
        ↓
Laravel dispatches AnchorBlockchainRecordJob
        ↓
Worker calls EvidenceStore.storeHash(hash)
        ↓
Ethereum returns tx_hash
        ↓
Laravel updates blockchain_records status submitted/confirmed
        ↓
Frontend dashboard shows confirmed blockchain proof
```

### 17.2 Verification Flow

```text
Admin clicks Verify
        ↓
Laravel loads blockchain_records row
        ↓
Laravel reloads source entity from DB
        ↓
Laravel recomputes canonical hash
        ↓
Laravel compares recomputed hash with stored record_hash
        ↓
Laravel calls EvidenceStore.verifyHash(record_hash)
        ↓
Laravel stores blockchain_verifications row
        ↓
Frontend shows VALID / TAMPERED / FAILED
```

---

## 18. Milestone Implementation Plan

Each milestone must be completed and tested before moving to the next level.

---

## M0 — Architecture Finalization and Repository Split

**Goal:** Confirm the final hybrid architecture.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M0.1 | Confirm `blockchain/` as separate top-level folder. | Project root contains separate folder plan for Ethereum contract code. |
| M0.2 | Confirm Laravel-side blockchain services remain in backend. | Backend folder plan includes `app/Services/Blockchain/`, `Jobs/`, `Models/`, API controllers, and tests. |
| M0.3 | Confirm module responsibilities. | AI ANPR does not call Ethereum; React does not call Ethereum; Laravel owns all blockchain RPC calls. |
| M0.4 | Confirm data privacy rules. | Document states only hashes are stored on-chain. |

**Milestone passing criteria:** Architecture is documented, approved, and no implementation mixes Solidity tooling inside Laravel application code.

---

## M1 — Ethereum Project Foundation

**Goal:** Create the `blockchain/` project and validate the smart contract locally.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M1.1 | Create Hardhat project structure. | `npm install` succeeds inside `blockchain/`. |
| M1.2 | Add `contracts/EvidenceStore.sol`. | Contract compiles successfully. |
| M1.3 | Add Hardhat tests. | `npx hardhat test` passes. |
| M1.4 | Add deploy script for Ganache. | Contract deploys to local Ganache and prints address. |
| M1.5 | Export deployment JSON. | `deployments/ganache/EvidenceStore.json` contains address, chain ID, ABI, and deployment tx hash. |

**Milestone passing criteria:** Contract can compile, test, deploy to Ganache, store one hash, and verify it through Hardhat script.

---

## M2 — Laravel Database Foundation

**Goal:** Implement blockchain tables and Eloquent models.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M2.1 | Create migrations for `blockchain_records`, `blockchain_jobs`, `blockchain_verifications`. | `php artisan migrate` succeeds. |
| M2.2 | Create Eloquent models and relationships. | Model relationship tests pass. |
| M2.3 | Add factories. | Factories can create valid test rows. |
| M2.4 | Add resource classes. | API resource output contains required fields and hides sensitive values. |

**Milestone passing criteria:** Database layer is complete, testable, and uses UUID-compatible conventions aligned with the existing backend.

---

## M3 — Configuration and Environment Management

**Goal:** Add safe blockchain configuration to Laravel.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M3.1 | Create `config/blockchain.php`. | Config values load from `.env`. |
| M3.2 | Update `.env.example`. | Example includes Ganache and Sepolia fields without private real values. |
| M3.3 | Add config validation command or test. | Missing RPC URL/contract address produces clear error when blockchain is enabled. |
| M3.4 | Add private key safety rule. | `.gitignore` prevents `.env` and sensitive deployment secrets from being committed. |

**Milestone passing criteria:** Laravel can detect whether blockchain is disabled, local Ganache mode, or Sepolia mode.

---

## M4 — Deterministic Hashing Architecture

**Goal:** Implement canonical hashing before any blockchain RPC call.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M4.1 | Create `BlockchainCanonicalJson` helper. | Same payload with different key order produces identical canonical JSON. |
| M4.2 | Create `BlockchainHashService`. | Same entity produces same SHA-256 hash repeatedly. |
| M4.3 | Add ANPR event canonical payload builder. | ANPR payload excludes volatile fields and includes required proof fields. |
| M4.4 | Add unit tests for hash stability. | Tests prove deterministic output and version tagging. |

**Milestone passing criteria:** Hashing works without Ethereum. A stored hash can be recomputed exactly from the same canonical payload.

---

## M5 — Blockchain Record Service and Read APIs

**Goal:** Create blockchain records and expose read-only monitoring APIs.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M5.1 | Create `BlockchainRecordService`. | Service creates a `pending` record for a supported entity. |
| M5.2 | Enforce duplicate proof prevention. | Same entity/proof/environment does not create duplicate active records. |
| M5.3 | Implement `GET /blockchain-records`. | List supports pagination and filters by status, network, entity type. |
| M5.4 | Implement `GET /blockchain-records/{id}`. | Detail includes jobs and verification history. |

**Milestone passing criteria:** Blockchain proof rows can be created and inspected through Admin APIs. Anchoring to Ethereum is implemented in M6+ (`AnchorBlockchainRecordJob`).

---

## M6 — Ganache Anchoring End-to-End

**Goal:** Submit hashes from Laravel to the Ganache-deployed Solidity contract.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M6.1 | Create `EthereumRpcClient`. | Client can call configured Ganache RPC. |
| M6.2 | Implement transaction submission. | Laravel can call `storeHash(bytes32)` on Ganache contract. |
| M6.3 | Create `AnchorBlockchainRecordJob`. | Job updates status from queued → processing → submitted/confirmed. |
| M6.4 | Store transaction metadata. | `tx_hash`, `block_number`, `submitted_at`, `confirmed_at` are saved. |
| M6.5 | Add feature test with mocked RPC. | Tests cover successful anchoring without requiring live Ganache. |

**Milestone passing criteria:** A Laravel-created `blockchain_records` row can be anchored to Ganache and marked confirmed.

---

## M7 — Retry and Failure Handling

**Goal:** Make anchoring reliable when the blockchain network or RPC fails.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M7.1 | Create `blockchain_jobs` tracking. | Every anchor attempt creates or updates a business job row. |
| M7.2 | Implement retry count and max attempts. | Failed jobs retry up to configured limit. |
| M7.3 | Implement exponential delay. | `next_attempt_at` increases after each failure. |
| M7.4 | Store error messages safely. | `last_error` is visible in dashboard/API but does not expose private keys. |
| M7.5 | Add retry endpoint. | Admin can retry a failed record manually. |

**Milestone passing criteria:** Temporary RPC failure does not lose proof records; permanent failure is visible and retryable.

---

## M8 — Verification System

**Goal:** Verify whether records are valid or tampered.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M8.1 | Create `BlockchainVerificationService`. | Service recomputes hash from current DB entity. |
| M8.2 | Compare stored hash and recomputed hash. | Tampered DB data is detected. |
| M8.3 | Query contract `verifyHash`. | On-chain presence is confirmed. |
| M8.4 | Store verification result. | `blockchain_verifications` row records result and timestamp. |
| M8.5 | Implement verify API endpoint. | Manual verification returns `valid`, `tampered`, `pending`, `failed`, or `onchain_missing`. |

**Milestone passing criteria:** Admin/operator can verify a blockchain record and receive a reliable decision.

---

## M9 — Sepolia Deployment

**Goal:** Move from local Ganache proof to public Sepolia testnet proof.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M9.1 | Configure Sepolia RPC provider. | Laravel and Hardhat can connect to Sepolia RPC. |
| M9.2 | Obtain Sepolia ETH. | Deployment wallet has enough testnet ETH for deployment and sample transactions. |
| M9.3 | Deploy `EvidenceStore` to Sepolia. | Deployment JSON saved under `deployments/sepolia/EvidenceStore.json`. |
| M9.4 | Configure Laravel Sepolia env. | Laravel uses Sepolia chain ID, contract address, and ABI. |
| M9.5 | Anchor one test record to Sepolia. | `tx_hash` is visible and verifiable through Sepolia explorer/RPC. |

**Milestone passing criteria:** A real Sepolia transaction proves one Laravel blockchain record hash.

---

## M10 — ANPR Module Integration

**Goal:** Automatically anchor ANPR event and evidence proofs.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M10.1 | Anchor ANPR event creation. | New ANPR event creates a pending blockchain record. |
| M10.2 | Anchor uploaded ANPR image/evidence file hash. | New ANPR image creates a separate blockchain record. |
| M10.3 | Preserve async behavior. | ANPR event API response does not wait for blockchain confirmation. |
| M10.4 | Add regression tests. | ANPR tests prove event creation still works when blockchain is enabled or disabled. |
| M10.5 | Add dashboard visibility. | ANPR event detail can show related blockchain proof status. |

**Milestone passing criteria:** ANPR records can be saved normally, while blockchain anchoring happens in background.

---

## M11 — Blockchain Monitoring Frontend

**Goal:** Build a React dashboard for blockchain status and verification.

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M11.1 | Create `feature/blockchain-monitoring`. | Folder follows existing frontend feature architecture. |
| M11.2 | Add dashboard route and menu item. | **Admin** can access blockchain dashboard. |
| M11.3 | Add summary cards. | Cards show total, pending, confirmed, failed records. |
| M11.4 | Add record table with filters. | User can filter by status, network, entity type, and search hash/tx hash. |
| M11.5 | Add detail page. | Detail page shows jobs, verifications, tx hash, block number, and manual verify. |
| M11.6 | Add Admin retry action. | Admin can retry failed records; non-admin roles cannot. |

**Milestone passing criteria:** Blockchain operations are visible and manageable from the frontend.

---

## M12 — Patrol and Profile Integration

**Goal:** Extend blockchain proofs to patrol validation and confirm Profile M13 alignment.

**Status:** **Complete** — see [`docs/m12-patrol-and-profile-future-integration.md`](docs/m12-patrol-and-profile-future-integration.md).

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M12.1 | Anchor patrol validation result. | Completed patrol validation creates blockchain record. |
| M12.2 | Verify patrol proof. | Recomputed patrol validation hash can detect tampering. |
| M12.3 | Plan profile/security proof. | Profile proof design is documented before implementation. |
| M12.4 | Implement only if required. | Profile sensitive-change proof does not expose raw personal data. |

**Milestone passing criteria:** Blockchain module remains centralized and reusable across modules without duplicate tables.

---

## M13 — Final Hardening, Testing, and Documentation

**Goal:** Prepare the module for FYP demonstration and viva defense.

**Status:** **Implementation and documentation complete; demo screenshot evidence pending** — see [`docs/m13-final-hardening-testing-and-documentation.md`](docs/m13-final-hardening-testing-and-documentation.md).

| Sub-milestone | Work | Passing Criteria |
|---|---|---|
| M13.1 | Add full automated tests. | Laravel blockchain unit/feature tests pass. |
| M13.2 | Add Hardhat contract tests. | Solidity tests pass. |
| M13.3 | Add failure demos. | Failed RPC, retry, and tampered record scenarios are demonstrable. |
| M13.4 | Add screenshots. | Ganache deployment, Sepolia transaction, Laravel dashboard, and verification result screenshots are captured. |
| M13.5 | Update backend/frontend documentation. | Documentation reflects implemented behavior only. |

**Milestone passing criteria:** The blockchain module is demonstrable, defensible, and aligned with project documentation. Screenshot captures remain a local demo task (checklist provided in M13 doc).

---

## 19. Implementation Order Recommendation

Recommended build order:

```text
M0 Architecture
M1 Solidity + Ganache
M2 Laravel DB
M3 Laravel config
M4 Hashing
M5 Record APIs
M6 Ganache anchoring
M7 Retry handling
M8 Verification
M9 Sepolia deployment
M10 ANPR integration
M11 Frontend dashboard
M12 Patrol/Profile extension
M13 Final hardening
```

Do not start with the dashboard. The dashboard depends on records, jobs, status changes, and verification results.

---

## 20. Testing Strategy

### 20.1 Laravel Unit Tests

Test:

- Canonical JSON sorting.
- SHA-256 hash stability.
- Entity payload builders.
- Duplicate blockchain record prevention.
- Status transition rules.
- Verification decision logic.

### 20.2 Laravel Feature Tests

Test:

- `GET /blockchain-records` authorization.
- `GET /blockchain-records/{id}` response shape.
- `POST /blockchain-records/{id}/verify` result storage.
- `POST /blockchain-records/{id}/retry` admin-only behavior.
- ANPR event creation with blockchain enabled.
- ANPR event creation with blockchain disabled.

### 20.3 Hardhat Tests

Test:

- Owner can store a hash.
- Non-owner cannot store a hash.
- Empty hash is rejected.
- Duplicate hash is rejected.
- Stored hash verifies as true.
- Unknown hash verifies as false.
- Ownership transfer works.

### 20.4 Manual Demonstration Tests

Demonstrate:

- Deploy to Ganache.
- Laravel anchors sample record to Ganache.
- Deploy to Sepolia.
- Laravel anchors sample record to Sepolia.
- Verification returns valid.
- Manual database tampering causes tampered result.
- RPC failure produces failed job and retry state.

---

## 21. Operational Rules

### 21.1 Do Not Store Raw Data On-Chain

Never store:

- Plate numbers.
- Full names.
- Emails.
- GPS coordinates.
- Images.
- Full JSON evidence.

Only store hashes.

### 21.2 Do Not Block Core APIs

Blockchain submission must never block:

- ANPR event creation.
- Patrol validation response.
- Profile update response.

Use asynchronous jobs.

### 21.3 Do Not Expose Private Keys

Private keys must stay in backend/server `.env` only.

Never expose private keys to:

- React frontend.
- AI ANPR runtime.
- Git repository.
- Public documentation screenshots.

### 21.4 Do Not Let AI ANPR Own Blockchain

AI ANPR should only produce detection events and evidence. Laravel owns final records and blockchain proof creation.

### 21.5 Keep the Contract Minimal

Do not add complex business logic to Solidity. Complex logic belongs in Laravel.

---

## 22. FYP Report Explanation

Recommended wording:

> The blockchain module is implemented as an Ethereum-based proof layer for the Laravel backend. The Laravel database remains the source of truth, while blockchain stores only deterministic hashes of selected records. This design preserves privacy, avoids expensive on-chain storage, and enables tamper detection by recomputing hashes from the database and comparing them with on-chain proofs. Local development uses Ganache with fake local ETH, while public testnet demonstration uses Sepolia ETH obtained from faucets. Blockchain submission is processed asynchronously through Laravel queues so normal API workflows remain fast and reliable.

---

## 23. Final Architecture Verdict

This architecture is efficient and effective because:

- It keeps Laravel as the main application brain.
- It keeps Solidity minimal.
- It separates Hardhat tooling into `blockchain/`.
- It uses one central `blockchain_records` table.
- It keeps jobs and verifications as supporting tables.
- It avoids storing sensitive data on-chain.
- It supports both Ganache and Sepolia.
- It is testable level by level.
- It aligns with the existing backend, frontend, and AI ANPR project conventions.

Final structure:

```text
project-root/
├── backend/
│   └── Laravel blockchain services, jobs, APIs, database, verification
│
├── frontend/
│   └── Blockchain monitoring dashboard
│
├── anpr/
│   └── Sends ANPR data to Laravel only
│
└── blockchain/
    └── Solidity contract, Hardhat deployment, Ganache/Sepolia scripts
```

---

## 24. References

Use these references while implementing and documenting the module:

- Laravel Queues: `https://laravel.com/docs/13.x/queues`
- Ganache documentation: `https://archive.trufflesuite.com/ganache/`
- Ganache overview: `https://archive.trufflesuite.com/docs/ganache/`
- Hardhat documentation: `https://hardhat.org/`
- Hardhat getting started: `https://hardhat.org/hardhat-runner/docs/getting-started`
- Ethereum networks and testnets: `https://ethereum.org/developers/docs/networks/`
- Google Cloud Web3 Sepolia faucet: `https://cloud.google.com/application/web3/faucet/ethereum/sepolia`
- Infura Sepolia faucet: `https://www.infura.io/faucet/sepolia`
