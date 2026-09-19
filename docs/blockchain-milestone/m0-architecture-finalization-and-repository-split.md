# M0 — Architecture Finalization and Repository Split

**Milestone:** M0  
**Status:** Complete (documentation and repository scaffolding)  
**Related planning document:** [`blockchain-module.md`](../../blockchain-module.md)  
**Date context:** FYP Blockchain Module — hybrid Laravel + Ethereum architecture  

---

## 1. Milestone Summary

M0 finalizes the **hybrid architecture** for the Blockchain Module and establishes a **clean repository split** between Laravel application logic and Ethereum smart-contract tooling. No M1+ implementation (Hardhat, Solidity contracts, RPC clients, queue jobs, or frontend dashboard) is included in this milestone.

**Deliverables:**

- Top-level folder `blockchain/` created with README, `.gitignore`, placeholder directories, and this document.
- Backend, frontend, and AI ANPR documentation aligned with module boundaries and privacy rules.
- Explicit separation between M0 (architecture) and M1+ (implementation).

---

## 2. Objective

Confirm and document that:

1. **`blockchain/`** is the dedicated home for Solidity, Hardhat, contract tests, deployment scripts, ABI, and deployment metadata.
2. **`backend/`** retains all blockchain **application** logic: database records, canonical hashing, job lifecycle, verification APIs, and future Ethereum RPC calls.
3. **Module responsibilities** are unambiguous: React and AI ANPR never call Ethereum directly.
4. **Privacy rules** require hash-only on-chain storage—no sensitive operational data on the blockchain.
5. **No Solidity/Hardhat tooling** is placed inside the Laravel codebase.

---

## 3. Architecture Decision

The FYP surveillance platform adopts a **proof-layer** design:

| Layer | Role |
| --- | --- |
| **Laravel (backend)** | Source of truth; persists entities, generates deterministic hashes, queues anchoring, calls Ethereum RPC, exposes verification APIs. |
| **Solidity (Ethereum)** | Minimal on-chain hash storage and verification only. |
| **React (frontend)** | Displays blockchain status and verification results via Laravel APIs. |
| **AI ANPR** | Produces ANPR events and evidence; delivers final data to Laravel only. |

**Decision:** Keep the Ethereum toolchain in a **sibling repository folder** (`blockchain/`) rather than nesting it under `backend/`, because PHP/Composer and Node/Hardhat have different dependencies, build outputs, and test runners.

**Networks (planned):**

| Environment | Network | Purpose |
| --- | --- | --- |
| Local development | Ganache | Fast iteration with local fake ETH |
| Server / demo | Sepolia | Public testnet verification |

One environment maps to one network; the same record is not anchored to both Ganache and Sepolia for the same lifecycle.

---

## 4. Final Repository Split

```text
project-root/
├── backend/        # Laravel API, DB, queues, hashing, verification APIs, Ethereum RPC (M6+)
├── frontend/         # React dashboard; blockchain monitoring via Laravel only (M11+)
├── anpr/                # Python ANPR runtime; sends final ANPR data to Laravel only
├── blockchain/    # Solidity, Hardhat, tests, ABI, deployment scripts (M1+)
└── blockchain-module.md       # Full module architecture and milestone plan
```

### `blockchain/` (M0 scaffold)

```text
blockchain/
├── README.md
├── .gitignore
├── docs/
│   └── m0-architecture-finalization-and-repository-split.md
├── contracts/          # M1+ — .gitkeep only in M0
├── scripts/            # M1+ — .gitkeep only in M0
├── test/               # M1+ — .gitkeep only in M0
└── deployments/
    ├── ganache/        # M1+ — .gitkeep only in M0
    └── sepolia/        # M9+ — .gitkeep only in M0
```

### `backend/` (existing + planned paths)

Laravel-side blockchain work remains under the backend application:

```text
backend/
├── app/Services/Blockchain/          # M4–M8+
├── app/Jobs/                         # M6–M7+
├── app/Models/                       # BlockchainRecord (exists); BlockchainJob, BlockchainVerification (M2+)
├── app/Http/Controllers/Api/       # BlockchainRecordController (read-only today); more in M5+
├── app/Http/Resources/               # BlockchainRecordResource (exists)
└── tests/
    ├── Feature/Blockchain/           # M5+
    └── Unit/Blockchain/              # M4+
```

---

## 5. Module Responsibility Matrix

| Module | Owns | Must Not Own |
| --- | --- | --- |
| `backend` | Database records, canonical hashing, blockchain job lifecycle, verification APIs, Ethereum RPC calls | Solidity source, Hardhat dependency tree, private key exposure to frontend |
| `frontend` | Blockchain status UI and verification result display through Laravel APIs | Direct Ethereum RPC calls, private keys, canonical hash generation authority |
| `anpr` | ANPR event/evidence production and delivery to Laravel | Ethereum calls, blockchain proof decisions, vehicle/blockchain ownership |
| `blockchain` | Solidity contracts, Hardhat config, tests, ABI, deployment scripts, deployment metadata | Laravel business logic, application DB, ANPR runtime, frontend UI |

### Data flow (target)

```text
AI ANPR / React PWA / Laravel modules
              ↓
        Laravel API + MySQL
              ↓
   Canonical hash + blockchain_records (pending)
              ↓
   Laravel queue job → Ethereum RPC → contract (M6+)
              ↓
   tx_hash, block_number, status → APIs → React dashboard (M11+)
```

---

## 6. Privacy and Security Rules

### On-chain storage (mandatory)

**Store only deterministic cryptographic hashes on-chain** (`bytes32` / SHA-256 derived values). The smart contract must not persist:

- Plate numbers  
- User profiles or personal data  
- GPS coordinates  
- Raw ANPR images or patrol routes  
- Full JSON evidence payloads  

Canonical payloads may include sensitive fields **off-chain** for hashing inside Laravel; only the **hash** is anchored.

### Off-chain and operational security

| Rule | Requirement |
| --- | --- |
| Private keys | Backend/server `.env` only; never frontend, AI runtime, Git, or public docs |
| API blocking | Blockchain submission must not block ANPR or patrol API responses (async jobs) |
| Frontend | No Ethereum RPC, no wallet keys, no hash authority |
| AI ANPR | No Ethereum integration; Laravel decides what to anchor |
| Contract scope | Minimal hash store/verify; business logic stays in Laravel |

---

## 7. In-Scope Work (M0)

| Item | Status |
| --- | --- |
| Create `blockchain/` with README, `.gitignore`, docs, placeholder dirs | Done |
| Document hybrid architecture and repository split | Done |
| Document module responsibility matrix | Done |
| Document hash-only privacy rules | Done |
| Align `backend/documentation.md` with blockchain folder split | Done |
| Align `frontend/documentation.md` with Laravel-only blockchain access | Done |
| Align `anpr` documentation (Laravel-only delivery) | Done |
| Confirm no Hardhat/Solidity implementation in M0 | Done |

---

## 8. Out-of-Scope Work (M1+)

The following are **explicitly excluded** from M0:

| Area | Deferred to |
| --- | --- |
| `EvidenceStore.sol` or any Solidity source | M1 |
| Hardhat `package.json`, `hardhat.config.js` | M1 |
| Deployment scripts and contract tests | M1 |
| Laravel migrations for `blockchain_jobs`, `blockchain_verifications` (if not present) | M2 |
| `config/blockchain.php` and env wiring | M3 |
| `BlockchainHashService`, canonical JSON helpers | M4 |
| Write/verify/retry APIs and record services | M5–M8 |
| `EthereumRpcClient`, `AnchorBlockchainRecordJob` | M6–M7 |
| Sepolia deployment | M9 |
| ANPR auto-anchoring on event create | M10 |
| React `feature/blockchain-monitoring` dashboard | M11 |
| AI ANPR runtime changes for blockchain | Not owned by AI module |

---

## 9. Current Repository Alignment

Assessment against the codebase at M0 completion:

### `backend/`

| Artifact | M0 state |
| --- | --- |
| `BlockchainRecord` model | Exists — metadata, status helpers, morph `entity` |
| `BlockchainRecordController` | Exists — **read-only** `index` / `show` |
| `blockchain_records` migration | Exists — hash, network, environment, tx metadata |
| `BlockchainRecordSeeder` | Exists — demo rows |
| `app/Services/Blockchain/` | **Not present** — planned M4–M8 |
| Ethereum RPC / Web3 client | **Not present** — planned M6 |
| Queue jobs for anchoring | **Not present** — planned M6–M7 |

**Important:** Existing `BlockchainRecord` rows and read APIs represent **persistence and monitoring scaffolding**, not full on-chain anchoring. No live Ethereum RPC calls exist in the backend today.

### `frontend/`

| Artifact | M0 state |
| --- | --- |
| `feature/blockchain-monitoring` | **Not implemented** — planned M11 |
| Direct Ethereum usage | **None** |

### `anpr/`

| Artifact | M0 state |
| --- | --- |
| Backend client / queue | Sends ANPR events and evidence to Laravel |
| Ethereum integration | **None** |

### `blockchain/`

| Artifact | M0 state |
| --- | --- |
| Hardhat / Solidity | **None** — placeholders only |
| Documentation | README + this M0 document |

---

## 10. Acceptance Criteria

| # | Criterion | Met |
| --- | --- | --- |
| 1 | Separate `blockchain/` folder exists as the Ethereum project root | Yes |
| 2 | Laravel-side blockchain code remains in `backend/` | Yes |
| 3 | No Solidity/Hardhat tooling inside Laravel | Yes |
| 4 | React does not call Ethereum directly (documented; no RPC client in frontend) | Yes |
| 5 | AI ANPR does not call Ethereum directly (documented; no Ethereum code in AI) | Yes |
| 6 | Hash-only on-chain privacy rule documented | Yes |
| 7 | M1 work clearly separated from M0 in docs and folder contents | Yes |

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Toolchain mixing (PHP + Node in one repo path) | Build confusion, CI complexity | Enforce split; document paths in all module READMEs |
| Sensitive data anchored on-chain | Privacy / FYP compliance failure | Hash-only rule; code review at M1 contract design |
| Private key leakage | Wallet compromise | Keys only in backend `.env`; `.gitignore` in both projects |
| Overclaiming M0 as “blockchain live” | Misleading demos | Docs state read-only metadata today; anchoring starts M6 |
| Duplicate folder typo (`blockhain-ethereum-v1`) | Split confusion | Use correct spelling only; no typo folder in repo |
| Frontend or AI bypassing Laravel | Architecture drift | API-only access documented; reviews at M10/M11 |

---

## 12. Handoff to M1

**M1 — Ethereum project foundation** should begin in `blockchain/` with:

1. Initialize npm/Hardhat project (`package.json`, `hardhat.config.js`).
2. Implement minimal hash storage contract (per `blockchain-module.md` design).
3. Add Hardhat unit tests (`npx hardhat test`).
4. Add Ganache deploy script and export `deployments/ganache/EvidenceStore.json` (address, chain ID, ABI, deployment tx).
5. Do **not** modify Laravel anchoring until M2–M6 lay database, config, hashing, and RPC groundwork.

**Inputs for M1:**

- This document and `blockchain-module.md` §11 (contract design) and §8.3 (folder structure).
- `.gitignore` already excludes `node_modules/`, `artifacts/`, `cache/`, and `.env`.

**Laravel coordination (after M1 deploy artifact exists):**

- M3: `BLOCKCHAIN_CONTRACT_ABI_PATH` pointing to `../blockchain/deployments/...`
- M6: first end-to-end Ganache anchor from `AnchorBlockchainRecordJob`

---

## References

- [`blockchain-module.md`](../../blockchain-module.md) — full architecture, APIs, milestones M0–M13  
- [`../README.md`](../README.md) — Ethereum folder overview  
- [`../../backend/documentation.md`](../../backend/documentation.md) — backend blockchain note  
- [`../../frontend/documentation.md`](../../frontend/documentation.md) — frontend blockchain monitoring note  
