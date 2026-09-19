# M3 — Configuration and Environment Management

**Milestone:** M3  
**Status:** Complete  
**Implementation repository:** `backend/`  
**Planning reference:** [`blockchain-module.md`](../blockchain-module.md)  
**Prior milestone:** [`m2-laravel-database-foundation.md`](m2-laravel-database-foundation.md)

This document lives under `blockchain/docs/` as **project-level blockchain milestone documentation**. M3 code changes are implemented in the Laravel backend only.

---

## 1. Milestone Summary

M3 adds **safe Laravel-side blockchain configuration** and validation. Blockchain remains **disabled by default**. Developers can validate local Ganache or future Sepolia/testnet settings without implementing RPC clients, hashing, queue jobs, or transaction submission.

**Delivered:**

- `config/blockchain.php`
- `.env.example` `BLOCKCHAIN_*` variables (placeholders only)
- `BlockchainConfigValidator` service
- `php artisan blockchain:check-config`
- `tests/Feature/Blockchain/BlockchainConfigurationTest.php` (16 cases)
- `.gitignore` hardening for `.env.*` (with `!.env.example`)

**Not delivered:** hashing, RPC client, queue execution, live anchoring, verification service, Sepolia deployment, React dashboard.

---

## 2. Objective

Allow Laravel to:

1. Load normalized blockchain settings from environment variables.
2. Distinguish **disabled**, **local Ganache**, and **testnet/Sepolia** configuration modes.
3. Fail fast with clear messages when enabled config is incomplete or invalid.
4. Keep private keys server-only and never printed by CLI output.

---

## 3. Scope

| Area | M3 work |
| --- | --- |
| Config file | `config/blockchain.php` |
| Environment template | `backend/.env.example` |
| Validation | `App\Services\Blockchain\BlockchainConfigValidator` |
| CLI | `php artisan blockchain:check-config` |
| Tests | `BlockchainConfigurationTest` + existing M2 tests |
| Documentation | This file + README/backend/frontend notes |

---

## 4. Out of Scope

| Item | Milestone |
| --- | --- |
| `BlockchainHashService` / canonical JSON | M4 |
| `BlockchainRecordService` / write APIs | M5 |
| `EthereumRpcClient` / anchoring jobs | M6–M7 |
| Verification service | M8 |
| Sepolia Hardhat deploy | M9 |
| ANPR auto-anchoring | M10 |
| React blockchain dashboard | M11 |
| Solidity/Hardhat changes | Not in M3 |

---

## 5. Architecture Alignment

| Module | M3 role |
| --- | --- |
| `backend` | Config, env template, validation command, tests |
| `blockchain` | Unchanged contract/deploy artifact; ABI path referenced by Laravel config |
| `frontend` | Unchanged — no blockchain env vars, Web3, or RPC |
| `anpr` | Unchanged — Laravel-only delivery |

Laravel remains the **source of truth**. React and AI ANPR must **not** call Ethereum directly or receive private keys.

---

## 6. Files Created or Updated

### Created

| Path |
| --- |
| `backend/config/blockchain.php` |
| `backend/app/Services/Blockchain/BlockchainConfigValidator.php` |
| `backend/app/Console/Commands/CheckBlockchainConfigCommand.php` |
| `backend/tests/Feature/Blockchain/BlockchainConfigurationTest.php` |
| `blockchain/docs/m3-configuration-and-environment-management.md` |

### Updated

| Path |
| --- |
| `backend/.env.example` |
| `backend/.gitignore` |
| `backend/documentation.md` |
| `blockchain/README.md` |
| `frontend/documentation.md` |

---

## 7. Configuration Variables

| Variable | Purpose | Default (when unset) |
| --- | --- | --- |
| `BLOCKCHAIN_ENABLED` | Master switch | `false` |
| `BLOCKCHAIN_MODE` | `local` or `testnet` | `local` |
| `BLOCKCHAIN_NETWORK` | `ganache` or `sepolia` | `ganache` |
| `BLOCKCHAIN_ENVIRONMENT` | `local`, `staging`, `production` | `local` |
| `BLOCKCHAIN_CHAIN_ID` | EVM chain ID | `1337` |
| `BLOCKCHAIN_RPC_URL` | JSON-RPC endpoint | — |
| `BLOCKCHAIN_CONTRACT_ADDRESS` | Deployed contract | — |
| `BLOCKCHAIN_CONTRACT_ABI_PATH` | Deployment JSON path | `../blockchain/deployments/ganache/EvidenceStore.json` |
| `BLOCKCHAIN_WALLET_ADDRESS` | Server wallet (optional in M3) | — |
| `BLOCKCHAIN_PRIVATE_KEY` | Server signing key (**never commit**) | — |
| `BLOCKCHAIN_CONFIRMATION_BLOCKS` | Confirmations target | `1` |
| `BLOCKCHAIN_MAX_RETRIES` | Max anchor retries | `5` |
| `BLOCKCHAIN_RETRY_BASE_SECONDS` | Retry backoff base | `10` |
| `BLOCKCHAIN_CANONICAL_VERSION` | Hash format version tag | `v1` |
| `BLOCKCHAIN_HASH_ALGORITHM` | Hash algorithm name | `sha256` |

---

## 8. Validation Command

```bash
cd backend
php artisan blockchain:check-config
```

| State | Exit code | Behavior |
| --- | --- | --- |
| Disabled | `0` | Passes without RPC/contract/ABI requirements |
| Enabled + valid | `0` | Prints safe summary; private key shown as `[configured]` or `[not configured]` only |
| Enabled + invalid | non-zero | Lists missing/invalid fields |

**Never printed:** raw `BLOCKCHAIN_PRIVATE_KEY` value.

---

## 9. Environment Modes

| Mode | Typical network | Typical chain ID | Notes |
| --- | --- | --- | --- |
| Disabled | — | — | Default; no anchoring preparation required |
| Local / Ganache | `ganache` | `1337` | Uses M1 deployment JSON when path resolves |
| Testnet / Sepolia | `sepolia` | `11155111` | Implemented in M9; use `deployments/sepolia/EvidenceStore.json` |

When enabled, validator checks deployment JSON `address` and `chainId` against configured values when present.

### Numeric field validation

When blockchain is enabled, `BlockchainConfigValidator` validates numeric settings using strict integer parsing—not PHP `(int)` casts alone. Malformed values are rejected, including:

- Non-integer strings (for example `abc`, `1337abc`)
- Decimal strings (for example `1.5`, `10.5`)
- Empty strings when a value is required

| Variable | Rule |
| --- | --- |
| `BLOCKCHAIN_CHAIN_ID` | Positive integer (1 or greater) |
| `BLOCKCHAIN_CONFIRMATION_BLOCKS` | Positive integer (1 or greater) |
| `BLOCKCHAIN_MAX_RETRIES` | Non-negative integer (0 or greater) |
| `BLOCKCHAIN_RETRY_BASE_SECONDS` | Non-negative integer (0 or greater) |

When `php artisan blockchain:check-config` runs without an explicit config override, the validator reads raw `.env` values for these fields so malformed strings are caught even though `config/blockchain.php` may coerce them for runtime access.

---

## 10. Security and Privacy Rules

| Rule | M3 enforcement |
| --- | --- |
| Private keys server-only | Read from `.env`; never in Git, docs, CLI output, or API resources |
| `.env` ignored | `.gitignore` includes `.env`, `.env.*`, and `!.env.example` |
| Placeholders in `.env.example` | No real RPC secrets, wallet keys, or project IDs |
| Frontend isolation | SPA must not load `BLOCKCHAIN_*` variables or Web3 libraries (M11 uses Laravel APIs only) |
| AI ANPR isolation | No Ethereum integration in Python runtime |

---

## 11. Testing Summary

| Suite | Result |
| --- | --- |
| `php artisan test --filter=BlockchainConfiguration` | **16/16** passed |
| `php artisan test --filter=Blockchain` | **28/28** passed (M2 + M3) |
| `php artisan test` (full backend) | **149/149** passed |
| `php artisan blockchain:check-config` (default disabled) | Exit `0`, status disabled |

M3 configuration tests cover disabled defaults, enabled validation failures, valid Ganache/Sepolia-style configs with temporary ABI files, Artisan exit codes, private-key redaction, strict numeric validation (malformed `BLOCKCHAIN_CHAIN_ID`, `BLOCKCHAIN_CONFIRMATION_BLOCKS`, `BLOCKCHAIN_MAX_RETRIES`, `BLOCKCHAIN_RETRY_BASE_SECONDS`), `.env.example` completeness, and `.gitignore` protection.

---

## 12. Acceptance Criteria

| Criterion | Met |
| --- | --- |
| `config/blockchain.php` exists | Yes |
| `.env.example` has safe `BLOCKCHAIN_*` placeholders | Yes |
| `php artisan blockchain:check-config` works | Yes |
| Validation distinguishes disabled / local / testnet | Yes |
| No private key printed in CLI output | Yes |
| M3 tests pass | Yes |
| M2 blockchain tests still pass | Yes |
| No RPC client, hashing, queues, or anchoring | Yes |
| Documentation updated | Yes |

---

## 13. Known Limitations

1. **No live RPC calls** — config validation does not ping Ganache or Sepolia.
2. **Private key optional in M3** — missing key warns but does not fail validation.
3. **No runtime enforcement** — APIs do not yet read `config('blockchain.enabled')` for anchoring because anchoring is M6+.
4. **ABI path default** — relative to `backend/`; may not exist until M1 Ganache deploy is run locally.

---

## 14. Handoff to M4

**M4 — Deterministic Hashing Architecture** should:

1. Implement canonical JSON helper and `BlockchainHashService`.
2. Use `config('blockchain.canonical_version')` and `config('blockchain.hash_algorithm')`.
3. Still avoid Ethereum RPC until M6.

M3 provides the configuration surface M4–M6 will consume. Run `php artisan blockchain:check-config` after enabling blockchain in `.env` and updating contract/ABI paths before starting anchoring work in M6.

---

## References

- [`m2-laravel-database-foundation.md`](m2-laravel-database-foundation.md)
- [`m1-ethereum-project-foundation.md`](m1-ethereum-project-foundation.md)
- [`../blockchain-module.md`](../blockchain-module.md) — §14 Configuration Design
- [`../../backend/documentation.md`](../../backend/documentation.md)
