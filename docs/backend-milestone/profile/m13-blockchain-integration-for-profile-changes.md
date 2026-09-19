# Profile Module M13 — Blockchain Integration for Profile Changes

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M13  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M12 — PWA Offline Profile Queue](m12-pwa-offline-profile-queue.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

M13 anchors **critical Profile identity changes** through the existing central blockchain system. Password change, email change confirmation, and 2FA reconfiguration verification each create a tamper-evident `blockchain_records` row with safe canonical payloads. User-facing Profile APIs do not wait for on-chain confirmation.

---

## 2. Scope

| Item | Status |
|---|---|
| `ProfileBlockchainService` for safe profile proof payloads | **Implemented** |
| `BlockchainRecordService::createForPayload()` | **Implemented** |
| Unique constraint update to allow repeated `user_profile` proofs | **Implemented** |
| Integration with password / email confirm / 2FA verify services | **Implemented** |
| `user_profile` verification via stored payload summary | **Implemented** |
| Blockchain Monitoring `user_profile` label/filter (existing) | **Verified** |
| Focused backend tests | **Implemented** |

---

## 3. Non-Scope

| Deferred / excluded item | Notes |
|---|---|
| Phone/address updates | M9 online + M12 offline queue — not anchored |
| Profile picture upload/remove | M10 — not anchored |
| Email-change start / 2FA reconfigure start | Pending flows only; no proof until commit |
| Offline profile queue replay | M12 — not part of M13 |
| Profile-page blockchain widget | Display path is Blockchain Monitoring dashboard |
| Raw email, password, OTP, TOTP, or token storage in payloads | Explicitly prohibited |

---

## 4. Architecture Summary

```text
Sensitive profile change committed (password / email confirm / 2FA verify)
    ↓
Audit event written
    ↓
ProfileBlockchainService.buildCanonicalPayload()
    ↓
BlockchainRecordService.createForPayload()
    ↓
BlockchainHashService.hashPayload()
    ↓
blockchain_records row (status = pending)
    ↓
maybeQueueForAnchoring() → AnchorBlockchainRecordJob (when BLOCKCHAIN_ENABLED=true)
    ↓
Blockchain Monitoring dashboard
```

| Component | Role |
|---|---|
| `ProfileBlockchainService` | Builds safe profile canonical payloads; fail-safe logging on errors |
| `BlockchainRecordService::createForPayload()` | Payload-based record creation + idempotent duplicate lookup by hash |
| `BlockchainVerificationService` | Recomputes `user_profile` proofs from stored `payload_summary` |
| Sensitive profile services | Call blockchain service **after** successful DB transaction |

---

## 5. Blockchain Payload Contract

**Entity**

- `entity_type = user_profile`
- `entity_id = <authenticated user UUID>`

**Proof types**

| Flow | `proof_type` |
|---|---|
| Password change | `profile_password_changed` |
| Email confirmation | `profile_email_changed` |
| 2FA reconfigure verify | `profile_2fa_reconfigured` |

**Safe canonical fields (example)**

```json
{
  "module": "profile",
  "entity_type": "user_profile",
  "entity_id": "user-uuid",
  "proof_type": "profile_password_changed",
  "action": "profile_password_changed",
  "profile_version": 7,
  "changed_at": "2026-06-29T10:00:00Z",
  "actor_user_id": "user-uuid",
  "revoked_count": 2,
  "source": "self_profile"
}
```

**Email change adds hashes only**

```json
{
  "old_email_hash": "sha256...",
  "new_email_hash": "sha256..."
}
```

**Never included:** passwords, password hashes, OTP codes, TOTP secrets, pending secrets, email verification tokens, refresh tokens, authorization headers, raw email addresses, private keys, RPC URLs.

---

## 6. Schema Change — Repeated Profile Proofs

The original unique index on `(entity_type, entity_id, proof_type, canonical_version, environment)` prevented multiple password/email/2FA proofs for the same user.

Migration `2026_06_29_120000_update_blockchain_records_unique_constraint_for_profile_proofs` replaces it with:

```text
entity_type, entity_id, proof_type, canonical_version, environment, record_hash
```

- Repeated sensitive changes with different canonical payloads (different `profile_version` / `changed_at`) create separate rows.
- Exact duplicate payload/hash creation remains idempotent via `findExistingProof()` + DB unique constraint.
- ANPR `createForEntity()` behavior is unchanged; same entity still deduplicates by identical hash.

---

## 7. Verification Behavior

For `entity_type = user_profile`:

1. Do **not** recompute from the mutable `users` row.
2. Recompute hash from the stored safe `payload_summary` using `BlockchainHashService::hashPayload()`.
3. `createForPayload()` normalizes `payload_summary` through `BlockchainCanonicalJson` so stored values (for example `changed_at`) match the hashed canonical payload.
4. Missing/invalid summary → `failed` verification with safe error message.
5. Tampered summary (recomputed hash ≠ `record_hash`) → `tampered` for confirmed records.
6. Matching hash → existing on-chain `verifyHash()` flow (`valid` / `onchain_missing`).

ANPR event/image verification behavior is unchanged.

---

## 8. Security and Privacy Controls

- Only committed sensitive flows create proofs (not start/pending steps).
- API responses do not expose blockchain confirmation status or secrets.
- Blockchain failures are logged with sanitized messages; they do not roll back profile changes.
- Session revocation and M11 frontend re-auth behavior remain unchanged.
- M12 offline queue remains limited to `phone`/`address` and is not anchored.

---

## 9. Files Created / Updated

**Created**

- `app/Services/Profile/ProfileBlockchainService.php`
- `database/migrations/2026_06_29_120000_update_blockchain_records_unique_constraint_for_profile_proofs.php`
- `tests/Feature/Profile/ProfileBlockchainIntegrationTest.php`
- `docs/profile/m13-blockchain-integration-for-profile-changes.md`

**Updated**

- `app/Services/Blockchain/BlockchainRecordService.php` — `createForPayload()`, hash-aware `findExistingProof()`
- `app/Services/Blockchain/BlockchainVerificationService.php` — `user_profile` verification path
- `app/Services/Profile/ProfilePasswordService.php`
- `app/Services/Profile/ProfileEmailService.php`
- `app/Services/Profile/ProfileTwoFactorReconfigureService.php`
- `tests/Unit/Blockchain/BlockchainRecordServiceTest.php`
- `tests/Unit/Blockchain/BlockchainVerificationServiceTest.php`
- `tests/Feature/Blockchain/BlockchainDatabaseFoundationTest.php`
- `frontend/src/feature/blockchain-monitoring/repositories/BlockchainMonitoringRepository.test.js`

---

## 10. Test Coverage

**Backend**

- `ProfileBlockchainIntegrationTest` — password/email/2FA proof creation, start flows excluded, safe payloads, anchoring dispatch, idempotency, verification/tamper paths
- `BlockchainRecordServiceTest` — `createForPayload()`, repeated `user_profile` proofs
- `BlockchainVerificationServiceTest` — `user_profile` valid/tampered/invalid summary
- `BlockchainDatabaseFoundationTest` — updated unique constraint behavior
- Full `--filter=Profile` and `--filter=Blockchain` regression suites

**Frontend**

- `BlockchainMonitoringRepository.test.js` — `user_profile` filter + label normalization

---

## 11. Passing Criteria

- Password change creates `user_profile` / `profile_password_changed` record
- Email confirm creates `profile_email_changed`; start does not
- 2FA verify creates `profile_2fa_reconfigured`; start does not
- Anchoring job queued when blockchain enabled; API does not wait for confirmation
- Payload summaries contain no secrets or raw email
- Repeated sensitive changes create separate records; exact duplicates are idempotent
- `user_profile` verification uses stored payload summary
- ANPR blockchain behavior intact
- M5–M12 profile behavior intact

---

## 12. Known Limitations

- Profile proofs are historical event records; verification intentionally does not reflect current mutable user state.
- Blockchain record creation failure does not surface to the end user on `/account/profile`; administrators review status in the **Admin-only** Blockchain Monitoring dashboard.
- Blockchain Monitoring dashboard is **Admin only** (backend `admin` middleware + frontend `adminOnly()` route guard).
- Phone/address offline queue (M12) is not anchored by design.

---

## 13. Completion Statement

Profile Module **M13 — Blockchain Integration for Profile Changes** is complete. Sensitive profile commits now produce safe `user_profile` blockchain proofs through the central queue/job pipeline, with hash-aware idempotency, repeated-proof schema support, and payload-summary-based verification.
