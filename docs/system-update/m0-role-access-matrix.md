# M0 — Role Access Matrix

> Historical milestone snapshot (2026-06-30).
> This section describes the codebase at that milestone and is retained for traceability.
> For current runtime behavior, see [`m3-ai-anpr-credential-migration.md`](./m3-ai-anpr-credential-migration.md) and [`system-update-roadmap.md`](../system-update-roadmap.md).

**Milestone:** M0.2  
**Status:** Frozen  
**Date:** 2026-06-30

## Principals

| Principal | Description | Token type |
|-----------|-------------|------------|
| **Admin** | Full management + monitoring | User JWT |
| **Security Operator** | Monitoring dashboards, read-only operational data | User JWT |
| **Guard** | Field patrol PWA, own profile | User JWT |
| **Camera** | ANPR machine identity | Camera JWT (separate from user) |

**Critical rule:** Camera tokens MUST remain separate from user authentication. User login with mandatory 2FA is unchanged.

### Legend

| Symbol | Meaning |
|--------|---------|
| **R** | Read |
| **W** | Write (create/update/delete as applicable) |
| **—** | Forbidden |
| **O** | Own resource only |
| **\*** | Planned endpoint (not yet implemented) |

---

## 1. Authentication Endpoints

| Endpoint | Admin | Security Operator | Guard | Camera |
|----------|-------|-------------------|-------|--------|
| `POST /auth/login` | W | W | W | — |
| `POST /auth/otp/verify` | W | W | W | — |
| `POST /auth/refresh` | W | W | W | — |
| `POST /auth/logout` | W | W | W | — |
| `POST /auth/password-setup/*` | W | W | W | — |
| `POST /auth/2fa/setup/*` | W | W | W | — |
| `GET /auth/me` | R | R | R | — |
| `GET /auth/sessions` | R | R | R | — |
| `DELETE /auth/sessions/{id}` | W | W | W | — |
| `POST /auth/logout-all` | W | W | W | — |
| `GET /auth/audit-logs` | R | — | — | — |
| `POST /auth/2fa/reset/{user}` | W | — | — | — |
| `POST /camera-auth/login` | — | — | — | W |
| `POST /camera-auth/heartbeat` | — | — | — | W |
| `GET /camera-auth/heartbeat` | — | — | — | R |

---

## 2. Profile Endpoints

| Endpoint | Admin | Security Operator | Guard | Camera |
|----------|-------|-------------------|-------|--------|
| `GET /profile` | R (own) | R (own) | R (own) | — |
| `PATCH /profile` | W (own) | W (own) | W (own) | — |
| `POST /profile/picture` | W (own) | W (own) | W (own) | — |
| `DELETE /profile/picture` | W (own) | W (own) | W (own) | — |
| `POST /profile/password/change` | W (own) | W (own) | W (own) | — |
| `POST /profile/email/*` | W (own) | W (own) | W (own) | — |
| `POST /profile/2fa/reconfigure/*` | W (own) | W (own) | W (own) | — |

---

## 3. Camera Management

| Endpoint | Admin | Security Operator | Guard | Camera |
|----------|-------|-------------------|-------|--------|
| `GET /cameras` | R | — | — | — |
| `POST /cameras` | W | — | — | — |
| `GET /cameras/{id}` | R | — | — | — |
| `PUT/PATCH /cameras/{id}` | W | — | — | — |
| `DELETE /cameras/{id}` | W | — | — | — |

**Current baseline:** Operator forbidden from `POST /cameras` (verified in `AuthRouteGuardHardeningTest`).

---

## 4. ANPR Endpoints

| Endpoint | Admin | Security Operator | Guard | Camera |
|----------|-------|-------------------|-------|--------|
| `GET /anpr-events` | R | R | — | — |
| `GET /anpr-events/{id}` | R | R | — | — |
| `GET /anpr-event-logs` | R | R | — | — |
| `GET /anpr-images` | R | R | — | — |
| `GET /anpr-images/{id}/file` | R | R | — | — |
| `POST /anpr-events` | W | — | — | W (own camera) |
| `PUT/PATCH /anpr-events/{id}` | W | — | — | — |
| `DELETE /anpr-events/{id}` | W | — | — | — |
| `POST /anpr-events/{id}/images/upload` | W | — | — | W (own event) |
| `POST /anpr-images` | W | — | — | W (own event) |
| `POST /anpr-event-logs` | W | — | — | W (own event) |

**Camera write scope (M2):** Camera principal may only create/read/write evidence for events where `event.camera_id` equals token camera ID.

---

## 5. Patrol Endpoints

| Endpoint | Admin | Security Operator | Guard | Camera |
|----------|-------|-------------------|-------|--------|
| `GET /patrol-sessions` | R | R | — | — |
| `GET /patrol-sessions/{id}` | R | R | O (own) | — |
| `POST /patrol-sessions` | W | W | W | — |
| `PUT/PATCH /patrol-sessions/{id}` | W | W | O | — |
| `POST /patrol-sessions/{id}/validate` | W | W | O | — |
| `GET /patrol-sessions/{id}/summary` | R | R | O | — |
| `POST /patrol-routes` | W | W | O | — |
| `POST /checkpoint-events` | W | W | O | — |
| `POST /location-logs` | W | W | O | — |
| `GET /patrol-routes` | R | R | — | — |
| `GET /checkpoint-events` | R | R | — | — |

---

## 6. PWA Sync

| Endpoint | Admin | Security Operator | Guard | Camera |
|----------|-------|-------------------|-------|--------|
| `POST /pwa/sync` | W | W | W (own patrol) | — |

---

## 7. Dashboard (M10)

| Endpoint | Admin | Security Operator | Guard | Camera |
|----------|-------|-------------------|-------|--------|
| `GET /dashboard/summary` | R (full) | R (subset) | R (subset) | — |

---

## 8. User / Zone / Checkpoint / Vehicle Management

| Endpoint group | Admin | Security Operator | Guard | Camera |
|----------------|-------|-------------------|-------|--------|
| `/users` CRUD | W | — | — | — |
| `/zones` CRUD | W | — | — | — |
| `/checkpoints` CRUD | W | — | — | — |
| `/vehicles` CRUD | W | — | — | — |

---

## 9. Blockchain Monitoring

| Endpoint group | Admin | Security Operator | Guard | Camera |
|----------------|-------|-------------------|-------|--------|
| `GET /blockchain-records` | R | — | — | — |
| `POST /blockchain-records/{id}/verify` | W | — | — | — |
| `POST /blockchain-records/{id}/refresh` | W | — | — | — |
| `POST /blockchain-records/verify-all` | W | — | — | — |
| `POST /blockchain-records/{id}/retry` | W | — | — | — |

**M12 requirement:** Camera token tests must prove **forbidden** on all blockchain routes.

---

## 10. Frontend Route Access (UX layer — backend is authoritative)

| Route | Admin | Security Operator | Guard | Camera |
|-------|-------|-------------------|-------|--------|
| `/dashboard` | R | R | R | — |
| `/patrol` | R | R | R | — |
| `/admin/patrol-monitoring` | R | R | — | — |
| `/admin/anpr-monitoring` | R | R | — | — |
| `/admin/blockchain-monitoring` | R | — | — | — |
| `/admin/auth-monitoring` | R | — | — | — |
| `/admin/management-user` | R/W | — | — | — |
| `/admin/management-zone` | R/W | — | — | — |
| `/admin/management-checkpoint` | R/W | — | — | — |
| `/admin/management-vehicle` | R/W | — | — | — |
| `/admin/management-camera` | R/W | — | — | — |
| `/account/profile` | R/W | R/W | R/W | — |
| `/account/security` | _redirect_ | _redirect_ | _redirect_ | — |

**Note (System Update M6):** `/account/security` redirects to `/account/profile?tab=security`. Canonical Account Settings is `/account/profile` with Profile Summary (`tab=profile`) and Security Settings (`tab=security`) tabs.

Camera principal has **no frontend access** — headless machine client only.

---

## 11. Camera Token Negative Matrix (M12 acceptance)

Camera JWT MUST be **forbidden** on:

| Category | Examples |
|----------|----------|
| User identity | `/auth/me`, `/profile/*`, `/users/*` |
| Admin management | `/cameras` CRUD, zones, checkpoints, vehicles |
| Patrol | `/patrol-sessions/*`, `/pwa/sync` |
| Monitoring read | `/anpr-events` GET, `/blockchain-records` |
| Cross-camera write | ANPR events/images for another camera's ID |

Camera JWT MUST be **allowed** on:

| Endpoint | Scope |
|----------|-------|
| `POST /camera-auth/login` | Public (no token) |
| `POST /camera-auth/heartbeat` | Own camera |
| `POST /anpr-events` | Own camera |
| `POST /anpr-events/{id}/images/upload` | Own events |
| `POST /anpr-images` | Own events |
| `POST /anpr-event-logs` | Own events |

---

## 12. Matrix Change Control

Any M1+ PR that adds routes MUST update this matrix and add feature tests proving:

1. Allowed principals receive expected status (200/201).
2. Forbidden principals receive 403 (not 401 unless unauthenticated).
3. Camera/user token confusion returns 401 or 403 without data leakage.

---

## 13. Assumptions

1. Admin retains ability to manually create ANPR events with explicit `camera_id` for support/debug.
2. Security Operator monitoring read access to ANPR is unchanged.
3. Guards never receive ANPR monitoring API access.
4. Camera credentials are Admin-provisioned only; no self-registration.
