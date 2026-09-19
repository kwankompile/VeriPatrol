# Profile Module — Architecture and Implementation Plan

**File Name:** `profile-module.md`  
**Project:** High-Security Surveillance Platform FYP  
**Frontend:** `frontend` — React 19 + Vite + Material UI  
**Backend:** `backend` — Laravel API + JWT + Refresh Sessions + Mandatory TOTP 2FA  
**Version:** 1.0 (frozen — M0–M15 implemented)  
**Prepared Role:** Principal Project Manager and Technical Writer

> **Current contract** (last audited **2026-07-21**)
>
> | Field | Value |
> | --- | --- |
> | **Status** | **M0–M15 complete**; Account Settings at `/account/profile` with `tab=profile` / `tab=security` (System Update M6) |
> | **Canonical precedence** | 1. [`backend/documentation.md`](../backend/documentation.md) §4 and `routes/api.php` → 2. [`frontend/documentation.md`](../frontend/documentation.md) routing → 3. [`docs/system-update/m6-account-settings-two-tab-redesign.md`](system-update/m6-account-settings-two-tab-redesign.md) → 4. This file |
> | **Historical policy** | §14 milestone passing criteria use *Historical milestone snapshot* banners; do not treat pre-M6 `/account/security` as a separate canonical page |
> | **Known manual tasks** | M15 demo checklist evidence is optional local capture; verify mail delivery for email-change demos |

---

## 1. Executive Summary

The **Profile Module** is the self-service account management module for all authenticated roles: **Admin**, **Security Operator**, and **Guard**. It allows users to view and update their own profile data while enforcing strict security controls for sensitive identity changes.

This module must not be treated as a simple CRUD page. It is a **security-sensitive identity module** that sits on top of the existing Login Module architecture. The current project already contains strong authentication foundations: mandatory TOTP 2FA, refresh-token sessions, session monitoring, audit logs, and admin-controlled 2FA recovery. The Profile Module extends those foundations into controlled profile management.

The latest architecture decisions are:

- **2FA remains mandatory.** Users cannot permanently turn off 2FA.
- **Sensitive changes require step-up verification.** Email changes, password changes, and 2FA reconfiguration require current password confirmation and TOTP verification before the change is committed.
- **Sensitive changes force re-authentication.** After password change, email change, or 2FA reconfiguration, the backend revokes refresh sessions and old JWTs, requiring the user to log in again and complete 2FA again.
- **Admin 2FA reset remains recovery-only.** Users may reconfigure 2FA only when they still have access to their current account. Lost-device recovery remains admin-controlled.
- **Backend is the source of truth.** The frontend may validate for UX, but all business rules, verification, authorization, file validation, audit logging, session invalidation, and blockchain anchoring are enforced by Laravel.
- **Profile and Admin User Management are separate domains.** Admin User Management controls other users. Profile Module controls only the authenticated user's own account.
- **Non-sensitive profile fields can support offline queueing.** Phone and address updates may be queued in the PWA. Email, password, and 2FA changes must never run offline.
- **Critical identity changes are tamper-evident.** Password, email, and 2FA changes must generate audit logs and blockchain records through the central blockchain module.

---

## 2. Module Objective

The Profile Module is responsible for:

- **Managing authenticated user identity data** such as name display, phone, address, and profile picture.
- **Securing sensitive account changes** such as password, email, and 2FA reconfiguration.
- **Providing session visibility and control** through existing refresh-session infrastructure.
- **Maintaining auditability** for profile and security actions.
- **Maintaining state consistency** across tabs, devices, and PWA offline states.
- **Anchoring critical identity changes** to the central blockchain proof layer.
- **Preserving high-security login assumptions** by enforcing mandatory 2FA and session invalidation after sensitive changes.

---

## 3. Current Project Context

### 3.1 Existing Strengths to Reuse

The Profile Module should reuse these completed foundations instead of rebuilding them:

- **JWT access token flow** with refresh-token cookie.
- **Refresh session database model** and session revocation APIs.
- **Mandatory TOTP 2FA login flow.**
- **Admin-controlled 2FA reset.**
- **Auth audit log model and service.**
- **Password-change session invalidation policy.**
- **`active.user` middleware**, which blocks disabled, setup-incomplete, or 2FA-incomplete users.
- **Frontend refresh-on-401 client** in `src/api/api.js`.
- **Frontend clean feature structure** using views, controllers, repositories, and datasources.
- **Blockchain record service** with `entity_type`, `entity_id`, `proof_type`, canonical hashing, queue jobs, verification, retry, and monitoring.
- **Account Settings (Security Settings tab)** — `/account/profile?tab=security` is canonical; `/account/security` redirects for compatibility (System Update M6). Session panel reuses `feature/account-security` components embedded on the security tab.

### 3.2 Implementation status (M0–M15 complete)

All items below were gaps at M0 planning and are **now implemented**:

- Dedicated **`ProfileController`** with full self-service API (`GET/PATCH /api/profile`, picture, password, email, 2FA reconfigure).
- Frontend **`feature/profile`** at `/account/profile` (two-tab Account Settings with security tab per M6).
- User-facing change email, change password, and 2FA reconfiguration flows with step-up verification.
- Profile picture upload/delete (`ProfilePictureService`).
- PWA offline queue for non-sensitive phone/address updates (`profile_update_queue` in Dexie).
- Profile audit events recorded via `App\Services\Auth\AuthAuditService` (called directly from profile services; no `ProfileAuditService`).
- Profile blockchain anchoring for password/email/2FA changes (`ProfileBlockchainService`).

**Known limitations:** Email change requires working mail delivery in production (`MAIL_MAILER` not `log`). Users cannot disable 2FA (reconfigure only). No `users.is_active` — disablement uses soft delete.

---

## 4. Scope

### 4.1 In Scope

The module includes:

- Authenticated user's own profile view.
- Update of non-sensitive profile fields:
  - `phone`
  - `address`
  - optionally display-only `name`, depending on project policy.
- Profile picture upload and replacement.
- Change password flow.
- Change email flow.
- 2FA reconfiguration flow without user-controlled disablement.
- Own session management integration.
- Cross-tab profile refresh.
- PWA offline queue for non-sensitive updates only.
- Audit logging for all profile-related actions.
- Blockchain anchoring for sensitive identity changes.
- Backend and frontend tests.
- Documentation update after each milestone.

### 4.2 Out of Scope

The module does not include:

- Public user registration.
- User-controlled permanent 2FA disablement.
- Self-service lost 2FA recovery without admin intervention.
- Social profile integration.
- External OAuth identity providers.
- Admin user CRUD, except where admin recovery behavior must remain compatible.
- Real-time WebSocket streaming for profile changes; lightweight cross-tab/local event sync is sufficient.

---

## 5. Role and Permission Model

| Capability | Admin | Security Operator | Guard | Notes |
|---|:---:|:---:|:---:|---|
| View own profile | Yes | Yes | Yes | Protected by `auth:api` + `active.user` |
| Update own phone/address | Yes | Yes | Yes | Non-sensitive, may support offline queue |
| Upload own profile picture | Yes | Yes | Yes | Online only recommended due file upload validation |
| Change own password | Yes | Yes | Yes | Requires current password + TOTP step-up |
| Change own email | Yes | Yes | Yes | Requires current password + TOTP + new email verification |
| Reconfigure own 2FA | Yes | Yes | Yes | Requires current password + current TOTP before replacing secret |
| Disable own 2FA | No | No | No | Not allowed by design |
| View own sessions | Yes | Yes | Yes | Security Settings tab on `/account/profile?tab=security` |
| Revoke own sessions | Yes | Yes | Yes | Security Settings tab on `/account/profile?tab=security` |
| Reset another user's 2FA | Yes | No | No | Admin recovery only; existing Login M9 policy |
| Update another user's profile | Yes | No | No | Existing Admin User Management, not Profile Module |

---

## 6. Architecture Principles

### 6.1 Backend Source of Truth

Laravel is responsible for:

- Authorization.
- Request validation.
- Step-up verification.
- Password hashing.
- TOTP verification.
- File validation and storage.
- Audit logging.
- Session invalidation.
- Blockchain record creation.
- Conflict detection through `profile_version`.

The frontend is responsible for:

- UX validation.
- Rendering forms.
- Showing progress and errors.
- Managing local optimistic state only for non-sensitive data.
- Queueing allowed offline requests.
- Refetching server truth after changes.

### 6.2 Separate Profile Domain from Admin User Management

The Profile Module must not reuse Admin User Management screens as the user profile page. Admin User Management is for administrative control over other users. Profile Module is for the authenticated user only.

**Correct separation:**

```text
Admin User Management
- Route: /admin/management-user
- Controller: UserController
- Scope: Admin manages users
- Middleware: auth:api + active.user + admin

Profile Module
- Route: /account/profile
- Controller: ProfileController
- Scope: Current user manages own account
- Middleware: auth:api + active.user
```

### 6.3 Sensitive vs Non-Sensitive Changes

| Change Type | Examples | Verification Required | Offline Allowed | Session Invalidation | Blockchain Anchor |
|---|---|---:|---:|---:|---:|
| Non-sensitive profile | Phone, address | JWT only | Yes | No | Optional / No |
| Profile picture | Avatar upload | JWT only | No | No | No |
| Password | New password | Current password + TOTP | No | Yes | Yes |
| Email | New email | Current password + TOTP + new email verification | No | Yes | Yes |
| 2FA reconfiguration | Replace TOTP secret | Current password + current TOTP + new TOTP verify | No | Yes | Yes |
| 2FA disable | Turn off TOTP | Not available | No | N/A | N/A |

### 6.4 Step-Up Verification Policy

For sensitive changes, the backend must verify that the currently logged-in user is still in control of the account.

Required inputs:

- Current password.
- Current TOTP code.
- The requested new value or setup token.

Security rule:

```text
Sensitive change is committed only after successful step-up verification.
After commit, refresh sessions are revoked and stale JWTs are blocked.
User must log in again and complete 2FA again.
```

### 6.5 Mandatory 2FA Policy

The module must enforce:

- Users cannot permanently disable 2FA.
- Users can reconfigure 2FA only after proving control of the current account.
- Admin can reset 2FA only for recovery.
- Any 2FA reset or reconfiguration invalidates sessions.
- Any 2FA recovery must never expose the old TOTP secret.

### 6.6 Tamper-Evident Critical Changes

Sensitive profile changes must produce:

- Sanitized audit log.
- Deterministic canonical hash.
- Blockchain record with `entity_type = user_profile`.
- Asynchronous anchoring via queue.
- Verification support from existing Blockchain Monitoring.

Raw sensitive data must not be stored in blockchain payloads.

### 6.7 Offline-First Without Weakening Security

The PWA may queue non-sensitive profile updates, but must block sensitive flows while offline.

Allowed offline:

- Phone update.
- Address update.

Not allowed offline:

- Email change.
- Password change.
- 2FA reconfiguration.
- Profile picture upload.
- Session revocation.

### 6.8 Efficient and Effective Architecture

The module should remain small and focused:

- One backend controller: `ProfileController`.
- Reuse existing Auth services where possible.
- Reuse existing session APIs for session management.
- One frontend feature folder: `feature/profile` (two-tab Account Settings: Profile Summary + Security Settings).
- Session management UI lives on the **Security Settings** tab (`tab=security`); `/account/security` is a compatibility redirect only.
- Avoid duplicating admin user components unless reusable display components are genuinely shared.

---

## 7. High-Level System Architecture

```text
React PWA
  ↓
Profile Feature
  ├── Profile page
  ├── Edit profile form
  ├── Change password dialog
  ├── Change email dialog
  ├── Reconfigure 2FA dialog
  └── Profile picture uploader
  ↓
Profile Repository
  ↓
Profile Service / api.js
  ↓
Laravel API
  ├── ProfileController
  ├── ProfileService
  ├── ProfileSecurityService
  ├── ProfilePictureService
  ├── ProfileEmailService
  ├── ProfilePasswordService
  ├── ProfileTwoFactorReconfigureService
  ├── ProfileStepUpRateLimiter
  ├── AuthAuditService (App\Services\Auth — profile audit events)
  └── ProfileBlockchainService
  ↓
Database + Storage + Queue
  ├── users
  ├── profile_change_tokens
  ├── auth_audit_logs
  ├── refresh_tokens
  ├── blockchain_records
  └── storage/app/public/profile-pictures
  ↓
Blockchain Worker
  └── AnchorBlockchainRecordJob
```

---

## 8. Backend Architecture

### 8.1 API Endpoints

All routes are protected by:

```php
Route::middleware(['auth:api', 'active.user'])->group(function (): void {
    // profile routes
});
```

Recommended routes:

| Method | Endpoint | Controller Method | Purpose |
|---|---|---|---|
| `GET` | `/api/profile` | `ProfileController@show` | Return current user's profile |
| `PATCH` | `/api/profile` | `ProfileController@update` | Update non-sensitive profile fields |
| `POST` | `/api/profile/picture` | `ProfileController@uploadPicture` | Upload or replace profile picture |
| `DELETE` | `/api/profile/picture` | `ProfileController@deletePicture` | Remove profile picture |
| `POST` | `/api/profile/password/change` | `ProfileController@changePassword` | Change own password with step-up verification |
| `POST` | `/api/profile/email/start` | `ProfileController@startEmailChange` | Start email change verification |
| `POST` | `/api/profile/email/confirm` | `ProfileController@confirmEmailChange` | Confirm new email verification token |
| `POST` | `/api/profile/2fa/reconfigure/start` | `ProfileController@startTwoFactorReconfigure` | Start 2FA replacement flow |
| `POST` | `/api/profile/2fa/reconfigure/verify` | `ProfileController@verifyTwoFactorReconfigure` | Verify new TOTP and replace old secret |
| `GET` | `/api/auth/sessions?scope=mine` | Existing `AuthSessionController` | Own session list; reuse existing API |
| `DELETE` | `/api/auth/sessions/{session}` | Existing `AuthSessionController` | Revoke one session; reuse existing API |
| `POST` | `/api/auth/logout-all` | Existing `AuthController` | Revoke all own sessions; reuse existing API |

### 8.2 Request and Response Envelope

The module should follow the existing API response pattern:

```json
{
  "success": true,
  "message": "Profile updated successfully.",
  "data": {
    "user": {
      "id": "uuid",
      "name": "User Name",
      "email": "user@example.com",
      "phone": "0123456789",
      "address": "Address",
      "profile_picture_url": "https://...",
      "profile_version": 4,
      "two_factor_enabled": true,
      "email_verified_at": "2026-06-29T10:00:00Z",
      "last_password_changed_at": "2026-06-29T10:00:00Z",
      "role": {
        "id": "uuid",
        "name": "Guard"
      }
    }
  }
}
```

Validation errors should use Laravel standard `422` response shape:

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "phone": ["The phone field must not be greater than 30 characters."]
  }
}
```

### 8.3 Backend Data Model

#### `users` Table

The current user table already contains many required fields. Confirm and add only missing fields.

Recommended fields:

| Field | Purpose |
|---|---|
| `id` | UUID primary key |
| `role_id` | Role relationship |
| `name` | Display name |
| `email` | Login identity; unique |
| `email_verified_at` | Email verification status |
| `phone` | Non-sensitive profile contact field |
| `address` | Non-sensitive profile contact field |
| `password` | Hashed password |
| `profile_picture_url` | Public or signed URL/path to image |
| `profile_version` | Optimistic concurrency and PWA conflict detection |
| `setup_required` | First-login setup gate |
| `two_factor_enabled` | Mandatory 2FA status |
| `two_factor_secret` | Encrypted TOTP secret |
| `two_factor_confirmed_at` | Confirmed TOTP setup timestamp |
| `last_password_changed_at` | JWT stale-token invalidation |
| `created_by` | Admin creator, if available |
| `created_at`, `updated_at`, `deleted_at` | Lifecycle fields |

#### `profile_change_tokens` Table

This table stores short-lived one-time tokens for email change and 2FA reconfiguration flows.

```text
profile_change_tokens
├── id UUID primary key
├── user_id UUID foreign key
├── type string
│   ├── email_change
│   └── two_factor_reconfigure
├── token_hash string
├── pending_payload encrypted/json nullable
├── expires_at timestamp
├── used_at timestamp nullable
├── ip_address string nullable
├── user_agent text nullable
├── created_at timestamp
└── updated_at timestamp
```

Rules:

- Store only hashed tokens.
- Expiry should be short, ideally 5–10 minutes.
- Tokens are single-use.
- Tokens must be invalidated after use.
- Tokens must not contain raw passwords or TOTP secrets.
- `pending_payload` may contain encrypted pending email or temporary TOTP secret setup metadata.

#### `auth_audit_logs` Table

Reuse existing auth audit log infrastructure. Add profile event constants rather than creating a separate audit table.

Recommended new events:

| Event | Status | Metadata |
|---|---|---|
| `profile_viewed` | `success` | Optional; can be omitted to reduce noise |
| `profile_updated` | `success` | `changed_fields`, `profile_version` |
| `profile_update_failed` | `failed` | `reason`, sanitized validation context |
| `profile_picture_uploaded` | `success` | `file_size`, `mime_type`, `profile_version` |
| `profile_picture_removed` | `success` | `profile_version` |
| `email_change_started` | `success` | `target_email_hash`, `profile_version` |
| `email_changed` | `success` | `old_email_hash`, `new_email_hash`, `revoked_count` |
| `email_change_failed` | `failed` | `reason` |
| `password_changed` | `success` | Reuse existing event; add `source = self_profile` |
| `password_change_failed` | `failed` | `reason` |
| `two_factor_reconfigure_started` | `success` | `profile_version` |
| `two_factor_reconfigured` | `success` | `revoked_count` |
| `two_factor_reconfigure_failed` | `failed` | `reason` |

Never store:

- Raw password.
- Raw OTP.
- TOTP secret.
- Verification token.
- Refresh token.
- Authorization header.
- Full email address in critical audit metadata if avoidable; store masked email or hash.

#### `blockchain_records` Table

Reuse the central blockchain table.

Recommended profile proof values:

```text
entity_type = user_profile
entity_id = <user_id>
proof_type = profile_email_changed
proof_type = profile_password_changed
proof_type = profile_2fa_reconfigured
```

Payload summary must be safe:

```json
{
  "module": "profile",
  "action": "profile_email_changed",
  "user_id": "uuid",
  "profile_version": 7,
  "changed_at": "2026-06-29T10:00:00Z"
}
```

Do not include:

- New password.
- Old password.
- OTP.
- TOTP secret.
- Full email address.
- Verification token.

### 8.4 Backend Services

#### `ProfileService`

Main domain service for non-sensitive profile updates.

Responsibilities:

- Load current user profile.
- Update allowed non-sensitive fields.
- Increment `profile_version`.
- Enforce optimistic concurrency when `profile_version` is supplied.
- Dispatch profile update events or internal notifications.
- Record audit events via `App\Services\Auth\AuthAuditService`.

#### `ProfileSecurityService`

Security service for sensitive changes.

Responsibilities:

- Verify current password.
- Verify TOTP code using existing `TwoFactorService`.
- Issue and validate profile change tokens.
- Enforce token expiry and single-use rules.
- Coordinate session invalidation.
- Return clear but non-revealing errors.

#### `ProfilePictureService`

File handling service.

Responsibilities:

- Validate MIME type.
- Enforce file size limit.
- Generate safe file names.
- Strip EXIF metadata where library support exists.
- Resize/compress images where feasible.
- Delete old profile pictures safely.
- Store path/URL in user record.

#### `ProfileEmailService`

Email change flow orchestration (start + confirm).

Responsibilities:

- Issue email-change tokens after step-up verification.
- Send confirmation to the new address.
- Confirm token, update email, revoke sessions, and record audit/blockchain events.

#### `ProfilePasswordService`

Password change flow orchestration.

Responsibilities:

- Verify step-up credentials.
- Update password hash and stale-token timestamps.
- Revoke refresh sessions and record audit/blockchain events.

#### `ProfileTwoFactorReconfigureService`

2FA replacement flow orchestration (no user-controlled disable).

Responsibilities:

- Verify current password and TOTP.
- Issue replacement secret and confirm new TOTP.
- Revoke sessions and record audit/blockchain events.

#### `ProfileStepUpRateLimiter`

Rate limiting for profile step-up actions (password, email, 2FA).

#### Profile audit logging (`AuthAuditService`)

Profile services record audit events **directly** through `App\Services\Auth\AuthAuditService`. There is no `App\Services\Profile\ProfileAuditService`.

Responsibilities (via `AuthAuditService`):

- Record profile-related events.
- Sanitize metadata.
- Capture IP and user-agent.
- Avoid secret leakage.

#### `ProfileBlockchainService`

Profile-specific integration wrapper over `BlockchainRecordService`.

Responsibilities:

- Build safe canonical payloads for critical identity changes.
- Create blockchain records asynchronously.
- Use central `blockchain_records` table.
- Avoid blocking the user-facing API if anchoring is queued.

### 8.5 Backend Folder Structure

Recommended efficient backend structure:

```text
backend/
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   └── Api/
│   │   │       └── ProfileController.php
│   │   ├── Requests/
│   │   │   └── Profile/
│   │   │       ├── UpdateProfileRequest.php
│   │   │       ├── UploadProfilePictureRequest.php
│   │   │       ├── ChangePasswordRequest.php
│   │   │       ├── StartEmailChangeRequest.php
│   │   │       ├── ConfirmEmailChangeRequest.php
│   │   │       ├── StartTwoFactorReconfigureRequest.php
│   │   │       └── VerifyTwoFactorReconfigureRequest.php
│   │   └── Resources/
│   │       └── ProfileResource.php
│   ├── Models/
│   │   └── ProfileChangeToken.php
│   ├── Services/
│   │   ├── Auth/
│   │   │   └── AuthAuditService.php
│   │   └── Profile/
│   │       ├── ProfileService.php
│   │       ├── ProfileSecurityService.php
│   │       ├── ProfilePictureService.php
│   │       ├── ProfileEmailService.php
│   │       ├── ProfilePasswordService.php
│   │       ├── ProfileTwoFactorReconfigureService.php
│   │       ├── ProfileStepUpRateLimiter.php
│   │       └── ProfileBlockchainService.php
│   └── Support/
│       └── ProfileChangeType.php
├── config/
│   └── profile.php
├── database/
│   ├── factories/
│   │   └── ProfileChangeTokenFactory.php
│   └── migrations/
│       ├── yyyy_mm_dd_hhmmss_add_profile_module_fields_to_users_table.php
│       └── yyyy_mm_dd_hhmmss_create_profile_change_tokens_table.php
├── routes/
│   └── api.php
└── tests/
    ├── Feature/
    │   └── Profile/
    │       ├── ProfileReadUpdateTest.php
    │       ├── ProfilePictureTest.php
    │       ├── ProfilePasswordChangeTest.php
    │       ├── ProfileEmailChangeTest.php
    │       ├── ProfileTwoFactorReconfigureTest.php
    │       ├── ProfileOfflineConflictTest.php
    │       └── ProfileBlockchainIntegrationTest.php
    └── Unit/
        └── Profile/
            ├── ProfileServiceTest.php
            ├── ProfileSecurityServiceTest.php
            ├── ProfilePictureServiceTest.php
            └── ProfileBlockchainServiceTest.php
```

### 8.6 Backend Configuration

Add `config/profile.php`:

```php
return [
    'profile_picture' => [
        'disk' => env('PROFILE_PICTURE_DISK', 'public'),
        'directory' => env('PROFILE_PICTURE_DIRECTORY', 'profile-pictures'),
        'max_size_kb' => env('PROFILE_PICTURE_MAX_SIZE_KB', 2048),
        'allowed_mimes' => ['jpg', 'jpeg', 'png', 'webp'],
    ],

    'change_tokens' => [
        'ttl_minutes' => env('PROFILE_CHANGE_TOKEN_TTL_MINUTES', 10),
    ],

    'security' => [
        'sensitive_change_revoke_all_sessions' => true,
        'require_totp_for_sensitive_changes' => true,
        'allow_user_disable_2fa' => false,
    ],
];
```

---

## 9. Frontend Architecture

### 9.1 Frontend Routing

Recommended protected route:

```text
/account/profile
```

Existing route (compatibility redirect after M6):

```text
/account/security  →  /account/profile?tab=security
```

Profile menu behavior (M6+):

- **Account Settings** → `/account/profile` (or `?tab=profile`)
- **Security Settings** → `/account/profile?tab=security`
- **Logout** → existing logout handler

All initialized roles can access both account routes.

### 9.2 Frontend Feature Structure

Recommended efficient frontend structure:

```text
frontend/
└── src/
    └── feature/
        └── profile/
            ├── components/
            │   ├── ProfileSummaryCard.jsx
            │   ├── ProfileContactForm.jsx
            │   ├── ProfilePictureUploader.jsx
            │   ├── ChangePasswordDialog.jsx
            │   ├── ChangeEmailDialog.jsx
            │   ├── TwoFactorReconfigureDialog.jsx
            │   ├── SensitiveActionStepper.jsx
            │   ├── ProfileVersionAlert.jsx
            │   └── ProfileSectionCard.jsx
            ├── controllers/
            │   ├── useProfileController.js
            │   ├── useProfilePictureController.js
            │   ├── useChangePasswordController.js
            │   ├── useChangeEmailController.js
            │   └── useTwoFactorReconfigureController.js
            ├── datasources/
            │   ├── profileService.js
            │   └── profileService.test.js
            ├── repositories/
            │   ├── ProfileRepository.js
            │   └── ProfileRepository.test.js
            ├── utils/
            │   ├── profileValidation.js
            │   ├── profileFormatters.js
            │   └── profileSyncEvents.js
            ├── offline/
            │   ├── profileOfflineQueue.js
            │   └── profileOfflineQueue.test.js
            └── views/
                ├── ProfilePage.jsx
                └── ProfilePage.test.jsx
```

### 9.3 Frontend Layer Responsibilities

#### View Layer

- Renders the page layout.
- Composes profile cards and dialogs.
- Does not call API services directly.
- Shows loading, error, success, and conflict states.

#### Controller Hooks

- Own local state.
- Call repository methods.
- Handle form submit.
- Handle success/error UI state.
- Trigger `profile_updated` event.
- Navigate or sign out after sensitive changes when required.

#### Repository

- Normalizes backend responses.
- Builds query/payload shapes.
- Converts API errors into user-friendly errors.
- Keeps view/controller code clean.

#### Datasource Service

- Only calls `api.js`.
- Uses relative API endpoints.
- Does not duplicate auth headers, refresh logic, or fetch implementation.

#### Offline Queue

- Queues only allowed non-sensitive fields.
- Uses `profile_version` to prevent stale overwrite.
- Flushes through shared `api.js` when online.
- Does not queue password/email/2FA requests.

### 9.4 Frontend API Service Methods

`profileService.js` should expose:

```js
const profileService = {
  getProfile: () => api.get('/profile'),
  updateProfile: (payload) => api.patch('/profile', payload),
  uploadProfilePicture: (formData) => api.post('/profile/picture', formData),
  deleteProfilePicture: () => api.delete('/profile/picture'),
  changePassword: (payload) => api.post('/profile/password/change', payload),
  startEmailChange: (payload) => api.post('/profile/email/start', payload),
  confirmEmailChange: (payload) => api.post('/profile/email/confirm', payload),
  startTwoFactorReconfigure: (payload) => api.post('/profile/2fa/reconfigure/start', payload),
  verifyTwoFactorReconfigure: (payload) => api.post('/profile/2fa/reconfigure/verify', payload)
};
```

### 9.5 UI Layout

Recommended page layout:

```text
Account Settings (/account/profile)
├── Profile Summary
│   ├── Avatar
│   ├── Name
│   ├── Role
│   ├── Email verification status
│   └── 2FA status
├── Personal Information
│   ├── Phone
│   ├── Address
│   └── Save button
├── Profile Picture
│   ├── Upload
│   ├── Preview
│   └── Remove button
├── Security Actions
│   ├── Change Password
│   ├── Change Email
│   ├── Reconfigure 2FA
│   └── Link to Security Settings
└── System Information
    ├── Profile version
    ├── Last password change
    ├── Last update
    └── Session warning after sensitive changes
```

### 9.6 Frontend UX Rules

- Sensitive action dialogs must clearly state that the user will need to log in again after success.
- 2FA reconfiguration must not show a disable switch.
- Offline mode must disable sensitive action buttons.
- Offline queued phone/address update must show pending state.
- On `409 profile_version_conflict`, refetch `/profile` and ask user to review changes.
- On sensitive change success, clear local auth session and redirect to `/login` if the backend revokes the current session.
- Profile updates must update `auth_user` in storage so the header profile data stays current.
- Broadcast `profile_updated` across tabs using `BroadcastChannel` where supported, with localStorage event fallback.

---

## 10. Core Flows

### 10.1 View Own Profile

```text
User opens /account/profile
    ↓
ProfilePage mounts
    ↓
useProfileController loads repository.getProfile()
    ↓
GET /api/profile
    ↓
Laravel returns ProfileResource
    ↓
Frontend renders profile and stores latest profile_version
```

Passing behavior:

- Works for Admin, Security Operator, and Guard.
- Blocks unauthenticated users.
- Blocks users failing `active.user` checks.
- Does not expose secrets.

### 10.2 Update Non-Sensitive Profile Fields

Fields:

- `phone`
- `address`

Recommended payload:

```json
{
  "phone": "0123456789",
  "address": "Kuala Lumpur",
  "profile_version": 4
}
```

Flow:

```text
User edits phone/address
    ↓
Frontend validates basic format
    ↓
PATCH /api/profile
    ↓
Backend validates allowed fields only
    ↓
Backend checks profile_version if provided
    ↓
Backend updates user and increments profile_version
    ↓
Backend logs profile_updated
    ↓
Frontend updates UI, auth_user, and other tabs
```

Conflict rule:

- If submitted `profile_version` does not match current value, return `409 Conflict`.
- Frontend refetches `/profile` and asks the user to review.

### 10.3 Upload Profile Picture

Flow:

```text
User selects image
    ↓
Frontend validates size/type for UX
    ↓
POST /api/profile/picture (multipart/form-data)
    ↓
Backend validates MIME and size
    ↓
Backend strips metadata if supported
    ↓
Backend stores file and deletes old picture if safe
    ↓
Backend updates user.profile_picture_url and increments profile_version
    ↓
Backend logs profile_picture_uploaded
    ↓
Frontend updates avatar and profile summary
```

Security rules:

- Do not trust frontend file extension.
- Validate MIME server-side.
- Enforce size limit.
- Use generated names.
- Avoid user-controlled paths.
- Do not store absolute local filesystem paths in the API response.

### 10.4 Change Password

Recommended payload:

```json
{
  "current_password": "old-password",
  "otp": "123456",
  "password": "new-password",
  "password_confirmation": "new-password"
}
```

Flow:

```text
User opens Change Password dialog
    ↓
User enters current password + TOTP + new password
    ↓
POST /api/profile/password/change
    ↓
Backend verifies current password
    ↓
Backend verifies current TOTP
    ↓
Backend validates password rules and password confirmation
    ↓
Backend hashes new password
    ↓
Backend sets last_password_changed_at
    ↓
Backend increments profile_version
    ↓
Backend revokes refresh sessions
    ↓
Backend logs password_changed
    ↓
Backend creates blockchain record
    ↓
Frontend clears local session and redirects to /login
    ↓
User logs in again with new password and TOTP
```

Important policy:

- The current session should not be preserved unless the project explicitly chooses to preserve it. For a high-security surveillance platform, the recommended policy is **revoke all sessions including current**.

### 10.5 Change Email

Recommended architecture: two-phase flow.

#### Phase A — Start Email Change

Payload:

```json
{
  "current_password": "current-password",
  "otp": "123456",
  "new_email": "new.email@example.com"
}
```

Flow:

```text
User enters new email + current password + TOTP
    ↓
POST /api/profile/email/start
    ↓
Backend validates current password and TOTP
    ↓
Backend validates new email uniqueness
    ↓
Backend stores hashed confirmation token with encrypted pending email
    ↓
Backend sends verification link/code to new email
    ↓
Backend logs email_change_started
```

#### Phase B — Confirm Email Change

Payload example for code-based flow:

```json
{
  "token": "plain-token-from-email"
}
```

Flow:

```text
User confirms link/code from new email
    ↓
POST /api/profile/email/confirm
    ↓
Backend validates token hash and expiry
    ↓
Backend updates email and email_verified_at
    ↓
Backend increments profile_version
    ↓
Backend revokes refresh sessions
    ↓
Backend logs email_changed
    ↓
Backend creates blockchain record
    ↓
Frontend redirects to /login
    ↓
User logs in with new email and TOTP
```

Security note:

- For a simpler FYP implementation, sending verification only to the new email is acceptable if current password + TOTP are already required before token issuance. If email sending is not configured, use a development mail log or Mailtrap-style local testing, but keep the production architecture correct.

### 10.6 Reconfigure 2FA Without Disablement

Users must not be able to disable 2FA. They may replace their authenticator setup only after proving control of the current account.

#### Phase A — Start Reconfiguration

Payload:

```json
{
  "current_password": "current-password",
  "otp": "123456"
}
```

Flow:

```text
User opens Reconfigure 2FA
    ↓
User enters current password + current TOTP
    ↓
POST /api/profile/2fa/reconfigure/start
    ↓
Backend verifies password and current TOTP
    ↓
Backend creates temporary new TOTP secret
    ↓
Backend returns QR URI/manual key through short-lived session token
```

#### Phase B — Verify New TOTP

Payload:

```json
{
  "two_factor_reconfigure_token": "short-lived-token",
  "otp": "654321"
}
```

Flow:

```text
User scans new QR code
    ↓
User enters OTP generated by new authenticator setup
    ↓
POST /api/profile/2fa/reconfigure/verify
    ↓
Backend validates new OTP against temporary secret
    ↓
Backend replaces encrypted TOTP secret
    ↓
Backend keeps two_factor_enabled = true
    ↓
Backend increments profile_version
    ↓
Backend revokes sessions
    ↓
Backend logs two_factor_reconfigured
    ↓
Backend creates blockchain record
    ↓
Frontend redirects to /login
```

Strict rules:

- Do not include a “Turn off 2FA” switch.
- Do not return old secret.
- Do not store temporary secret unencrypted.
- Expire the reconfiguration session quickly.
- Invalidate all sessions after successful reconfiguration.

### 10.7 Own Session Management

The Profile Module embeds session management on the **Security Settings** tab (`/account/profile?tab=security`) instead of a separate page. `/account/security` redirects for compatibility.

```text
/account/profile?tab=security → Security Actions + session panel
    ↓
GET /api/auth/sessions?scope=mine
```

This keeps the module efficient and avoids duplicate session tables.

### 10.8 Offline Non-Sensitive Update Flow

```text
User offline
    ↓
User edits phone/address
    ↓
Frontend stores queue item in IndexedDB
    ↓
UI shows Pending sync
    ↓
Device online
    ↓
profileOfflineQueue flushes through api.js
    ↓
PATCH /api/profile with profile_version
    ↓
Backend accepts or returns 409 conflict
    ↓
Frontend updates profile or prompts conflict resolution
```

Queue item example:

```json
{
  "id": "uuid",
  "type": "profile_update",
  "payload": {
    "phone": "0123456789",
    "address": "Kuala Lumpur",
    "profile_version": 4
  },
  "createdAt": 1710000000000,
  "retryCount": 0,
  "status": "pending"
}
```

Sensitive actions must be disabled while offline.

---

## 11. Security Controls

### 11.1 Password Security

- Use Laravel hashing (`Hash::make`) with configured bcrypt/argon driver.
- Enforce minimum length from `auth_security.password.min_length` or project config.
- Require confirmation.
- Prevent reuse if password history is later implemented.
- Never return password fields in resources.

### 11.2 TOTP Protection

- Verify TOTP server-side only.
- Apply attempt limits to sensitive-change OTP verification.
- Reject reused OTP codes where existing TOTP service supports it.
- Use the same 30-second TOTP standard as Login Module.

### 11.3 Rate Limiting

Add route-level or service-level rate limits for:

- Password change attempts.
- Email change attempts.
- 2FA reconfiguration attempts.
- Profile picture upload attempts.

Recommended limits:

| Flow | Limit |
|---|---|
| Change password | 5 attempts per 15 minutes per user/IP |
| Start email change | 5 attempts per 15 minutes per user/IP |
| Confirm email change | 5 attempts per token/user |
| Start 2FA reconfigure | 5 attempts per 15 minutes per user/IP |
| Verify 2FA reconfigure | 5 attempts per token |
| Upload profile picture | 10 uploads per hour per user |

### 11.4 Session Invalidation

Sensitive changes must revoke refresh sessions and block stale JWTs:

- Password change: update `last_password_changed_at`.
- Email change: update `last_identity_changed_at` or reuse `last_password_changed_at` only if middleware semantics are acceptable.
- 2FA reconfiguration: update `last_security_changed_at` or force refresh-token revocation and clear current session.

Recommended schema improvement:

```text
users.last_security_changed_at nullable timestamp
```

Then `EnsureUserIsActive` can reject JWTs issued before `last_security_changed_at` for password, email, and 2FA-sensitive changes.

If adding a new column is too much, update `last_password_changed_at` for all sensitive identity changes, but document that the field is being used as a general stale-token gate.

### 11.5 Audit Sanitization

Audit metadata must use safe values:

```json
{
  "changed_fields": ["phone", "address"],
  "profile_version": 5,
  "source": "self_profile"
}
```

For email changes:

```json
{
  "old_email_hash": "sha256:...",
  "new_email_hash": "sha256:...",
  "revoked_count": 3,
  "source": "self_profile"
}
```

Do not store raw email if not necessary. Masked email is acceptable for admin monitoring UI:

```text
lu***@example.com
```

### 11.6 File Upload Protection

- Allow only `jpg`, `jpeg`, `png`, `webp`.
- Enforce max size, recommended 2 MB.
- Store outside public path then expose through storage symlink or signed URL.
- Do not preserve original file name.
- Delete replaced images safely.
- Do not serve executable content.

---

## 12. Blockchain Integration

### 12.1 Purpose

Blockchain anchoring is used to make critical identity changes tamper-evident. It does not store raw user data and does not replace the database.

### 12.2 What to Anchor

Anchor these events:

- `profile_email_changed`
- `profile_password_changed`
- `profile_2fa_reconfigured`
- Optional: `profile_2fa_admin_reset` if not already covered by Login Module security logging

Do not anchor routine phone/address changes unless required for demonstration. Anchoring every small update may create unnecessary queue noise.

### 12.3 Canonical Payload

Recommended safe canonical payload:

```json
{
  "entity_type": "user_profile",
  "entity_id": "user-uuid",
  "proof_type": "profile_email_changed",
  "profile_version": 8,
  "changed_at": "2026-06-29T10:00:00Z",
  "actor_user_id": "user-uuid",
  "source": "self_profile"
}
```

### 12.4 Blockchain Flow

```text
Sensitive profile change committed in DB transaction
    ↓
Audit event written
    ↓
ProfileBlockchainService creates blockchain_records row
    ↓
AnchorBlockchainRecordJob queued
    ↓
Blockchain worker submits hash to Ganache or Sepolia
    ↓
Blockchain Monitoring shows status
```

### 12.5 Passing Rules

- User-facing profile action must not wait for blockchain confirmation.
- Blockchain record creation failure should be logged and surfaced to monitoring, not expose secrets.
- Failed blockchain anchoring can retry through the existing retry mechanism.
- The blockchain dashboard must label `user_profile` records clearly.

---

## 13. PWA and State Consistency

### 13.1 Cross-Tab Sync

Use `BroadcastChannel` when available:

```js
const channel = new BroadcastChannel('profile');
channel.postMessage({ type: 'profile_updated', profileVersion: 5 });
```

Fallback:

```js
localStorage.setItem('profile_updated_at', String(Date.now()));
```

On receiving profile update:

- Refetch `/profile`.
- Update `auth_user`.
- Re-render profile menu.

### 13.2 Profile Version

Every successful profile mutation increments `profile_version`.

Frontend uses it for:

- Conflict detection.
- Offline queue replay.
- Cross-tab stale-state checks.
- Refetch decisions.

Backend uses it for:

- Optimistic concurrency.
- Audit trace.
- Blockchain payload summaries.

### 13.3 Offline Queue Policy

Allowed queue types:

```text
profile_update_contact
```

Blocked queue types:

```text
profile_change_email
profile_change_password
profile_2fa_reconfigure
profile_picture_upload
session_revoke
```

### 13.4 Conflict Resolution

If backend returns `409 Conflict`:

1. Frontend refetches `/profile`.
2. UI shows both local pending values and server values.
3. User chooses whether to reapply changes.
4. Reapply sends new request using latest `profile_version`.

---

## 14. Detailed Milestone Plan

> Historical milestone snapshot (2026-06-29).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`backend/documentation.md`](../backend/documentation.md), [`frontend/documentation.md`](../frontend/documentation.md), and [`docs/system-update/m6-account-settings-two-tab-redesign.md`](system-update/m6-account-settings-two-tab-redesign.md).

This plan implements the module **architecture by architecture**. Each milestone contains submilestones and passing criteria.

---

## M0 — Profile Module Audit and Architecture Freeze

**Goal:** Confirm the current codebase baseline and freeze the Profile Module architecture before coding.

### M0.1 — Inspect Existing Auth, User, Session, Audit, and Blockchain Foundations

**Tasks:**

- Review existing `AuthController`, `UserController`, `AuthSessionController`, and auth services.
- Confirm current `users` fields: `phone`, `address`, `profile_picture_url`, `profile_version`, `two_factor_enabled`, `two_factor_secret`, `last_password_changed_at`.
- Confirm current session revocation APIs.
- Confirm current audit event service.
- Confirm blockchain service supports `user_profile` or can be extended cleanly.

**Passing Criteria:**

- A short internal note lists all reusable components.
- No duplicate session or audit architecture is planned.
- Any missing database fields are identified.

### M0.2 — Freeze Security Decisions

**Tasks:**

- Document that users cannot disable 2FA.
- Document that password/email/2FA changes require password + TOTP step-up.
- Document that sensitive changes revoke sessions and force re-login.
- Document offline rules.

**Passing Criteria:**

- Security decisions are present in `profile-module.md`.
- No planned UI includes a “Disable 2FA” user action.
- Sensitive flows explicitly require online mode.

### M0.3 — Define Acceptance Matrix

**Tasks:**

- Create acceptance checklist for backend, frontend, PWA, audit, and blockchain.
- Define expected HTTP statuses for unauthorized, validation, conflict, and success cases.

**Passing Criteria:**

- Every future milestone has clear passing criteria.
- The module can be implemented without re-asking architecture questions.

---

## M1 — Backend Data Foundation

**Goal:** Prepare database and model support for profile-specific workflows.

### M1.1 — Confirm and Add User Profile Fields

**Tasks:**

- Confirm `profile_version` exists and defaults to `1` or `0`.
- Confirm `profile_picture_url` exists.
- Add `last_security_changed_at` if choosing a dedicated stale-token gate.
- Ensure user model casts are correct.

**Passing Criteria:**

- Migration runs successfully.
- `User` model casts include `profile_version`, `email_verified_at`, and security timestamps.
- Existing user management tests still pass.

### M1.2 — Create `profile_change_tokens` Table

**Tasks:**

- Create migration.
- Create model `ProfileChangeToken`.
- Add factory.
- Store token hash only.
- Store encrypted JSON `pending_payload` if needed.

**Passing Criteria:**

- Token records can be created and expired.
- Plain tokens are never persisted.
- Model factory works for tests.

### M1.3 — Add `config/profile.php`

**Tasks:**

- Add profile picture settings.
- Add token TTL settings.
- Add security flags.

**Passing Criteria:**

- Config values are readable in tests.
- `.env.example` includes optional profile settings if required.

---

## M2 — Backend Profile Read and Non-Sensitive Update API

**Goal:** Implement the base self-service profile API.

### M2.1 — Create `ProfileResource`

**Tasks:**

- Return safe user profile fields.
- Include role summary.
- Include `profile_version`.
- Include `two_factor_enabled` but never secret fields.

**Passing Criteria:**

- Response does not expose `password`, `two_factor_secret`, token fields, or deleted metadata.
- Resource output matches frontend needs.

### M2.2 — Create `ProfileController@show`

**Tasks:**

- Add `GET /api/profile`.
- Return current authenticated user.
- Use `auth:api` + `active.user`.

**Passing Criteria:**

- Admin, Operator, and Guard can retrieve their own profile.
- Unauthenticated request returns `401`.
- Setup-incomplete or 2FA-incomplete user is blocked by middleware.

### M2.3 — Create `UpdateProfileRequest`

**Tasks:**

- Allow only non-sensitive fields.
- Prohibit `email`, `password`, `role_id`, `two_factor_enabled`, `two_factor_secret`, and security timestamps.
- Validate `profile_version` if present.

**Passing Criteria:**

- Attempt to update prohibited fields returns validation error.
- Valid phone/address update passes.
- Invalid payload returns `422`.

### M2.4 — Create `ProfileService@updateProfile`

**Tasks:**

- Update allowed fields.
- Increment `profile_version`.
- Detect version conflict.
- Write audit log.

**Passing Criteria:**

- Valid update returns new `profile_version`.
- Stale `profile_version` returns `409`.
- Audit log is created with sanitized metadata.

---

## M3 — Backend Profile Picture Upload

**Goal:** Implement secure profile picture upload and deletion.

### M3.1 — Create `UploadProfilePictureRequest`

**Tasks:**

- Validate file is image.
- Enforce MIME whitelist.
- Enforce max file size.

**Passing Criteria:**

- Valid image is accepted.
- Invalid MIME or oversized file returns `422`.
- File extension alone is not trusted.

### M3.2 — Create `ProfilePictureService`

**Tasks:**

- Store image using configured disk and directory.
- Generate safe file names.
- Delete old file when replaced.
- Update `profile_picture_url`.
- Increment `profile_version`.

**Passing Criteria:**

- Upload returns updated profile resource.
- Old image is removed or safely orphan-handled.
- No absolute local filesystem path is returned.

### M3.3 — Create Delete Picture Endpoint

**Tasks:**

- Add `DELETE /api/profile/picture`.
- Remove current picture.
- Update profile version and audit.

**Passing Criteria:**

- Profile picture can be removed.
- Deleting when no picture exists is idempotent or returns a safe success response.
- Audit log is created.

---

## M4 — Backend Step-Up Verification Foundation

**Goal:** Build reusable security verification for sensitive profile changes.

### M4.1 — Implement `ProfileSecurityService::verifyStepUp`

**Tasks:**

- Verify current password using Laravel Hash.
- Verify TOTP through existing `TwoFactorService`.
- Return controlled errors.
- Apply rate limiting or attempt tracking.

**Passing Criteria:**

- Wrong password fails.
- Wrong OTP fails.
- Correct password + OTP succeeds.
- No response reveals which factor was wrong beyond safe messaging.

### M4.2 — Implement Profile Change Token Helpers

**Tasks:**

- Generate plain token once.
- Store hashed token.
- Set expiry.
- Validate and mark used.

**Passing Criteria:**

- Expired token fails.
- Used token fails.
- Token hash is stored, not plain token.
- Unit tests cover token lifecycle.

### M4.3 — Implement Sensitive-Change Session Revocation Helper

**Tasks:**

- Reuse `RefreshTokenService::revokeAllForUser()`.
- Update `last_security_changed_at` or chosen stale-token timestamp.
- Return revoked count for audit.

**Passing Criteria:**

- Old refresh cookie fails after sensitive change.
- Old JWT is rejected by protected route after sensitive change.
- Audit metadata includes revoked count.

---

## M5 — Backend Change Password Flow

**Goal:** Implement self-service password change with current password + TOTP step-up.

### M5.1 — Create `ChangePasswordRequest`

**Tasks:**

- Validate `current_password` required.
- Validate `otp` required.
- Validate new `password` and confirmation.
- Enforce password length and complexity.

**Passing Criteria:**

- Missing fields return `422`.
- Weak password returns `422`.
- Valid payload reaches service.

### M5.2 — Implement `ProfileController@changePassword`

**Tasks:**

- Verify step-up.
- Hash new password.
- Set `last_password_changed_at`.
- Increment `profile_version`.
- Revoke sessions.
- Write audit log.
- Create blockchain record.

**Passing Criteria:**

- Password changes successfully with correct current password + OTP.
- User must log in with new password after change.
- Old password no longer works.
- Old refresh token and old JWT fail.
- Audit log exists.
- Blockchain record exists with `entity_type = user_profile` and `proof_type = profile_password_changed`.

---

## M6 — Backend Change Email Flow

**Goal:** Implement secure two-phase email change.

### M6.1 — Create `StartEmailChangeRequest`

**Tasks:**

- Validate `new_email` required, email, unique.
- Validate `current_password` required.
- Validate `otp` required.

**Passing Criteria:**

- Existing email is rejected.
- Invalid email is rejected.
- Correct step-up creates a pending email-change token.

### M6.2 — Implement `startEmailChange`

**Tasks:**

- Verify current password and TOTP.
- Store pending new email in encrypted token payload.
- Send verification link or return dev-safe verification notice.
- Log `email_change_started`.

**Passing Criteria:**

- Token is short-lived.
- Plain token is not stored.
- Pending email is not committed yet.
- Audit log exists.

### M6.3 — Create `ConfirmEmailChangeRequest`

**Tasks:**

- Validate token input.
- Validate token not expired and not used.

**Passing Criteria:**

- Expired token fails.
- Used token fails.
- Invalid token fails safely.

### M6.4 — Implement `confirmEmailChange`

**Tasks:**

- Load pending email from token.
- Recheck uniqueness.
- Update user email.
- Set `email_verified_at`.
- Increment `profile_version`.
- Revoke sessions.
- Log `email_changed`.
- Create blockchain record.

**Passing Criteria:**

- Email changes only after confirmation.
- User must log in again with new email and TOTP.
- Old email no longer logs in.
- Blockchain record exists with `proof_type = profile_email_changed`.
- Audit does not expose token or full secret values.

---

## M7 — Backend 2FA Reconfiguration Without Disablement

**Goal:** Allow users to replace their authenticator setup while preserving mandatory 2FA.

### M7.1 — Create `StartTwoFactorReconfigureRequest`

**Tasks:**

- Validate current password.
- Validate current OTP.
- Ensure current user has 2FA enabled.

**Passing Criteria:**

- User without valid current OTP cannot start reconfiguration.
- No endpoint disables 2FA.

### M7.2 — Implement `startTwoFactorReconfigure`

**Tasks:**

- Verify step-up.
- Generate temporary new TOTP secret.
- Store temporary secret encrypted in token payload.
- Return QR URI and manual key.

**Passing Criteria:**

- Old 2FA remains active until new TOTP is verified.
- Temporary secret expires.
- Temporary secret is not stored in plaintext.

### M7.3 — Create `VerifyTwoFactorReconfigureRequest`

**Tasks:**

- Validate reconfiguration token.
- Validate new OTP.

**Passing Criteria:**

- Invalid new OTP fails.
- Expired token fails.
- Used token fails.

### M7.4 — Implement `verifyTwoFactorReconfigure`

**Tasks:**

- Verify new OTP against temporary secret.
- Replace encrypted TOTP secret.
- Keep `two_factor_enabled = true`.
- Update `two_factor_confirmed_at`.
- Increment `profile_version`.
- Revoke sessions.
- Log `two_factor_reconfigured`.
- Create blockchain record.

**Passing Criteria:**

- User can log in with new authenticator after reconfiguration.
- Old authenticator OTP no longer works.
- Sessions are revoked.
- No user-disable endpoint exists.
- Blockchain record exists with `proof_type = profile_2fa_reconfigured`.

---

## M8 — Frontend Profile Foundation

**Goal:** Build the Profile feature skeleton using current React project conventions.

### M8.1 — Create `feature/profile` Folder

**Tasks:**

- Add views, components, controllers, repositories, datasources, utils.
- Add `profileService.js` using shared `api.js`.
- Add `ProfileRepository.js` response normalization.

**Passing Criteria:**

- Folder follows current feature architecture.
- No direct `fetch` calls outside `api.js`.
- Tests can mock repository/service layers.

### M8.2 — Add Route `/account/profile`

**Tasks:**

- Register route under protected `MainRoutes`.
- Allow all initialized roles.
- Add page title/breadcrumb if applicable.

**Passing Criteria:**

- Admin, Operator, and Guard can open page.
- Guest is redirected to login.
- Unauthorized role logic does not block initialized users.

### M8.3 — Wire Profile Menu Account Settings

**Tasks:**

- Update `ProfileSection/index.jsx`.
- Make Account Settings navigate to `/account/profile`.
- Security Settings navigates to `/account/profile?tab=security` (`/account/security` redirects for compatibility).

**Passing Criteria:**

- Clicking Account Settings opens Profile page.
- Clicking Security Settings opens the Security Settings tab on Account Settings (`/account/profile?tab=security`).
- Logout behavior remains unchanged.

---

## M9 — Frontend Profile View and Non-Sensitive Update

**Goal:** Implement profile display and phone/address update.

### M9.1 — Build Profile Summary UI

**Tasks:**

- Render avatar, name, role, email, 2FA status, email verification status.
- Render last password/security update if available.

**Passing Criteria:**

- Page loads from `GET /profile`.
- Loading and error states are visible.
- No secrets are shown.

### M9.2 — Build Contact Update Form

**Tasks:**

- Create form for phone/address.
- Include `profile_version` in request.
- Update `auth_user` after success.

**Passing Criteria:**

- Valid update saves and updates UI.
- Invalid update shows backend validation messages.
- Stale version conflict triggers refetch and conflict alert.

### M9.3 — Cross-Tab Profile Sync

**Tasks:**

- Implement `profileSyncEvents.js`.
- Use BroadcastChannel with localStorage fallback.
- Refetch profile in other tabs after update.

**Passing Criteria:**

- Updating profile in one tab updates another tab after event/refetch.
- Header profile display updates where applicable.

---

## M10 — Frontend Profile Picture UI

**Goal:** Implement profile picture upload and removal.

### M10.1 — Build `ProfilePictureUploader`

**Tasks:**

- Show current avatar.
- Allow select file.
- Preview before upload.
- Show validation hints.

**Passing Criteria:**

- Valid selected image previews.
- Invalid file type is blocked in UI.
- User can cancel before upload.

### M10.2 — Wire Upload and Remove APIs

**Tasks:**

- Submit `FormData` to `POST /profile/picture`.
- Remove via `DELETE /profile/picture`.
- Update `auth_user` and profile state after success.

**Passing Criteria:**

- Upload updates displayed avatar.
- Remove resets avatar.
- Backend validation messages display correctly.

---

## M11 — Frontend Sensitive Change Flows

**Goal:** Implement password, email, and 2FA reconfiguration UI.

### M11.1 — Change Password Dialog

**Tasks:**

- Fields: current password, OTP, new password, confirmation.
- Show password rules.
- Warn user they will be signed out after success.
- Submit to `/profile/password/change`.

**Passing Criteria:**

- Correct input changes password.
- Success clears local session and redirects to `/login`.
- Invalid password/OTP shows safe error.

### M11.2 — Change Email Dialog

**Tasks:**

- Step 1: new email + current password + OTP.
- Step 2: show “check your email” confirmation state.
- Optional dev flow: token input if using code-based verification.
- Final success redirects to login.

**Passing Criteria:**

- Start email change works.
- Confirmation flow works in test/dev.
- Existing email validation message displays.
- Sensitive flow disabled while offline.

### M11.3 — 2FA Reconfiguration Dialog

**Tasks:**

- Step 1: current password + current OTP.
- Step 2: display QR/manual key for new setup.
- Step 3: verify new OTP.
- No disable button.
- Warn user they will be signed out after success.

**Passing Criteria:**

- New QR/manual key displays after step-up.
- New OTP verification replaces TOTP.
- User is redirected to login.
- No user-facing 2FA disable path exists.

---

## M12 — PWA Offline Profile Queue

**Goal:** Add offline queue support for phone/address updates only.

### M12.1 — Create Profile Offline Queue Store

**Tasks:**

- Use existing Dexie infrastructure or add profile queue store if necessary.
- Store queue item with UUID, payload, profile_version, retry count, status.

**Passing Criteria:**

- Offline phone/address update creates queue row.
- Sensitive actions are not queued.

### M12.2 — Flush Queue Through `api.js`

**Tasks:**

- On online event, replay queued profile updates.
- Use shared `api.js` so refresh-on-401 works.
- Mark success, failed, exhausted, or conflict states.

**Passing Criteria:**

- Queue flushes after reconnect.
- Token refresh works during flush.
- Conflict is preserved and shown to user.

### M12.3 — Conflict UI

**Tasks:**

- Add `ProfileVersionAlert`.
- Show stale local values vs latest server values.
- Allow user to reapply.

**Passing Criteria:**

- `409` does not silently overwrite server data.
- User can recover by refetching and resubmitting.

---

## M13 — Blockchain Integration for Profile Changes

**Goal:** Anchor critical identity changes through the central blockchain system.

### M13.1 — Extend Blockchain Hash Support for User Profile Proofs

**Tasks:**

- Add canonical payload builder for profile events if existing entity hashing does not support event-level proofs cleanly.
- Ensure `user_profile` label appears in frontend blockchain monitoring repository.

**Passing Criteria:**

- `user_profile` records are created.
- Monitoring UI labels them as “User Profile”.
- Payload summary is safe.

### M13.2 — Create Records on Sensitive Changes

**Tasks:**

- Password change creates `profile_password_changed` proof.
- Email change creates `profile_email_changed` proof.
- 2FA reconfiguration creates `profile_2fa_reconfigured` proof.

**Passing Criteria:**

- Each sensitive flow creates exactly one expected blockchain record.
- Queue job is dispatched.
- API response does not wait for on-chain confirmation.

### M13.3 — Verification Tests

**Tasks:**

- Verify hash can be recomputed.
- Verify tampered data fails if supported by verification service.
- Verify retry behavior works for failed anchoring.

**Passing Criteria:**

- Unit/feature tests pass for profile blockchain record creation.
- Monitoring dashboard can display the records.

---

## M14 — Audit, Monitoring, and Hardening

**Goal:** Ensure profile actions are traceable, secure, and not leaking sensitive data.

### M14.1 — Audit Event Coverage

**Tasks:**

- Add tests for each profile audit event.
- Confirm metadata is sanitized.
- Confirm IP and user-agent are captured.

**Passing Criteria:**

- Every critical profile action writes an audit log.
- No secret is present in metadata.
- Failed attempts are logged where useful.

### M14.2 — Rate Limit Sensitive Profile Actions

**Tasks:**

- Add rate limiter configuration or middleware.
- Test lockout behavior.

**Passing Criteria:**

- Repeated invalid sensitive attempts are limited.
- Legitimate attempts after window expiry work.
- Rate-limit responses do not reveal secret validation details.

### M14.3 — Security Regression Tests

**Tasks:**

- Test prohibited field updates.
- Test stale JWT after sensitive changes.
- Test refresh token revocation.
- Test 2FA cannot be disabled.
- Test user cannot edit another user's profile through profile endpoints.

**Passing Criteria:**

- All regression tests pass.
- No role can bypass self-scope.
- Admin User Management still works independently.

---

## M15 — Final Documentation, Demo Checklist, and Module Freeze

**Goal:** Freeze the Profile Module after verification.

### M15.1 — Update Documentation

**Tasks:**

- Update `backend/documentation.md`.
- Update `frontend/documentation.md`.
- Add route/API table.
- Add known limitations.
- Add test command evidence.

**Passing Criteria:**

- Documentation reflects actual code.
- No planned feature is documented as implemented unless it exists.

### M15.2 — Manual Demo Checklist

**Tasks:**

Create demo checklist covering:

- View profile.
- Update phone/address.
- Upload/remove profile picture.
- Change password and re-login with TOTP.
- Start and confirm email change.
- Reconfigure 2FA and re-login with new authenticator.
- Confirm no 2FA disable option.
- Revoke sessions through Security Settings.
- Verify audit logs.
- Verify blockchain monitoring record.
- Test offline phone/address queue.

**Passing Criteria:**

- Demo checklist can be executed end-to-end.
- Failures are documented as known limitations or fixed.

### M15.3 — Final Test Suite

**Tasks:**

Run focused tests:

```bash
php artisan test --filter=Profile
php artisan test --filter=AuthSecuritySettingsTest
php artisan test --filter=AuthSessionMonitoringTest
php artisan test --filter=Blockchain

yarn test --run Profile
yarn test --run AccountSecurity
yarn build
```

**Passing Criteria:**

- Backend profile tests pass.
- Relevant auth/security regression tests pass.
- Frontend profile tests pass.
- Frontend production build passes.

---

## 15. API Contract Summary

### `GET /api/profile`

**Success:** `200`

```json
{
  "success": true,
  "message": "Profile retrieved successfully.",
  "data": {
    "user": {}
  }
}
```

### `PATCH /api/profile`

Allowed fields:

```json
{
  "phone": "0123456789",
  "address": "Kuala Lumpur",
  "profile_version": 4
}
```

Possible responses:

| Status | Meaning |
|---:|---|
| `200` | Updated successfully |
| `401` | Not authenticated |
| `403` | User blocked by active-user middleware |
| `409` | Profile version conflict |
| `422` | Validation failed |

### `POST /api/profile/picture`

Request:

```text
multipart/form-data
file: image
```

Possible responses:

| Status | Meaning |
|---:|---|
| `200` | Uploaded successfully |
| `422` | Invalid file |

### `POST /api/profile/password/change`

Request:

```json
{
  "current_password": "current-password",
  "otp": "123456",
  "password": "new-password",
  "password_confirmation": "new-password"
}
```

Possible responses:

| Status | Meaning |
|---:|---|
| `200` | Password changed; sessions revoked |
| `401` | Not authenticated |
| `403` | Step-up verification failed or user blocked |
| `422` | Validation failed |
| `429` | Rate limited |

### `POST /api/profile/email/start`

Request:

```json
{
  "current_password": "current-password",
  "otp": "123456",
  "new_email": "new.email@example.com"
}
```

### `POST /api/profile/email/confirm`

Request:

```json
{
  "token": "email-confirmation-token"
}
```

### `POST /api/profile/2fa/reconfigure/start`

Request:

```json
{
  "current_password": "current-password",
  "otp": "123456"
}
```

Response:

```json
{
  "success": true,
  "message": "Two-factor reconfiguration started.",
  "data": {
    "two_factor_reconfigure_token": "short-lived-token",
    "manual_key": "BASE32SECRET",
    "otpauth_uri": "otpauth://totp/...",
    "expires_in": 600
  }
}
```

### `POST /api/profile/2fa/reconfigure/verify`

Request:

```json
{
  "two_factor_reconfigure_token": "short-lived-token",
  "otp": "654321"
}
```

---

## 16. Test Strategy

### 16.1 Backend Feature Tests

Required coverage:

- `GET /profile` returns own profile.
- Unauthenticated users cannot access profile.
- All initialized roles can access own profile.
- `PATCH /profile` updates only allowed fields.
- `PATCH /profile` rejects email/password/role/2FA fields.
- Profile version conflict returns `409`.
- Profile picture upload validates file type and size.
- Password change requires current password and TOTP.
- Password change revokes sessions.
- Email change requires current password and TOTP.
- Email is not changed before confirmation.
- Email confirmation updates email and revokes sessions.
- 2FA reconfiguration requires current password and current TOTP.
- 2FA reconfiguration replaces secret and does not disable 2FA.
- User cannot disable 2FA through profile APIs.
- Sensitive changes create audit logs.
- Sensitive changes create blockchain records.
- No response exposes secrets.

### 16.2 Backend Unit Tests

Required coverage:

- `ProfileService` version increment and conflict detection.
- `ProfileSecurityService` step-up verification.
- `ProfileChangeToken` creation, expiry, and single-use validation.
- `ProfilePictureService` file path safety.
- `ProfileBlockchainService` safe payload creation.

### 16.3 Frontend Tests

Required coverage:

- Profile page loads and renders user data.
- Contact update calls repository with expected payload.
- Validation errors display.
- Conflict state displays and refetches.
- Profile picture preview and upload behavior.
- Change password success clears auth and redirects.
- Change email start/confirm flow.
- 2FA reconfigure flow has no disable button.
- Sensitive actions disabled offline.
- Offline phone/address update queues correctly.
- Cross-tab profile update event triggers refetch.

---

## 17. Implementation Order Recommendation

Implement in this exact order:

1. **M0 — Audit and architecture freeze**
2. **M1 — Backend data foundation**
3. **M2 — Backend profile read/update**
4. **M8 — Frontend profile foundation**
5. **M9 — Frontend profile read/update**
6. **M3 — Backend profile picture**
7. **M10 — Frontend profile picture**
8. **M4 — Backend step-up verification foundation**
9. **M5 — Backend password change**
10. **M11.1 — Frontend password dialog**
11. **M6 — Backend email change**
12. **M11.2 — Frontend email dialog**
13. **M7 — Backend 2FA reconfiguration**
14. **M11.3 — Frontend 2FA reconfiguration**
15. **M12 — PWA offline queue**
16. **M13 — Blockchain integration**
17. **M14 — Audit/hardening**
18. **M15 — Documentation and final freeze**

Reasoning:

- Start with low-risk profile read/update.
- Build UI early for visible progress.
- Add file upload before complex sensitive workflows.
- Build reusable step-up verification before password/email/2FA flows.
- Add blockchain after sensitive flows are stable.
- Add offline queue after core online behavior is correct.

---

## 18. Definition of Done

The Profile Module is complete when:

- All roles can view their own profile.
- All roles can update allowed non-sensitive profile fields.
- Profile picture upload and removal work safely.
- Password change requires current password + TOTP.
- Email change requires current password + TOTP + new email confirmation.
- 2FA reconfiguration requires current password + current TOTP + new TOTP verification.
- Users cannot disable 2FA.
- Sensitive changes revoke sessions and force login with 2FA again.
- Audit logs exist for all critical events.
- Blockchain records exist for email/password/2FA changes.
- Offline queue exists only for phone/address updates.
- Profile version conflict handling works.
- Frontend menu links Account Settings to `/account/profile`.
- Security Settings opens `/account/profile?tab=security` (`/account/security` redirect).
- Backend and frontend tests pass.
- Documentation is updated to match actual implementation.

---

## 19. Final Architecture Decision Record

### ADR-001 — Dedicated ProfileController Instead of Extending UserController

**Decision:** Use a dedicated `ProfileController` for self-service profile operations.

**Reason:** Admin User Management and self-service Profile Management have different authorization, validation, and security requirements.

**Consequence:** Cleaner permissions and lower risk of users editing prohibited fields.

### ADR-002 — Mandatory 2FA Cannot Be Disabled by User

**Decision:** Users cannot disable 2FA from the Profile Module.

**Reason:** The system is a high-security surveillance platform and the Login Module requires mandatory 2FA.

**Consequence:** UI provides only reconfiguration, not disablement. Admin reset remains recovery-only.

### ADR-003 — Step-Up Verification for Sensitive Changes

**Decision:** Password, email, and 2FA changes require current password + current TOTP.

**Reason:** A logged-in browser session alone is not sufficient proof for identity-sensitive changes.

**Consequence:** Sensitive flows cannot run offline and must be rate-limited.

### ADR-004 — Session Revocation After Sensitive Changes

**Decision:** Sensitive changes revoke sessions and force login again.

**Reason:** Existing sessions may be compromised or stale after identity/security changes.

**Consequence:** Frontend clears auth and redirects to `/login` after success.

### ADR-005 — Blockchain Anchoring Only for Critical Identity Changes

**Decision:** Anchor password/email/2FA changes, not routine phone/address edits by default.

**Reason:** Critical changes need tamper evidence. Routine edits do not need extra blockchain noise.

**Consequence:** Blockchain monitoring remains meaningful and efficient.

### ADR-006 — Offline Queue Only for Non-Sensitive Fields

**Decision:** Only phone/address updates can queue offline.

**Reason:** Email/password/2FA require live verification and token expiry checks.

**Consequence:** Sensitive action buttons are disabled offline.

---

## 20. Summary

The Profile Module should be implemented as a secure self-service identity module, not as a simple extension of Admin User Management. The architecture should reuse the already completed login, session, audit, and blockchain foundations while adding focused profile-specific services and frontend components.

The most important security decisions are final:

- **2FA is mandatory and cannot be disabled by users.**
- **Password, email, and 2FA changes require step-up verification.**
- **Sensitive changes revoke sessions and require full login with 2FA again.**
- **Critical identity changes are audited and anchored through the central blockchain module.**
- **Offline profile support is limited to non-sensitive contact fields.**

This design is efficient because it keeps the module small, reuses proven architecture, and avoids unnecessary duplication. It is effective because it meets the security expectations of a high-security surveillance platform while remaining implementable milestone by milestone.
