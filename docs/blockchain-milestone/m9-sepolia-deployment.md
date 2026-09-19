# M9 — Sepolia Deployment

**Milestone:** M9  
**Status:** Complete  
**Implementation repositories:** `blockchain/`, `backend/`  
**Contract reference:** `contracts/EvidenceStore.sol`  
**Planning reference:** [`blockchain-module.md`](../blockchain-module.md)  
**Prior milestone:** [`m8-verification-system.md`](m8-verification-system.md)

> **Access policy (current):** Blockchain monitoring and verify APIs are **Admin only**. Smoke-test step 6 below reflects the implemented policy.

---

## 1. Milestone Summary

M9 moves blockchain proof from **local Ganache** to **public Sepolia testnet**:

```text
blockchain (Hardhat)
    → deploy EvidenceStore to Sepolia
    → deployments/sepolia/EvidenceStore.json

backend (Laravel)
    → BLOCKCHAIN_NETWORK=sepolia
    → EthereumRpcClient eth_sendRawTransaction (signed storeHash)
    → blockchain_records.tx_hash verifiable on Sepolia
```

**Delivered:**

- Hardhat `sepolia` network (`SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY`, chain ID `11155111`)
- `scripts/deploy-sepolia.js` — deploy `EvidenceStore` and write Sepolia deployment metadata
- Network-aware `scripts/verify-deployment.js` — Ganache and Sepolia
- `scripts/export-abi.js` — updates ABI in existing Ganache/Sepolia deployment JSON files
- Laravel `EthereumTransactionSigner` + `EthereumRpcClient` signed transaction path for testnet
- Stricter `BlockchainConfigValidator` rules for Sepolia
- Automated tests (mocked RPC; no live Sepolia in CI)

**Not delivered:** M10 ANPR auto-anchoring, M11 React dashboard, mainnet deployment, frontend or AI ANPR changes.

---

## 2. Architecture Summary

| Layer | Responsibility |
| --- | --- |
| **Solidity** | Same minimal `EvidenceStore` — stores only `bytes32` hashes |
| **Hardhat** | Sepolia deploy/verify scripts; deployment JSON as contract metadata source |
| **Laravel** | Source of truth; anchors hashes via signed RPC when `BLOCKCHAIN_NETWORK=sepolia` |
| **React** | Unchanged — no Ethereum RPC, no wallet libraries |
| **AI ANPR** | Unchanged — sends data to Laravel only |

**Hash-only rule:** No plate numbers, GPS, images, users, patrol routes, or raw JSON on-chain.

**Private keys:** Remain in local/server `.env` only. Never committed.

---

## 3. Files Changed

### blockchain

| Path | Change |
| --- | --- |
| `hardhat.config.js` | Added `sepolia` network with env validation on Sepolia tasks |
| `scripts/deploy-sepolia.js` | **Created** — Sepolia deployment |
| `scripts/lib/sepoliaConfig.js` | **Created** — Sepolia env validation helpers |
| `scripts/lib/deployment.js` | **Created** — shared deployment JSON writer |
| `scripts/verify-deployment.js` | Network-aware Ganache/Sepolia verification |
| `scripts/export-abi.js` | Export ABI for both networks when deployment JSON exists |
| `package.json` | `deploy:sepolia`, `verify:sepolia` scripts |
| `.env.example` | Sepolia RPC and private key placeholders with security notes |
| `README.md` | M9 status and commands |

### backend

| Path | Change |
| --- | --- |
| `app/Services/Blockchain/EthereumRpcClient.php` | `eth_sendRawTransaction` path for Sepolia/testnet |
| `app/Services/Blockchain/EthereumTransactionSigner.php` | **Created** — isolated legacy tx signing via `web3p/ethereum-tx` |
| `app/Services/Blockchain/BlockchainConfigValidator.php` | Sepolia-specific validation |
| `composer.json` | `web3p/ethereum-tx` dependency |
| `.env.example` | Sepolia configuration block |
| `tests/Unit/Blockchain/EthereumRpcClientTest.php` | Raw transaction and Ganache regression tests |
| `tests/Unit/Blockchain/EthereumTransactionSignerTest.php` | **Created** |
| `tests/Feature/Blockchain/BlockchainConfigurationTest.php` | Sepolia config validation tests |

---

## 4. Environment Variables

### blockchain/.env

| Variable | Purpose |
| --- | --- |
| `GANACHE_RPC_URL` | Local Ganache RPC (unchanged) |
| `DEPLOYER_PRIVATE_KEY` | Optional Ganache deployer key |
| `SEPOLIA_RPC_URL` | Sepolia JSON-RPC endpoint (Infura, Alchemy, etc.) |
| `SEPOLIA_PRIVATE_KEY` | Deployer wallet private key — **never commit** |

The Sepolia wallet needs **Sepolia ETH** for deployment and the sample `storeHash` verification transaction.

### backend/.env (Sepolia)

| Variable | Example / notes |
| --- | --- |
| `BLOCKCHAIN_ENABLED` | `true` |
| `BLOCKCHAIN_MODE` | `testnet` |
| `BLOCKCHAIN_NETWORK` | `sepolia` |
| `BLOCKCHAIN_ENVIRONMENT` | `staging` |
| `BLOCKCHAIN_CHAIN_ID` | `11155111` |
| `BLOCKCHAIN_RPC_URL` | Same or separate provider URL as Hardhat |
| `BLOCKCHAIN_CONTRACT_ADDRESS` | From `deployments/sepolia/EvidenceStore.json` |
| `BLOCKCHAIN_CONTRACT_ABI_PATH` | `../blockchain/deployments/sepolia/EvidenceStore.json` |
| `BLOCKCHAIN_WALLET_ADDRESS` | Backend signer address (must match private key) |
| `BLOCKCHAIN_PRIVATE_KEY` | Server wallet key — **never commit** |
| `BLOCKCHAIN_CONFIRMATION_BLOCKS` | `2` recommended for Sepolia |

---

## 5. Hardhat Deployment Steps

```bash
cd blockchain
npm install
cp .env.example .env
# Fill SEPOLIA_RPC_URL and SEPOLIA_PRIVATE_KEY locally.
npm run compile
npm test
npm run deploy:sepolia
npm run verify:sepolia
```

**`deploy:sepolia`** writes:

```text
deployments/sepolia/EvidenceStore.json
```

Minimum JSON fields:

```json
{
  "contractName": "EvidenceStore",
  "network": "sepolia",
  "chainId": 11155111,
  "address": "0x...",
  "deployer": "0x...",
  "deploymentTxHash": "0x...",
  "deployedAt": "ISO-8601",
  "abi": []
}
```

Optional safe fields: `deploymentBlockNumber`, `explorerTxUrl` (Etherscan).

**`verify:sepolia`** checks chain ID, bytecode, and idempotently stores/verifies a harmless sample hash.

---

## 6. Laravel Sepolia Configuration

```bash
cd backend
```

Set `.env` from deployment JSON (see section 4), then:

```bash
php artisan config:clear
php artisan blockchain:check-config
php artisan test --filter=Blockchain
```

**Anchoring behavior:**

- **Ganache** (`BLOCKCHAIN_NETWORK=ganache`): `eth_sendTransaction` with unlocked accounts or configured wallet.
- **Sepolia** (`BLOCKCHAIN_NETWORK=sepolia` or `BLOCKCHAIN_MODE=testnet`): `eth_sendRawTransaction` with locally signed legacy transactions.

**PHP requirement:** `ext-gmp` must be enabled for live Sepolia signing (`EthereumTransactionSigner`). Automated tests mock signing and do not require GMP.

---

## 7. Smoke Test / Manual Demonstration

### A. Contract on Sepolia

1. Run Hardhat steps in section 5.
2. Confirm `deployments/sepolia/EvidenceStore.json` exists.
3. Open `explorerTxUrl` or `https://sepolia.etherscan.io/tx/<deploymentTxHash>`.

### B. Laravel anchor one record

Prerequisites:

- Sepolia contract deployed and Laravel `.env` configured.
- `php artisan blockchain:check-config` passes.
- Queue worker running: `php artisan queue:work` (database queue).

Steps:

1. Create or identify an `anpr_event` with a deterministic hash (existing M5/M6 flow).
2. Create a `blockchain_record` via `BlockchainRecordService` (or existing API) with `BLOCKCHAIN_ENABLED=true`.
3. Let `AnchorBlockchainRecordJob` process the queue job.
4. Confirm `blockchain_records.tx_hash` is set and `status = confirmed`.
5. Verify on Sepolia: `https://sepolia.etherscan.io/tx/<tx_hash>`.
6. Run manual verification: `POST /api/blockchain-records/{id}/verify` (**Admin only**) — expect `valid` if hash matches and is on-chain.

---

## 8. Security Rules

- Private keys and RPC secrets stay in `.env` only.
- `php artisan blockchain:check-config` prints `Private key: [configured]` — never the raw value.
- RPC and signing errors pass through `BlockchainRetryService::sanitizeError()`.
- Only `bytes32` hashes are sent in transaction `data`.
- React and AI ANPR do not call Ethereum for M9.

---

## 9. Testing Results

### blockchain

```bash
npm run compile
npm test
```

Hardhat unit tests run locally without Sepolia RPC. `deploy:sepolia` and `verify:sepolia` are **manual** (require live RPC and Sepolia ETH).

### backend

```bash
php artisan test --filter=Blockchain
```

Covers:

- Ganache `eth_sendTransaction` unchanged
- Sepolia `eth_sendRawTransaction` path (mocked signer)
- Chain ID mismatch before submit
- Sepolia config validation (private key, chain ID `11155111`)
- Sanitized errors (no private key or RPC URL leakage)

---

## 10. Troubleshooting

### Record stays `submitted` with `confirmations = 1` and `confirmed_at = null`

This is expected when `BLOCKCHAIN_CONFIRMATION_BLOCKS` is greater than the current confirmation count (for example `2` on Sepolia while only one block has passed).

1. Wait for additional Sepolia blocks to be mined.
2. Run `php artisan blockchain:refresh-submitted --network=sepolia --environment=staging` (or `--sync` for immediate inline refresh).
3. Ensure `php artisan queue:work` is running so scheduled `refresh_confirmation` jobs execute.
4. Refresh re-checks the **existing** `tx_hash` only; it does not submit a duplicate transaction.

### Record has `tx_hash` but `last_error = Transaction receipt is not yet available`

The Sepolia transaction may already be submitted even though the RPC node has not returned a receipt yet.

1. Check the `tx_hash` on [Sepolia Etherscan](https://sepolia.etherscan.io/) — a successful transaction means anchoring is in progress or complete.
2. Run or restart `php artisan queue:work` — the receipt-first recovery path in `AnchorBlockchainRecordJob` should confirm the existing transaction **without** submitting a duplicate `storeHash`.
3. Do **not** create a new `blockchain_record` for the same entity/proof; retry or let the queue worker finish recovery on the existing row.

---

## 11. Known Limitations

- **No live Sepolia in CI** — deployment and anchoring demos require real RPC and test ETH.
- **`ext-gmp` required** for production Sepolia signing on the Laravel server.
- **Legacy (type-0) transactions** — sufficient for M9 `storeHash`; EIP-1559 type-2 not implemented.
- **Single deployer/owner wallet** — backend wallet must be contract owner (or a funded owner must exist for `storeHash`).
- **No live Sepolia tx in automated test run** — a real `tx_hash` is produced only when you run the manual demo.

---

## 12. Not Delivered in M9

| Item | Milestone |
| --- | --- |
| ANPR auto-anchoring on event ingest | M10 |
| React blockchain monitoring dashboard | M11 |
| Mainnet / production network | Future |
| Frontend Web3 or wallet integration | Out of scope |
| AI ANPR direct Ethereum calls | Out of scope |
| Solidity contract changes | Not required — same `EvidenceStore` |

---

## 13. Related Documentation

- [`m8-verification-system.md`](m8-verification-system.md) — verification APIs and strict ABI bool decoding
- [`m6-ganache-anchoring-end-to-end.md`](m6-ganache-anchoring-end-to-end.md) — Ganache anchoring baseline
- [`../README.md`](../README.md) — project setup and npm scripts
- [`../blockchain-module.md`](../blockchain-module.md) — full module plan
