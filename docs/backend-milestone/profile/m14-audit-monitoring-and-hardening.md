# Profile Module M14 — Audit, Monitoring, and Hardening

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`../../../docs/profile-module.md`](../../../docs/profile-module.md) and [`../../documentation.md`](../../documentation.md).

**Milestone:** M14  
**Status:** Completed  
**Date:** 2026-06-29  
**Previous Milestone:** [M13 — Blockchain Integration for Profile Changes](m13-blockchain-integration-for-profile-changes.md)  
**Target design reference:** [`../../../docs/profile-module.md`](../../../docs/profile-module.md)

---

## 1. Purpose

M14 hardens the existing Profile Module (M0–M13) without redesigning it. All critical profile actions are traceable through sanitized `auth_audit_logs`, sensitive attempts are rate-limited with generic responses, profile FormRequests reject unexpected fields, and regression tests prove self-scope, session invalidation, and M13 blockchain compatibility.

---

## 2. Scope

| Item                                                        | Status          |
| ----------------------------------------------------------- | --------------- |
| `password_change_failed` audit event and service wiring     | **Implemented** |
| Failure audits for password/email step-up and email confirm | **Implemented** |
| `email_change_confirm` rate-limit scope                     | **Implemented** |
| Invalid-token rate limits for email confirm and 2FA verify  | **Implemented** |
| Allow-list hardening on all Profile FormRequests            | **Implemented** |
| Auth Monitoring profile action filters (frontend)           | **Implemented** |
| Focused audit / rate-limit / security regression tests      | **Implemented** |
| M14 documentation                                           | **Implemented** |

---

## 3. Non-Scope

| Item                                          | Notes                                                    |
| --------------------------------------------- | -------------------------------------------------------- |
| New Profile monitoring page                   | Reuses existing Auth Monitoring dashboard                |
| Profile-page blockchain widget                | M13 display path unchanged (Blockchain Monitoring)       |
| `profile_viewed` audit event                  | Intentionally omitted to reduce noise                    |
| Picture upload/remove failure audit events    | Validation fails before service layer                    |
| Separate rate-limit scopes per step-up action | Password/email/2FA start share `step_up` scope by design |
| Phone/address offline queue hardening changes | M12 behavior preserved                                   |

---

## 4. Architecture Summary

```text
Profile HTTP endpoints (ProfileController)
    → Profile FormRequests (allow-list validation)
    → Profile services (ProfileService, ProfilePasswordService, …)
        → ProfileSecurityService / ProfileStepUpRateLimiter
        → AuthAuditService (sanitized auth_audit_logs)
        → ProfileBlockchainService (M13, committed flows only)

Admin visibility:
    GET /api/auth-audit-logs (existing)
    React Auth Monitoring → AuthAuditFilterBar profile action filters
```

Sensitive committed changes still revoke refresh tokens, invalidate stale JWTs via `active.user` middleware, and anchor blockchain proofs through M13.

---

## 5. Audit Event Matrix

| Event                            | Status  | Written by                           | Failure reasons (examples)                                                                                                                                                                  |
| -------------------------------- | ------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile_updated`                | success | `ProfileService`                     | —                                                                                                                                                                                           |
| `profile_update_failed`          | failure | `ProfileService`                     | `profile_version_conflict`                                                                                                                                                                  |
| `profile_picture_uploaded`       | success | `ProfilePictureService`              | —                                                                                                                                                                                           |
| `profile_picture_removed`        | success | `ProfilePictureService`              | —                                                                                                                                                                                           |
| `password_changed`               | success | `ProfilePasswordService`             | —                                                                                                                                                                                           |
| `password_change_failed`         | failure | `ProfilePasswordService`             | `step_up_failed`, `step_up_rate_limited`                                                                                                                                                    |
| `email_change_started`           | success | `ProfileEmailService`                | —                                                                                                                                                                                           |
| `email_changed`                  | success | `ProfileEmailService`                | —                                                                                                                                                                                           |
| `email_change_failed`            | failure | `ProfileEmailService`                | `step_up_failed`, `step_up_rate_limited`, `invalid_token`, `token_user_mismatch`, `invalid_pending_email`, `email_unavailable`, `rate_limited`                                              |
| `two_factor_reconfigure_started` | success | `ProfileTwoFactorReconfigureService` | —                                                                                                                                                                                           |
| `two_factor_reconfigured`        | success | `ProfileTwoFactorReconfigureService` | —                                                                                                                                                                                           |
| `two_factor_reconfigure_failed`  | failure | `ProfileTwoFactorReconfigureService` | `step_up_failed`, `step_up_rate_limited`, `missing_valid_2fa_setup`, `security_state_changed`, `invalid_token`, `used`, `expired`, `token_user_mismatch`, `invalid_new_otp`, `rate_limited` |

### Audit metadata conventions

- `source = self_profile`
- `target_user_id` (authenticated user UUID)
- `profile_version` where applicable
- `reason` for failures (generic, non-revealing)
- `revoked_count` on successful sensitive commits
- Email fields use hashes / `omitTopLevelEmail: true`; raw email is not stored in top-level audit rows for sensitive flows

### Never stored in audit metadata

Passwords, OTP/TOTP codes, secrets, tokens, bearer values, `otpauth://` URIs, raw pending 2FA secrets, and similar keys are stripped by `AuthAuditService::sanitizeMetadata()`.

---

## 6. Rate-Limit Policy

| Scope                    | Constant                     | Used for                                                             |
| ------------------------ | ---------------------------- | -------------------------------------------------------------------- |
| `step_up`                | default                      | Password change, email start, 2FA reconfigure start step-up failures |
| `email_change_confirm`   | `SCOPE_EMAIL_CHANGE_CONFIRM` | Invalid email confirmation tokens                                    |
| `2fa_reconfigure_verify` | `SCOPE_RECONFIGURE_VERIFY`   | Invalid 2FA reconfigure tokens and invalid new OTP                   |

Configuration: `config/profile.php` → `step_up.max_attempts` (default 5), `step_up.decay_seconds` (default 300).

Behavior:

- Repeated failures return **429** with message `Too many step-up verification attempts.` and `retry_after_seconds`
- Step-up failure responses remain **422** with a single generic message (no password vs OTP distinction)
- Lock expires after the decay window; legitimate retries succeed afterward

---

## 7. Monitoring Behavior

**Backend:** Profile events are written to `auth_audit_logs` and listed through the existing `GET /api/auth-audit-logs` Admin API.

**Frontend:** `AuthAuditFilterBar` includes all profile audit action values so Admins can filter Auth Monitoring by profile event type. No new Profile monitoring page was added.

---

## 8. Security Hardening Summary

### FormRequest allow-lists

All Profile FormRequests use `RejectsUnexpectedProfileFields` to return **422** for prohibited keys (for example `user_id`, `target_user_id`, `role_id`, `two_factor_enabled`, `two_factor_secret`).

### Self-scope

Profile endpoints operate only on `$request->user('api')`. Cross-user payload fields are rejected at validation; Admin User Management (`PATCH /api/users/{id}`) remains separate.

### Session / JWT regression

Existing M4–M7 behavior preserved and covered by M14 regression tests plus prior Profile tests: stale JWT blocked after password/email/2FA changes; refresh tokens revoked; refresh cookie cleared on sensitive success responses.

### M13 compatibility

Committed password/email/2FA flows still create exactly one `user_profile` blockchain record per event. Start/pending flows do not create records. Blockchain failures do not roll back profile DB changes.

---

## 9. Files Created / Updated

### Created

| Path                                                                                   |
| -------------------------------------------------------------------------------------- |
| `app/Http/Requests/Profile/Concerns/RejectsUnexpectedProfileFields.php`                |
| `tests/Feature/Profile/ProfileAuditHardeningTest.php`                                  |
| `tests/Feature/Profile/ProfileRateLimitHardeningTest.php`                              |
| `tests/Feature/Profile/ProfileSecurityRegressionTest.php`                              |
| `docs/profile/m14-audit-monitoring-and-hardening.md`                                   |
| `frontend/src/feature/auth-monitoring/components/AuthAuditFilterBar.test.jsx` |

### Updated

| Path                                                          | Change                                           |
| ------------------------------------------------------------- | ------------------------------------------------ |
| `app/Services/Auth/AuthAuditService.php`                      | `EVENT_PASSWORD_CHANGE_FAILED`                   |
| `app/Services/Profile/ProfilePasswordService.php`             | Failure audits                                   |
| `app/Services/Profile/ProfileEmailService.php`                | Start/confirm failure audits; confirm rate limit |
| `app/Services/Profile/ProfileTwoFactorReconfigureService.php` | Invalid-token verify rate limit                  |
| `app/Services/Profile/ProfileStepUpRateLimiter.php`           | `SCOPE_EMAIL_CHANGE_CONFIRM`                     |
| `app/Http/Controllers/Api/ProfileController.php`              | 429 on email confirm rate limit                  |
| `app/Http/Requests/Profile/*.php`                             | Allow-list hardening                             |
| `frontend/.../AuthAuditFilterBar.jsx`                | Profile action filters                           |
| `frontend/.../AuthMonitoringRepository.test.js`      | Profile action query test                        |
| `backend/documentation.md`                         | M14 summary                                      |
| `frontend/documentation.md`                          | Auth Monitoring profile filters                  |

---

## 10. Test Coverage

### Backend

| File                                | Focus                                                        |
| ----------------------------------- | ------------------------------------------------------------ |
| `ProfileAuditHardeningTest.php`     | Failure audits, IP/UA capture, metadata sanitizer            |
| `ProfileRateLimitHardeningTest.php` | Lockout, expiry recovery, confirm/verify token limits        |
| `ProfileSecurityRegressionTest.php` | Prohibited fields, self-scope, admin independence, M13 smoke |
| Existing `tests/Feature/Profile/*`  | Prior milestone behavior retained                            |

### Frontend

| File                               | Focus                                            |
| ---------------------------------- | ------------------------------------------------ |
| `AuthAuditFilterBar.test.jsx`      | Profile options render; onChange passes `action` |
| `AuthMonitoringRepository.test.js` | `password_change_failed` query param             |

### Commands run

```bash
php artisan test --filter=ProfileAuditHardeningTest   # 7 passed
php artisan test --filter=ProfileRateLimitHardeningTest # 5 passed
php artisan test --filter=ProfileSecurityRegressionTest # 12 passed, 1 skipped (GD)
php artisan test --filter=Profile                       # 192 passed, 1 skipped
php artisan test --filter=AuthAuditLogTest              # 16 passed
php artisan test --filter=Blockchain                    # 250 passed

cd frontend
npx vitest run src/feature/auth-monitoring/components/AuthAuditFilterBar.test.jsx  # 2 passed
```

---

## 11. Passing Criteria

- [x] Every critical profile action has audit coverage
- [x] Useful failed sensitive attempts are audited safely
- [x] Audit metadata contains no secrets
- [x] Audit rows capture IP address and user agent (verified for representative events)
- [x] Sensitive profile actions are rate-limited with generic responses
- [x] Profile requests reject unexpected/prohibited fields
- [x] Users cannot edit another user through profile endpoints
- [x] Admin User Management remains independent
- [x] Stale JWT / refresh revocation behavior preserved
- [x] 2FA cannot be disabled from Profile Module
- [x] M13 blockchain proof behavior intact
- [x] Auth Monitoring can filter profile audit events
- [x] M14 documentation exists

---

## 12. Known Limitations

- Picture upload prohibited-field test is skipped when the PHP GD extension is unavailable in the test environment.
- Password, email start, and 2FA start share the same `step_up` rate-limit scope; locking one flow locks the others for the same user/IP until expiry.
- Auth Monitoring action dropdown lists profile events explicitly; other auth events (for example `two_factor_setup_completed`) remain filterable by typing the action in API queries but are not all listed in the UI.

---

## 13. M14 Completion Statement

**Profile Module M14 — Audit, Monitoring, and Hardening is complete.** The Profile Module now has comprehensive sanitized audit coverage, expanded failure logging, rate-limited sensitive attempts, strict FormRequest allow-lists, Auth Monitoring visibility for profile events, and regression tests confirming self-scope, session hardening, and M13 blockchain compatibility.
