# M13 — Final Hardening, Testing, and Documentation

**Milestone:** Blockchain M13 — Final Hardening, Testing, and Documentation  
**Status:** Implementation and documentation complete; demo screenshot evidence pending local capture  
**Implementation repositories:** `backend`, `frontend`, `blockchain`  
**Prior milestone:** M12 — Patrol and Profile Future Integration

---

## 1. Milestone Summary

Blockchain **M13** is the final hardening, regression testing, failure-demo readiness, screenshot checklist, and documentation milestone for the FYP Blockchain Module. It prepares the module for demonstration and viva defense without redesigning architecture or adding new blockchain features.

M13 confirms that M0–M12 deliverables remain correct, adds focused regression tests where gaps were identified, documents reproducible manual demo and failure scenarios, and updates milestone documentation to reflect **implemented behavior only**.

**No production blockchain architecture changes** were required beyond M12. M13 adds regression tests and documentation.

---

## 2. Scope

### In scope

| Area | Delivered |
|------|-----------|
| Gap analysis | Backend, frontend, Hardhat inspection checklist |
| Regression tests | `BlockchainM13RegressionTest.php`; frontend `anpr_image` label test |
| Automated test verification | Backend blockchain suite, integration tests, Hardhat, frontend Vitest, frontend build |
| Failure demo matrix | Documented scenarios for RPC failure, retry, tamper, refresh, pending, on-chain missing |
| Manual demo checklist | Ganache, Sepolia, dashboard, verification, module proofs |
| Screenshot checklist | Professional table with pending status (no fabricated captures) |
| Documentation freeze | This document; targeted README / module doc updates |

### Out of scope

| Item | Notes |
|------|-------|
| New blockchain architecture | Preserved Laravel-owned proof layer |
| Direct frontend Ethereum / Web3 | Prohibited and verified absent |
| AI ANPR Ethereum integration | Not added; ANPR sends data to Laravel only |
| Raw data on-chain | Hashes only |
| Dashboard redesign | M11 UI preserved |
| New smart contract business logic | `EvidenceStore.sol` remains minimal |
| Fabricated screenshots or test results | Not included |

---

## 3. Architecture Confirmation

| Rule | Status |
|------|--------|
| Laravel is the source of truth | **Confirmed** |
| Blockchain stores deterministic hashes only | **Confirmed** |
| React uses Laravel APIs only | **Confirmed** — no Web3/ethers/wallet/RPC in frontend |
| AI ANPR sends data to Laravel only | **Confirmed** — no Ethereum calls in `anpr` |
| Central tables reused | **Confirmed** — `blockchain_records`, `blockchain_jobs`, `blockchain_verifications` |
| Asynchronous anchoring | **Confirmed** — ANPR, patrol validation, profile flows do not wait for confirmation |
| Private keys backend-only | **Confirmed** — `.env` only; API responses sanitized |
| Admin-only monitoring | **Confirmed** — middleware + route guards |

---

## 4. Phase 1 — Inspection and Gap Analysis

### Backend inspection summary

| Area | Finding |
|------|---------|
| Canonical hashing | Deterministic via `BlockchainCanonicalJson` + `BlockchainHashService` |
| Volatile timestamps | Patrol `validated_at` **removed** in M12 follow-up; not in canonical hash |
| Patrol payloads | No GPS coordinates or route points in canonical/summary |
| Profile payloads | Safe summaries; email hashes only; no raw password/OTP/TOTP/token |
| Multiple profile proof types | Supported — distinct `proof_type` per sensitive change |
| Duplicate prevention | Unique key includes `record_hash` |
| Retry logic | `BlockchainRetryService` cancels only targeted retry jobs |
| Submitted refresh | Missing receipts remain `submitted`; refresh job/API supported |
| Verification outcomes | `valid`, `tampered`, `pending`, `failed`, `onchain_missing` |
| Admin-only APIs | Monitoring, verify, retry, refresh enforced in tests |
| Error sanitization | RPC URLs and private keys redacted in logs/errors |

**Gap identified:** No single regression test asserting all three profile proof types coexist for one user, patrol volatile-field exclusion under time shift, and API responses never containing `private_key` / `rpc_url`.

### Frontend inspection summary

| Area | Finding |
|------|---------|
| Laravel API only | `blockchainMonitoringService.js` → `api.js` |
| No Web3 | No ethers/web3 dependency added |
| Admin-only routes | Matches backend |
| Entity labels | ANPR Event, ANPR Image, Patrol Session, User Profile |
| Safe payload summary | Filters `private`, `secret`, `rpc` keys |
| Verify/retry/refresh | Detail controller handles loading and errors |
| Concurrency | Latest-request-wins in dashboard controller (M11) |

**Gap identified:** Explicit Vitest case for `anpr_image` entity label.

### Hardhat inspection summary

| Area | Finding |
|------|---------|
| Minimal contract | `EvidenceStore.sol` — hash storage + verify only |
| Owner-only store | Tested |
| Empty / duplicate rejection | Tested |
| Verify true/false | Tested |
| Ownership transfer | Tested |
| Events | `HashStored`, `OwnershipTransferred` tested |

**Gap identified:** None — existing suite complete.

---

## 5. Hardening Work Completed

### Production code changes

**None.** M0–M12 implementation was inspected and found aligned with architecture rules. M12 already addressed patrol idempotency (`validated_at` removal).

### Tests added or updated

| File | Change |
|------|--------|
| `backend/tests/Feature/Blockchain/BlockchainM13RegressionTest.php` | **New** — profile proof-type coexistence, patrol volatile/GPS exclusion, API secret leak regression |
| `frontend/src/feature/blockchain-monitoring/repositories/BlockchainMonitoringRepository.test.js` | Added `anpr_image` → **ANPR Image** label test |

---

## 6. Automated Test Coverage

### Backend PHPUnit — blockchain-focused

| Test area | Primary files | M13 status |
|-----------|---------------|------------|
| Canonical JSON / hashing | `BlockchainCanonicalJsonTest`, `BlockchainHashServiceTest` | Covered |
| Record service / duplicates | `BlockchainRecordServiceTest` | Covered |
| Config validation | `BlockchainConfigurationTest` | Covered |
| Ganache anchoring (mock RPC) | `BlockchainAnchoringTest` | Covered |
| Retry / stale job isolation | `BlockchainRetryTest`, `BlockchainRetryServiceTest` | Covered |
| Verification outcomes | `BlockchainVerificationTest`, `BlockchainVerificationServiceTest` | Covered |
| Submitted refresh | `BlockchainSubmittedRecordRefreshTest` | Covered |
| Admin-only monitoring APIs | `BlockchainMonitoringApiTest` | Covered |
| ANPR integration | `AnprBlockchainIntegrationTest` | Covered |
| Patrol integration | `PatrolBlockchainIntegrationTest` | Covered |
| Profile integration | `ProfileBlockchainIntegrationTest` | Covered |
| M13 cross-module regression | `BlockchainM13RegressionTest` | **Added** |

### Frontend Vitest — blockchain monitoring

| Test area | File | M13 status |
|-----------|------|------------|
| Repository normalization | `BlockchainMonitoringRepository.test.js` | Covered (+ `anpr_image` label) |
| Dashboard concurrency | `useBlockchainMonitoringController.test.jsx` | Covered |
| Status chips / payload summary | `BlockchainMonitoringComponents.test.jsx` | Covered |

### Hardhat

| Test area | File | M13 status |
|-----------|------|------------|
| EvidenceStore contract | `test/EvidenceStore.test.js` | **13 passing** |

---

## 7. Failure Demo Matrix

| Scenario | Expected behavior | How to demonstrate |
|----------|-------------------|-------------------|
| **Failed RPC** | Record moves to `failed`; sanitized `last_error`; retry available | Stop Ganache or point `BLOCKCHAIN_RPC_URL` to invalid host; trigger anchoring |
| **Retry** | Admin `POST /api/blockchain-records/{id}/retry` re-queues `AnchorBlockchainRecordJob` | Blockchain Monitoring → failed record → Retry |
| **Tampered record** | Verification returns `tampered` | Confirm record, alter source DB field (e.g. ANPR plate or patrol checkpoint status), run Verify |
| **Missing receipt / submitted refresh** | Record stays `submitted`; refresh confirms later | Mock/stop receipt polling; use refresh API or `RefreshSubmittedBlockchainRecordJob` |
| **Pending verification** | Non-confirmed record → verification `pending` | Verify a `pending`/`queued` record before confirmation |
| **On-chain missing** | Hash matches DB but contract returns false → `onchain_missing` | Verify confirmed record whose hash was never stored on-chain (or after chain reset) |

All failure paths are covered by automated tests with mocked RPC where live networks are unavailable.

---

## 8. Manual Demo Checklist

| # | Scenario | Steps | Pass criteria |
|---|----------|-------|---------------|
| 1 | Ganache deployment | `npm run deploy:ganache` in `blockchain` | Contract address in `deployments/ganache/EvidenceStore.json` |
| 2 | Laravel Ganache config | `php artisan blockchain:check-config` with `BLOCKCHAIN_ENABLED=true` | Config validation passes |
| 3 | Laravel anchors to Ganache | Create ANPR event or patrol validation with blockchain enabled | `blockchain_records` row → `queued`/`confirmed`; `tx_hash` present |
| 4 | Sepolia configuration | Configure Sepolia RPC, wallet, contract in `.env` | `blockchain:check-config` passes for testnet mode |
| 5 | Sepolia transaction | Anchor one test record to Sepolia | `tx_hash` visible on Sepolia explorer |
| 6 | Dashboard list | Admin → `/admin/blockchain-monitoring` | Summary cards and table load |
| 7 | Record detail | Open a record detail page | Jobs, verifications, payload summary, hashes |
| 8 | Manual verification — valid | Verify confirmed untampered record | Result **Valid** |
| 9 | Manual verification — tampered | Tamper DB source; verify | Result **Tampered** |
| 10 | RPC failure / retry | Induce failure; use Retry | Record re-queues; eventual confirm or visible failure |
| 11 | Submitted refresh | Submitted record with tx; refresh | Confirmations/block update or remains submitted safely |
| 12 | Patrol proof | `POST /patrol-sessions/{id}/validate` | `patrol_session` / `validation_result` record in dashboard |
| 13 | Profile proof | Password/email/2FA sensitive change | `user_profile` record with correct `proof_type` |
| 14 | ANPR proof | Create ANPR event / upload image | `anpr_event` / `anpr_image` records visible |
| 15 | Non-admin blocked | Operator/Guard opens monitoring URL | 403 / forbidden |

---

## 9. Screenshot Checklist

No screenshot files are committed to this repository. Use the table below during FYP demo preparation.

| Screenshot item | Purpose | Suggested file name | Required environment | Status | Notes |
|-----------------|---------|---------------------|----------------------|--------|-------|
| Ganache deployment | Prove local contract deploy | `m13-ganache-deployment.png` | Ganache + Hardhat | **Pending** | Terminal output with contract address |
| Sepolia transaction | Prove public testnet anchor | `m13-sepolia-transaction.png` | Sepolia + funded wallet | **Pending** | Etherscan tx page |
| Blockchain dashboard | M11 monitoring list | `m13-blockchain-dashboard.png` | Admin login | **Pending** | Summary cards + table |
| Valid verification | Tamper-evident proof works | `m13-record-detail-valid-verification.png` | Confirmed record | **Pending** | Detail page verification panel |
| Tampered verification | Tamper detection | `m13-tampered-verification.png` | After controlled DB edit | **Pending** | Result shows Tampered |
| Failed RPC / retry | Operational resilience | `m13-failed-rpc-retry.png` | Simulated RPC failure | **Pending** | Failed status + retry action |
| Profile proof record | Profile M13 visibility | `m13-profile-proof-record.png` | After sensitive profile change | **Pending** | Filter `user_profile` |
| Patrol proof record | M12 patrol integration | `m13-patrol-proof-record.png` | After patrol validation | **Pending** | Filter `patrol_session` |
| ANPR proof record | M10 ANPR integration | `m13-anpr-proof-record.png` | After ANPR event/image | **Pending** | `anpr_event` or `anpr_image` row |

Recommended storage (local, not committed): `blockchain/docs/screenshots/m13/`

---

## 10. Security and Privacy Confirmation

| Control | Confirmation |
|---------|--------------|
| No raw ANPR images on-chain | Only SHA-256 hashes anchored |
| No GPS coordinates or route points on-chain | Patrol payloads use counts and checkpoint summaries only |
| No raw user profile data on-chain | Profile proofs use safe metadata and email hashes only |
| No private keys in frontend | Not stored, not displayed, not in API responses |
| No private keys in AI ANPR | AI ANPR does not call Ethereum |
| No private keys in documentation | This document contains no secrets |
| Payload summaries safe | Dashboard shows `payload_summary` only; no raw canonical JSON |
| Verification reads location logs for aggregate counts only | Coordinates never enter canonical payload or summary |
| Normal APIs non-blocking | ANPR, patrol validate, profile changes return without waiting for chain confirmation |

---

## 11. Known Limitations

| Limitation | Notes |
|------------|-------|
| Sepolia anchoring | Requires RPC provider availability and testnet ETH |
| Ganache local state | Resets when workspace resets; on-chain proofs may disappear |
| Screenshots | Pending local capture — not stored in repository |
| Full backend suite stability | Full `php artisan test` reached 611 passing tests / 2354 assertions, then PHP exited with code 2 during `ProfilePictureTest::test_admin_can_upload_own_profile_picture`. Re-running `ProfilePictureTest` in isolation passed 18/18. Treated as a long-run PHP process stability issue, not a Blockchain M13 regression |
| Patrol session FK | `patrol_sessions.blockchain_record_id` links first proof only; additional proofs found via entity filter |
| Admin-only monitoring | Security Operators and Guards have no blockchain dashboard access by design |

---

## 12. Final Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Laravel blockchain tests pass | **Yes** — 268 tests (`--filter=Blockchain`) |
| Integration tests pass | **Yes** — ANPR, Patrol, Profile, Submitted Refresh |
| Hardhat tests pass | **Yes** — 13 passing |
| Frontend blockchain tests pass | **Yes** — 22 tests |
| Frontend build passes | **Yes** |
| Failure demos documented | **Yes** — Section 7 |
| Manual demo checklist documented | **Yes** — Section 8 |
| Screenshot checklist documented | **Yes** — Section 9 (pending captures) |
| Demo screenshot evidence captured | **Pending** — local capture per Section 9 (M13.4) |
| Documentation reflects implemented behavior only | **Yes** |
| No architecture regression | **Yes** |

**Blockchain M13 — implementation and documentation are complete. Demo screenshot evidence remains pending local capture.**

---

## 13. Commands Run and Results

| Command | Result |
|---------|--------|
| `php artisan test --filter=Blockchain` | **268 passed** |
| `php artisan test --filter=AnprBlockchainIntegrationTest` | **19 passed** |
| `php artisan test --filter=PatrolBlockchainIntegrationTest` | **8 passed** |
| `php artisan test --filter=ProfileBlockchainIntegrationTest` | **12 passed** |
| `php artisan test --filter=BlockchainSubmittedRecordRefreshTest` | **10 passed** |
| `php artisan test --filter=BlockchainM13RegressionTest` | **3 passed** |
| `php artisan test` (full suite) | **Attempted** — 611 passed / 2354 assertions (~16 min), then PHP exit code 2 during `ProfilePictureTest::test_admin_can_upload_own_profile_picture` (premature process end). Not treated as a Blockchain M13 regression |
| `php artisan test --filter=ProfilePictureTest` | **18 passed** — confirms isolated rerun after full-suite process crash |
| `npm test` (`blockchain`) | **13 passing** |
| `npm run test -- --run src/feature/blockchain-monitoring` | **22 passed** |
| `npm run build` (`frontend`) | **Success** |

```bash
cd backend
php artisan test --filter=Blockchain
php artisan test --filter=AnprBlockchainIntegrationTest
php artisan test --filter=PatrolBlockchainIntegrationTest
php artisan test --filter=ProfileBlockchainIntegrationTest
php artisan test --filter=BlockchainSubmittedRecordRefreshTest
php artisan test --filter=BlockchainM13RegressionTest
php artisan test --filter=ProfilePictureTest

cd blockchain
npm test

cd frontend
npm run test -- --run src/feature/blockchain-monitoring
npm run build
```

---

## 14. Files Changed

| File | Change |
|------|--------|
| `backend/tests/Feature/Blockchain/BlockchainM13RegressionTest.php` | **New** M13 regression tests |
| `frontend/src/feature/blockchain-monitoring/repositories/BlockchainMonitoringRepository.test.js` | Added `anpr_image` label test |
| `blockchain/docs/m13-final-hardening-testing-and-documentation.md` | **This document** |
| `blockchain/README.md` | M13 status update |
| `blockchain/blockchain-module.md` | M13 completion status |
| `backend/documentation.md` | Stale M11-pending statement corrected |

---

## Related documentation

- [`m12-patrol-and-profile-future-integration.md`](m12-patrol-and-profile-future-integration.md)
- [`m11-blockchain-monitoring-frontend.md`](m11-blockchain-monitoring-frontend.md)
- [`../blockchain-module.md`](../blockchain-module.md)
- [`../../backend/documentation.md`](../../backend/documentation.md)
- [`../../frontend/documentation.md`](../../frontend/documentation.md)
