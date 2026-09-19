# Frontend (React + Vite) — Technical Documentation

This document is the primary technical reference for the **`frontend`** application as it exists in the repository today. It describes the actual code, configuration, and behavior found in the project. Where a detail cannot be confidently inferred from the codebase, the document states so explicitly.

## Current contract

| Field | Value |
|---|---|
| **Status** | Implemented — aligned with repository runtime |
| **Last audited** | 2026-07-21 |
| **Canonical precedence** | This file overrides milestone snapshots and planning-only text in [`../docs/login-module.md`](../docs/login-module.md) / [`../docs/profile-module.md`](../docs/profile-module.md) when they disagree. Patrol movement: [`../docs/system-update/patrol-location-logs-canonical-movement.md`](../docs/system-update/patrol-location-logs-canonical-movement.md). Account Settings: [`../docs/system-update/m6-account-settings-two-tab-redesign.md`](../docs/system-update/m6-account-settings-two-tab-redesign.md). |
| **Historical policy** | Milestone appendix notes marked *at Mx* or wrapped in *Historical milestone snapshot* banners describe point-in-time state only — not current behavior. |
| **Known manual tasks** | Re-audit after profile or patrol-movement changes; run focused Vitest/`yarn build` before release demos. |

**Documentation audit:** Last aligned with implementation **2026-07-21**. Login Module (M0–M10), Profile Module (M0–M15), camera management (M4), dashboard (M10), account settings two-tab layout (M6), shared UI states (M5), and PWA tuning (M7) are **implemented**.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Routing Documentation](#4-routing-documentation)
5. [API Integration](#5-api-integration)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [State Management](#7-state-management)
8. [UI Components & Design System](#8-ui-components--design-system)
9. [Forms & Validation](#9-forms--validation)
10. [Configuration](#10-configuration)
11. [Dependencies](#11-dependencies)
12. [Build & Deployment](#12-build--deployment)
13. [Known Issues / Technical Debt](#13-known-issues--technical-debt)
14. [Future Improvements](#14-future-improvements)
15. [Progressive Web App (PWA)](#15-progressive-web-app-pwa)

---

## 1. Project Overview

### Purpose

`frontend` is a **React 19 + Vite 7** single-page application built on top of the **Berry Material UI** admin template (`berry-material-react-js`, version `5.1.0`). It serves as the administrator/operator dashboard for the FYP system whose backend is the Laravel application in `backend`.

The frontend currently provides:

- A **JWT-protected dashboard layout** (header, sidebar, breadcrumbs, footer, theme customization).
- A **login flow** that calls the Laravel backend (`POST /auth/login`, with legacy fallback to `POST /login` on 404). **M5:** email/password alone does not issue tokens for initialized users; login branches to password setup, 2FA setup, or OTP challenge. JWT + `auth_user` are persisted via `utils/auth.js` only after successful OTP or 2FA setup verification. Setup tokens, 2FA setup tokens, and login challenge IDs use React Router state only (never `localStorage` / `sessionStorage`).
- A **route-guarded** structure that separates protected app routes (`MainRoutes`) from guest-only routes (`AuthenticationRoutes`).
- A **User Management module** under `feature/management-user` that lists, views, creates, updates, and deletes users via the backend `/users` and `/roles` endpoints at `/admin/management-user`.
- Sample dashboard widgets (charts, cards) inherited from the Berry template — **replaced by M10** `feature/dashboard` on `/dashboard`.
- Theme customization (light scheme + CSS variables) with font family / border radius adjustments persisted to `localStorage`.
- **Progressive Web App (PWA)** support via `vite-plugin-pwa` (service worker precache, web app manifest, optional **Install App** UI in the sidebar when the browser fires `beforeinstallprompt`).
- **PWA client layer (`src/pwa/`)** — offline-aware UX (`NetworkSnackbar`), Dexie **IndexedDB** for patrol location logs and a **sync queue**, a **`flushSyncQueue`** sync engine posting to `POST /api/pwa/sync`, **Background Sync** (tag **`pwa-sync-queue`**: SW notifies clients → app-thread flush; falls back to **`online`** + **Retry Sync** when unsupported), **`pushNotificationService`** (subscribe/unsubscribe → `POST/DELETE /api/push-subscriptions`; **outbound** test → `POST /api/push-notifications/test`), and shared **`useNetworkStatus`**. Custom SW: **`public/push-handlers.js`** (push display + **`notificationclick`** deep links + Background **`sync`**).
- **Patrol module (`feature/patrol`)** — single guard page **`views/PartrolHome.jsx`** + **`usePatrolController`**: creates Laravel **`patrol_sessions`** and **`checkpoint-events`** placeholders, persists GPS via Dexie **`location_logs`** → **`POST /pwa/sync`** only (**`createPatrolRoute`** / **`POST /patrol-routes`** deprecated — no dual-write), and drives live GPS only via **`feature/patrol/services/geolocationService`** ( **`saveLocationLog`** → Dexie + **`sync_queue`**). On **`/patrol`** load (no active session), the controller warms up GPS via **`warmUpCurrentLocation`** (high accuracy, `maximumAge: 0`, 10s timeout) and shows pre-start health on the start panel. **Start patrol** blocks with a **Poor GPS accuracy** dialog when the latest fix is **> 75m** (`POOR_GPS_ACCURACY_THRESHOLD_METERS` in **`patrolGpsUtils`**); the guard can wait or start anyway. **Stop Patrol** (M9) opens a confirmation dialog, then runs: flush PWA sync → **`POST /patrol-sessions/{id}/validate`** (when online) → **`GET /patrol-sessions/{id}/summary`**; results in **`PatrolSummaryCard.jsx`** (M9 outcome-first summary with M8 statuses and status tooltips). **`PatrolPwaStatusPanel.jsx`** shows sync/GPS/notification health; GPS labels come from controller state via **`patrolGpsUtils`** — presentational components do not call **`navigator.geolocation`**.
- **ANPR Monitoring (`feature/anpr-monitoring`)** — **M10** admin/operator module at **`/admin/anpr-monitoring`**: lists ANPR detections from Laravel with server-side filters (plate, validity, flagged), shows event detail with summary cards and evidence gallery; evidence previews load via backend `url` / `image_url` and JWT-authenticated fetch to **`GET /anpr-images/{id}/file`**; no event logs or raw metadata in the UI. **M12:** live polling auto-refreshes the list every 5 seconds with a blinking red dot beside the page title (tooltip: **Live update**; no `LIVE` text label or last-updated line); new rows are temporarily highlighted; polling failures show degraded RECONNECTING state without clearing existing rows; manual refresh remains available.

### Core Functionality

| Area                       | Status                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login (JWT + 2FA)         | Implemented                          | `AuthLogin.jsx` branches to `/first-login/setup`, `/first-login/2fa`, `/login/otp`; tokens stored only after OTP/setup verify. |
| Logout                     | Implemented                          | Profile menu → `useAuthController.handleLogout()` → `POST /auth/logout`, `clearAuthSession()`, Reverb disconnect, `navigate('/login')`.                                                                                                                                                                                                                                                                                            |
| Register                   | **UI-only**                          | `AuthRegister.jsx` is a static form; no API call is wired.                                                                                                                                                                                                                                                                                                                                                                         |
| Dashboard                  | **Implemented (M10)**              | `feature/dashboard` — role-aware operational home at `/dashboard` for Admin, Security Operator, and Guard; replaces Berry template widgets; loads `GET /dashboard/summary`. |
| User Management — list     | Implemented                          | `feature/management-user/views/UserList.jsx`.                                                                                                                                                                                                                                                                                                                                                                                      |
| User Management — view     | Implemented                          | `feature/management-user/views/UserView.jsx`.                                                                                                                                                                                                                                                                                                                                                                                      |
| User Management — add/edit | **Implemented**                      | `UserAdd.jsx` / `UserEdit.jsx` at `/admin/management-user/add` and `/edit/:userId`; payloads use backend fields (`name`, `email`, `phone`, `address`, `role_id`, optional `password` on edit); roles loaded from `GET /roles`. |
| Zone management            | **Implemented**                      | `feature/management-zone` — CRUD at `/admin/management-zone`; zone detail at `/admin/management-zone/view/:zoneId` embeds scoped checkpoint list (no zone filter/column) + `ZoneProfileData` (no **Created by** in UI). Default list page size **5**.                                                                                                                                                                                                                                                                                                                    |
| Checkpoint management      | **Implemented**                      | `feature/management-checkpoint` — full admin CRUD; checkpoint detail **Back** returns to parent zone (`/admin/management-zone/view/:zoneId`); detail header has **Edit** (primary) beside **Back**. Default list page size **5**. **Admin only**.                                                                                                                                                                                                                                                                   |
| Camera management          | **Implemented (M4)**                 | `feature/management-camera` — Admin CRUD at `/admin/management-camera`; list, create/edit drawer, detail drawer; consumes `GET/POST/PATCH/DELETE /cameras`; RTSP shown masked/read-only; passwords never displayed. |
| Patrol Home (`/patrol`)    | **Implemented (functional)**         | `feature/patrol` — **all roles** (Admin, Security Operator, Guard); Laravel **`patrol_sessions.id`** is end-to-end **`patrolId`** (Dexie **`location_logs.patrolId`** and **`POST /pwa/sync`** payload **`patrolId`** match); checkpoints via **`checkpoint-events`**; GPS via Dexie **`location_logs`** → **`POST /pwa/sync`** (no dual-write to **`POST /patrol-routes`**); **`usePatrolController`** + **`services/geolocationService`**; **`PatrolPwaStatusPanel`**. See [Section 15](#15-progressive-web-app-pwa). |
| Patrol Monitoring          | **Implemented**                      | `feature/patrol-monitoring` — **Admin + Security Operator only**; dashboard + session detail at **`/admin/patrol-monitoring`**; M9 KPI cards, attention filter, M5 loading/empty/error states; map-first session detail with **Map / Satellite** Leaflet layer control; **Map legend** and **Movement review** open in detail dialogs; checkpoint status chips/tables include hover tooltips (`patrolStatusUtils`); route replay with timeline labels; **Re-run Validation** calls **`POST …/validate`**. Realtime via Laravel Reverb + Echo (30s polling fallback). |
| ANPR Monitoring            | **Implemented**                      | `feature/anpr-monitoring` — **Admin + Security Operator only**; list + detail at **`/admin/anpr-monitoring`**; sidebar **ANPR Monitoring** (`IconCar`); server-side filters via **`GET /anpr-events`**; evidence gallery with protected file previews; **M10 blockchain** lightweight proof section on event detail (status, tx hash, network, image proof summary — Laravel API only, no Web3); **M12** live polling (5s) with blinking red dot indicator (tooltip only), new-row highlight, manual refresh preserved; **M13** linked vehicle section on event detail with admin navigation to vehicle management; **M15** exponential backoff on repeated poll failures (max 30s), list evidence badges use `images_count` when image rows are omitted. |
| Blockchain Monitoring      | **Implemented**                      | **M11** — `feature/blockchain-monitoring`; **`/admin/blockchain-monitoring`** (+ record detail); **Admin only**; summary cards, filters, table, verify/retry/refresh via Laravel blockchain APIs only; no Web3. **M13:** displays `user_profile` proof records from sensitive profile changes (password/email/2FA) with safe payload summaries. |
| PWA offline / sync         | **Implemented (core)**               | IndexedDB + sync queue + global **`NetworkSnackbar`**; **`POST /api/pwa/sync`** (**JWT**) drains **`location_log`** rows idempotently. **Background Sync** registers tag **`pwa-sync-queue`** when the queue has work; SW **`sync`** posts **`PWA_SYNC_REQUEST`** to clients → **`flushSyncQueue`**. **Retry Sync** + auto-flush on **`online`** remain when Background Sync is unavailable.                                       |
| Web Push (PWA)             | **Implemented**                      | Subscribe/unsubscribe + **outbound** patrol alerts from Laravel (`WebPushNotificationService`). **`PatrolPwaStatusPanel`**: permission/subscription state, **Send Test Notification** (`POST /push-notifications/test` — `success: true` only when at least one device receives the push; `data` includes delivery counts). Reverb realtime remains separate.                                                                      |
| Theme Customization        | Implemented                          | Font family + border radius drawer (toggle button itself is currently commented out).                                                                                                                                                                                                                                                                                                                                              |
| Notifications              | **Implemented (M6)**                 | Header bell links to Account Settings. **Push notification** subscribe/unsubscribe and test live on **Profile Summary** tab (`ProfileNotificationSettingsCard` → `pushNotificationService.js`). Requires `VITE_VAPID_PUBLIC_KEY`. |

### Main Modules / Features (as found in `src/`)

- `feature/management-user` — primary CRUD reference module.
- `feature/management-checkpoint` — admin checkpoint CRUD with Leaflet map picker.
- `feature/patrol` — guard patrol session UI + **`usePatrolController`** + Laravel patrol/checkpoint/route APIs + patrol geolocation service.
- `feature/patrol-monitoring` — admin/operator patrol surveillance dashboard (session list, detail, re-validation).
- `feature/anpr-monitoring` — admin/operator ANPR detection monitoring (event list, detail, evidence gallery).
- `feature/authentication` — login setup controllers, OTP/2FA views, `useAuthController`, session-expired dialog.
- `feature/account-security` — session panel reused on Profile security tab; `/account/security` redirect wrapper.
- `feature/profile` — unified Account Settings (`/account/profile`) with profile + security tabs (M6).
- `feature/auth-monitoring` — Admin auth audit logs + session monitoring (`/admin/auth-monitoring`).
- `feature/blockchain-monitoring` — Admin blockchain dashboard (`/admin/blockchain-monitoring`).
- `feature/dashboard` — **M10** role-aware operational home (`/dashboard`).
- `feature/management-camera` — **M4** admin camera credential management.
- `feature/management-vehicle` — **M13** admin vehicle registry.
- `feature/patrol-history` / `feature/patrol-live-tracking` — legacy operator patrol views (**Admin-only** routes under `/operator/patrol/*`).
- `views/dashboard/Default` — thin re-export of `feature/dashboard/views/DashboardHome` (Berry demo widgets replaced by M10).
- `views/pages/authentication` — Login + Register pages.
- `views/utilities` — Typography / Color / Shadow showcase pages.
- `views/sample-page` — Berry template sample page.
- `layout/MainLayout`, `layout/MinimalLayout`, `layout/Customization` — application chrome.

### Versions (from `package.json`)

| Item                                 | Version                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| React                                | `19.2.0`                                                                                                              |
| React DOM                            | `19.2.0`                                                                                                              |
| React Router / Router DOM            | `7.9.6`                                                                                                               |
| Vite                                 | `7.2.6`                                                                                                               |
| `@vitejs/plugin-react`               | `5.1.1`                                                                                                               |
| Material UI (`@mui/material`)        | `7.3.5`                                                                                                               |
| `@mui/icons-material`                | `7.3.5`                                                                                                               |
| `@emotion/react` / `@emotion/styled` | `11.14.0` / `11.14.1`                                                                                                 |
| `@tabler/icons-react`                | `3.35.0`                                                                                                              |
| ApexCharts / `react-apexcharts`      | `5.3.6` / `1.9.0`                                                                                                     |
| SWR                                  | `2.3.7`                                                                                                               |
| `framer-motion`                      | `12.23.25`                                                                                                            |
| `yup`                                | `1.7.1`                                                                                                               |
| Sass                                 | `1.94.2` (devDependency)                                                                                              |
| Yarn                                 | `4.10.3` (`packageManager`)                                                                                           |
| `vite-plugin-pwa`                    | `^1.3.0` (devDependency) — Workbox service worker + web manifest generation.                                          |
| `workbox-window`                     | `^7.4.1` (devDependency) — Used by the PWA client registration path.                                                  |
| `dexie`                              | `^4.x` (runtime) — IndexedDB wrapper for `src/pwa/db.js` (location logs, sync queue, patrol_sessions, notifications). |

### UI Libraries / Frameworks Used

- **Material UI v7** (`@mui/material`, `@mui/icons-material`) for all UI primitives.
- **Emotion** (`@emotion/react`, `@emotion/styled`) — MUI's styling engine.
- **Tabler Icons** (`@tabler/icons-react`) — primary icon set, with a Vite alias to its ESM build.
- **Framer Motion** — used by Berry's `AnimateButton` / `Transitions`.
- **ApexCharts** — dashboard charts.
- **SimpleBar React** — custom scrollbars in the **desktop** sidebar. On **mobile** (`useMediaQuery` / `downMD`), the sidebar’s scrollable region uses a native `overflow-y: auto` `Box` instead of the shared `SimpleBar` component: that wrapper uses `react-device-detect`’s `BrowserView` + `MobileView`, and on many phones both mount, which breaks the flex column and hides the pinned **Install App** button (see [Section 15](#15-progressive-web-app-pwa)).
- **Slick Carousel** — listed as a dependency (no usage detected in `src/`; carried from the Berry template).

### Main npm Packages

See [Section 11](#11-dependencies) for the full table.

### Frontend ↔ Backend Relationship

The frontend talks to the Laravel API in `backend`. The relationship is:

- **Base URL:** `import.meta.env.VITE_API_BASE_URL` (default `http://localhost:8000/api`).
- **Web Push VAPID public key:** `import.meta.env.VITE_VAPID_PUBLIC_KEY` (URL-safe base64; must match backend `VAPID_PUBLIC_KEY`). **Private key stays on the server only.**
- **Auth scheme:** JWT bearer token (`Authorization: Bearer <token>`) plus HttpOnly refresh cookie (M1). **M2/M5:** `utils/auth.js` keeps an in-memory token cache with `localStorage` persistence for route-guard reload support. Semi-public auth steps do not persist tokens until OTP or 2FA setup verification succeeds.
- **Endpoints actually called from the frontend (non-exhaustive; see [Section 5](#5-api-integration)):**
  - `POST /auth/login` — credential validation; returns `next_step` branch (no token until OTP/setup verify).
  - `POST /auth/password-setup/complete`, `POST /auth/2fa/setup/start`, `POST /auth/2fa/setup/verify`, `POST /auth/otp/verify` — M4/M5 auth steps (`skipAuthRefresh: true`).
  - `POST /auth/refresh`, `POST /auth/logout` — session rotation and logout.
  - `GET /users`, `GET /users/{id}`, `POST /users`, `PATCH /users/{id}`, `DELETE /users/{id}` — user CRUD.
  - Zone, patrol, checkpoint, and **PWA sync** endpoints — see Section 5 tables.

The Laravel backend exposes **`POST /api/pwa/sync`** (JWT **`auth:api`**) for the client sync engine to drain queued location payloads. The guard patrol module creates **`patrol_sessions`** via **`POST /patrol-sessions`** and passes that session **`id`** as **`patrolId`** into Dexie / sync payloads so **`pwa/sync`** validation matches **`patrol_sessions.id`**.

---

## 2. System Architecture

### Overall Frontend Architecture

```
┌────────────────────────────────────────────────────────┐
│                  Browser (Vite SPA)                     │
│                                                         │
│   ┌───────────────────────────────────────────────┐    │
│   │ index.jsx — createRoot; registerSW() (PWA SW)  │    │
│   │   └── ConfigProvider (Context + localStorage)  │    │
│   │        └── App.jsx (+ global NetworkSnackbar)  │    │
│   │             └── ThemeCustomization (MUI Theme) │    │
│   │                  └── NavigationScroll          │    │
│   │                       └── RouterProvider       │    │
│   └───────────────────────────────────────────────┘    │
│                                                         │
│   Routes: MainRoutes (protected) + AuthenticationRoutes │
│           (guest)                                       │
│                                                         │
│   ┌────────────────┐     ┌────────────────────────┐    │
│   │   MainLayout   │     │     MinimalLayout       │    │
│   │  (header,      │     │     (only <Outlet />)   │    │
│   │   sidebar,     │     └────────────────────────┘    │
│   │   breadcrumbs, │                                    │
│   │   customization│                                    │
│   │   drawer)      │                                    │
│   └────────────────┘                                    │
│                                                         │
│   Feature modules → controllers → repositories          │
│   ↓                                                     │
│   src/api/api.js (fetch wrapper, JWT, M2 refresh-on-401)     │
└────────────────────────────────────────────────────────┘
                          │
                          ▼
              Laravel API (backend)
                  http://localhost:8000/api
```

### Component Architecture

The codebase blends two styles:

- **Berry template style** — `views/`, `layout/`, `ui-component/`, `themes/`, `menu-items/` use the original Berry conventions (functional components, MUI styled APIs, lazy-loaded route components).
- **Feature/Clean-Architecture style** — `src/feature/management-user/` is organized as:

```
feature/management-user/
├── views/          # Page-level components (UserList, UserView, UserAdd, UserEdit)
├── components/     # Feature-specific reusable components (table rows, cards…)
├── controllers/    # React hooks containing business logic (useUserController, …)
├── repositories/   # Class-based repositories that wrap data sources
├── datasources/    # Real (HTTP) and mock data sources (userService, userDataSource)
└── styles/         # Feature-specific styled() components
```

Dependency injection is performed at the view level:

```jsx
const repository = new UserRepository(userService);
const controller = useUserController(repository);
```

This keeps views purely presentational while controllers own state, side effects, and navigation.

### Blockchain monitoring architecture (M11 — implemented)

**M11** implements the blockchain monitoring dashboard at **`/admin/blockchain-monitoring`** for **Admin only**. Module: `feature/blockchain-monitoring` (view → controller → repository → `blockchainMonitoringService`). Uses Laravel APIs only — **no** Web3, wallet libraries, or browser Ethereum RPC.

| Route | Purpose |
| --- | --- |
| `/admin/blockchain-monitoring` | Summary cards, filters, paginated record table |
| `/admin/blockchain-monitoring/:blockchainRecordId` | Detail, jobs, verifications, verify/retry/refresh |

Sidebar: Admin → **Blockchain Monitoring** (`IconShieldCheck`). Security Operators and Guards cannot access routes.

APIs: `GET /api/blockchain-records`, `GET /api/blockchain-records/summary`, `GET /api/blockchain-records/{id}`, `POST .../verify`, `POST .../retry`, `POST .../refresh` (all **Admin only**).

See: [`../blockchain/docs/m11-blockchain-monitoring-frontend.md`](../blockchain/docs/m11-blockchain-monitoring-frontend.md). M13 hardening and demo checklist: [`../blockchain/docs/m13-final-hardening-testing-and-documentation.md`](../blockchain/docs/m13-final-hardening-testing-and-documentation.md).

### Feature-Based Structure

`src/feature/` contains one folder per business domain. `management-user` is the most complete module; `management-zone` now has active data/service wiring; `feature/authentication` provides logout (service/repository/controller); `management-checkpoint` is fully implemented (Milestone 8); **`management-camera`** is implemented at `/admin/management-camera` (System Update M4).

### State Management Flow

There is **no Redux / Zustand**. State is managed at three levels:

1. **App config (global, persisted)** — `ConfigContext` + `useLocalStorage('berry-config-vite-js', config)`.
2. **App-wide ephemeral state via SWR** — `api/menu.js` uses `useSWR` purely as a global key/value cache to track sidebar drawer open/close (`isDashboardDrawerOpened`).
3. **Local component / controller state** — each feature controller hook (e.g. `useUserController`) owns its own `useState` / `useEffect`.

```
ConfigContext (theme, fontFamily, borderRadius, …) ─┐
                                                    │
SWR cache (isDashboardDrawerOpened)─────────────────┤
                                                    ▼
                                          Components & layouts
                                                    ▲
Controller hooks (per-feature) ─────────────────────┘
```

### API Communication Flow

```
View
 └─ controller hook (useState / useEffect)
      └─ Repository (class)
           └─ DataSource / Service (userService.js)
                └─ src/api/api.js (fetch wrapper)
                     ├─ adds Authorization: Bearer <token>
                     ├─ JSON body unless FormData
                     └─ on 401 (protected) → runAuthRefresh() → retry once (M2)
                          └─ on refresh failure → clearAuthSession + session-expired UX + /login
                          └─ Laravel API
```

### Routing Structure

```
createBrowserRouter([MainRoutes, AuthenticationRoutes], {
  basename: normalizeRouterBaseName(VITE_APP_BASE_NAME) // "/" by default in current .env
})
```

- `MainRoutes` (`'/'`) → `<ProtectedRoute><MainLayout /></ProtectedRoute>`
- `AuthenticationRoutes` (`'/'`) → `<GuestRoute><MinimalLayout /></GuestRoute>`

See [Section 4](#4-routing-documentation) for the full table.

### Authentication Flow

```
   ┌─────────┐     submit form      ┌─────────────────┐
   │  Login  │ ───────────────────► │ POST /auth/login │
   │  Page   │                       │ (fallback /login)│
   └────┬────┘                       └────────┬─────────┘
        │ 200 OK                              │
        ├─ next_step = password_setup_required
        │  → /first-login/setup (setup_token in route state only)
        │
        ├─ next_step = two_factor_setup_required
        │  → /first-login/2fa (two_factor_setup_token in route state only)
        │
        ├─ next_step = otp_required
        │  → /login/otp (login_challenge_id in route state only)
        │
        └─ (legacy/direct token path only if backend returns access_token)
           setAuthToken + setAuthUser → role home route

   /first-login/setup complete → /first-login/2fa
   /first-login/2fa verify success → access_token + HttpOnly refresh cookie
   /login/otp verify success → access_token + HttpOnly refresh cookie

   Subsequent API calls ──► Authorization: Bearer <JWT> + credentials: include
                                │
                  ┌─────────────┴─────────────┐
                  │                           │
                  ▼                           ▼
              200/2xx OK              401 Unauthorized (protected)
                  │                           │
                  ▼                           ▼
           Render data         runAuthRefresh() → retry once (M2)
                                              │
                              refresh failure or retried 401
                                              ▼
                              clearAuthSession() + session-expired UX + /login
```

### Data Flow Between Frontend and Backend

For user list / view:

```
UserList.jsx
  → useUserController(repository)
      → repository.getAllUsers()
          → userService.getAllUsers()
              → api.get('/users')        # fetch GET /api/users with Bearer token
              ← { data: [...users] }     # response.data
          ← payload                      # response.data unwrapped
      ← payload
  → setUsers(payload.data)               # template stores list as `data.data`
  → repository.filterUsers / paginateUsers
  → render <UserTable />
```

---

## 3. Directory Structure

The repository is organized as a single Vite-React app at the project root.

```
frontend/
├── index.html                # Vite entry
├── vite.config.mjs           # Vite + plugin config
├── jsconfig.json             # baseUrl: "src" (path aliases)
├── jsconfig.node.json        # Node-only config for vite.config.mjs
├── eslint.config.mjs         # Flat ESLint config
├── .prettierrc               # Prettier config
├── .env                      # Local env (VITE_*)
├── package.json              # Scripts + deps (Yarn 4 / Berry)
├── yarn.lock
├── README.md                 # Original CRA-style README (legacy)
├── documentation.md          # ← this file
├── public/                   # Static files copied to dist root (`_redirects`, `push-handlers.js`, `icons/` for PWA)
└── src/
    ├── App.jsx               # ThemeCustomization + NavigationScroll + NetworkSnackbar + PwaUpdateSnackbar + SessionExpiredDialog + RouterProvider
    ├── components/           # Shared components (e.g. NetworkSnackbar for offline/online feedback)
    ├── pwa/                  # PWA client layer: Dexie DB, location logs, sync engine, network hook, browser geolocation infra
    ├── index.jsx             # createRoot + ConfigProvider + fonts + `registerSW` (vite-plugin-pwa)
    ├── config.js             # DASHBOARD_PATH, fontFamily, borderRadius defaults
    ├── reportWebVitals.js
    ├── vite-env.d.js         # `vite/client` + `vite-plugin-pwa/client` references
    ├── api/                  # Centralized HTTP client + SWR-based menu store
    ├── assets/               # SCSS + images (logo, auth backgrounds, user avatar)
    ├── contexts/             # ConfigContext (theme, persisted via localStorage)
    ├── feature/              # Feature/domain modules (Clean-Arch style)
    ├── hooks/                # Reusable React hooks
    ├── layout/               # MainLayout, MinimalLayout, Customization, …
    ├── menu-items/           # Sidebar menu definitions
    ├── routes/               # Router config + guards + ErrorBoundary
    ├── store/                # Theme constants only (NOT a state store)
    ├── themes/               # MUI theme: palette, typography, overrides
    ├── ui-component/         # Reusable presentational components
    ├── utils/                # Pure utilities (auth, color, password, image URL)
    └── views/                # Page-level components (dashboard, sample, utilities, auth pages)
```

### `src/api/`

| File      | Purpose                                                                                                                                                                                                                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.js`  | Centralized `fetch` wrapper. Builds headers (`Accept: application/json`, optional `Authorization: Bearer <token>`, JSON content-type unless `FormData`). Sends `credentials: 'include'` for HttpOnly refresh-cookie support (M1). On `401`, calls shared refresh queue (`authRefreshQueue.js`), retries the original request once, and only clears session when refresh fails (M2). Auth paths (`/auth/login`, `/login`, `/auth/logout`, `/auth/refresh`, `/auth/password-setup/complete`, `/auth/2fa/setup/start`, `/auth/2fa/setup/verify`, `/auth/otp/verify`) and `{ skipAuthRefresh: true }` bypass refresh. Throws on non-2xx with `error.status` and `error.data`. Session-expired dialog via `auth:session-expired` event. Reads base URL from `VITE_API_BASE_URL` (fallback `http://localhost:8000/api`). See [`backend/docs/login/m2-frontend-refresh-on-401-architecture.md`](../backend/docs/login/m2-frontend-refresh-on-401-architecture.md). |
| `authRefreshQueue.js` | **M2** — deduplicates concurrent refresh calls; exports `runAuthRefresh()`. |
| `menu.js` | Tiny SWR-based store for `isDashboardDrawerOpened`. Exposes `useGetMenuMaster()` (read) and `handlerDrawerOpen(value)` (write via `mutate`). Despite the file path, **no remote call is made** — the SWR fetcher just returns the initial state.                                                                                                           |

### `src/feature/`

Multiple feature folders exist (e.g. `management-user`, `management-zone`, `patrol`, `patrol-monitoring`, `anpr-monitoring`, `feature/authentication`, …). The tree below documents **`management-user`** as the reference Clean-Architecture example.

```
feature/management-user/
├── components/
│   ├── index.js                     # Barrel: UserTable, UserTableToolbar, UserProfileCard, UserContactCard
│   ├── user-table/
│   │   ├── UserTable.jsx
│   │   ├── UserTableHeader.jsx
│   │   ├── UserTableRow.jsx
│   │   └── UserTableToolbar.jsx
│   ├── user-view/
│   │   ├── UserContactCard.jsx
│   │   ├── UserProfileCard.jsx
│   │   └── UserInfoItem.jsx
│   └── user-add/
│       └── UserAddProfile.jsx
├── controllers/
│   ├── useUserController.js         # List page logic (pagination, filter, CRUD nav, delete)
│   ├── useUserViewController.js     # Single user load + back/edit nav
│   ├── useUserAddController.js      # Create user (validation, submit, success modal)
│   └── useUserFormController.js     # Edit user (load + update; password excluded)
├── datasources/
│   ├── userService.js               # Real HTTP service (calls api.get/post/patch/delete)
│   └── userDataSource.js            # Hard-coded mock dataset (NOT used by current views)
├── repositories/
│   └── userRepository.js            # Class wrapper; pagination + client-side filter helpers
├── styles/
│   ├── StyledPaper.js
│   ├── InfoContainer.js
│   └── IconStyle.js
└── views/
    ├── UserList.jsx
    ├── UserView.jsx
    ├── UserAdd.jsx                  # Imports unresolved components — see Section 13
    └── UserEdit.jsx                 # Imports unresolved components — see Section 13
```

The other feature folders vary in completeness. **`feature/authentication/`** — `datasources/authService.js` (logout, refresh, password setup, 2FA setup, OTP verify), `repositories/authRepository.js`, `controllers/useAuthController.js`, `controllers/usePasswordSetupController.js` (M4), `controllers/useTwoFactorSetupController.js` (M5), `controllers/useOtpController.js` (M5), `components/SessionExpiredDialog.jsx` (M2), `components/PasswordSetupForm.jsx` (M4), `components/OtpInput.jsx` / `TwoFactorSetupCard.jsx` (M5), `views/FirstLoginSetup.jsx` (M4), `views/SetupTwoFactor.jsx` / `VerifyOtp.jsx` (M5). Login UI in `views/pages/auth-forms/AuthLogin.jsx` branches to `/first-login/setup`, `/first-login/2fa`, or `/login/otp`. Routes: `/first-login/2fa`, `/login/otp` (**M5**).

**Patrol (`feature/patrol/`):** `views/PartrolHome.jsx` (sole patrol UI), `controllers/usePatrolController.js`, `repositories/patrolRepository.js`, `datasources/patrolService.js` ( **`/patrol-sessions`**, **`/checkpoint-events`**, **`/patrol-routes`** ), `services/geolocationService.js` (domain GPS — **`pwa/locationLogService`** + **`pwa/geolocationService`**), presentational `components/PatrolTracking.jsx`, and **`components/PatrolPwaStatusPanel.jsx`** (Dexie + sync-queue telemetry, 3s polling; **no** GPS start/stop). **Patrol ID contract:** Dexie **`patrolId`** and PWA sync **`patrolId`** must equal Laravel **`patrol_sessions.id`** (not legacy **`patrol-logs`**). GPS is orchestrated only from **`usePatrolController`** via **`startPatrolTracking`**, **`stopPatrolTracking`**, and **`capturePatrolLocationSnapshot`** in `services/geolocationService.js`. **`GET /zones`** for the guard zone dropdown is normalized in **`patrolService`** / **`PatrolRepository`** to an **array of zones** (see [Patrol zone list (`GET /zones`)](#patrol-zone-list-get-zones)); **`PartrolHome`** keeps a stable **`PatrolRepository`** instance via **`useRef`** so zone loading does not refetch in a loop.

### `src/pwa/` (PWA client infrastructure)

| File                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db.js`                    | Dexie database **`PatrolPWA`** (versions 1–4): stores **`location_logs`**, **`sync_queue`** (`payload`, `retryCount`, `lastAttempt`, **`resultStatus`**, **`errorMessage`**), **`patrol_sessions`**, **`notifications`**.                                                                                                                                                                                                  |
| `locationLogService.js`    | **`saveLocationLog`** — UUID id, lat/lng/accuracy/source/trackingState/speed/heading/**device `timestamp` (ms, strictly increasing per `patrolId`)**/syncStatus; enqueues matching **`sync_queue`** payload for `/pwa/sync`. Bumps duplicate GPS timestamps (+1 ms) so movement validation does not flag second-precision mobile fixes. Exports **`LOCATION_SOURCE`**, **`TRACKING_STATE`**, sync constants.                                                                                                                                                                                |
| `backgroundSyncService.js` | **`registerPwaSyncQueueBackgroundSync`** — registers Background Sync tag **`pwa-sync-queue`** when **`SyncManager`** is available (`navigator.serviceWorker.ready` → **`registration.sync.register`**).                                                                                                                                                                                                                    |
| `syncService.js`           | **`flushSyncQueue`** — serial flush via shared **`api.js`** (M2/M3 refresh-on-401 on `/pwa/sync` 401). Classified outcomes: **`resultStatus`** = `synced`, `duplicate_synced`, `validation_failed`, `conflict`, `failed`, `exhausted` (after **`MAX_SYNC_RETRY_COUNT`** = 5). Terminal rows skipped on auto-retry; **Retry Sync** calls **`resetTerminalSyncFailures()`** first. Stores **`errorMessage`** on failures. Updates **`location_logs.syncStatus`** on success/duplicate. **M3 tests:** `src/pwa/syncService.test.js`. |
| `useNetworkStatus.js`      | React hook: **`navigator.onLine`** + **`online`**/**`offline`** events; on **`online`** calls **`flushSyncQueue()`** (errors contained).                                                                                                                                                                                                                                                                                   |
| `geolocationService.js`    | **Browser-only** helpers: **`getCurrentPosition`**, **`watchPosition`**, **`clearWatch`**, **`normalizeGeolocationError`**, **`DEFAULT_GEOLOCATION_OPTIONS`**. No IndexedDB.                                                                                                                                                                                                                                               |

### `src/components/NetworkSnackbar.jsx`

Global MUI **`Snackbar`** + **`Alert`** (mounted from **`App.jsx`**) — warns when offline, confirms when back online. Uses **`useNetworkStatus`** from `pwa/useNetworkStatus.js`.

### `src/views/`

Page-level components rendered by routes:

| Folder / file                              | Purpose                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard/Default/`                       | Re-exports `feature/dashboard/views/DashboardHome` (M10 operational dashboard; Berry ApexCharts widgets removed). |
| `pages/authentication/Login.jsx`           | Login page wrapper (uses `AuthWrapper1`, `AuthCardWrapper`).                                                                                         |
| `pages/authentication/Register.jsx`        | Register page wrapper.                                                                                                                               |
| `pages/auth-forms/AuthLogin.jsx`           | The actual login form — wired to `api.post('/auth/login')` with legacy `/login` fallback on 404. |
| `pages/auth-forms/AuthRegister.jsx`        | Static register form (no submit handler).                                                                                                            |
| `pages/authentication/AuthWrapper1.jsx`    | Styled `<div>` background for auth pages.                                                                                                            |
| `pages/authentication/AuthCardWrapper.jsx` | `MainCard` wrapper used on auth pages.                                                                                                               |
| `sample-page/index.jsx`                    | Berry sample page (lorem ipsum card).                                                                                                                |
| `utilities/Typography.jsx`                 | Typography showcase.                                                                                                                                 |
| `utilities/Color.jsx`                      | Color showcase.                                                                                                                                      |
| `utilities/Shadow.jsx`                     | Shadow showcase.                                                                                                                                     |

### `src/layout/`

| Folder / file                  | Purpose                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MainLayout/index.jsx`         | Sticky AppBar header, sidebar, breadcrumbs (`ui-component/extended/Breadcrumbs`), `<Outlet />`, footer, `Customization` drawer.                                      |
| `MainLayout/Header/`           | Logo, drawer toggle button, `NotificationSection`, `ProfileSection`. (`SearchSection` is commented out.)                                                             |
| `MainLayout/Sidebar/`          | Drawer + mini drawer + `MenuList` + (empty) `MenuCard` + `SidebarPwaInstall` (PWA install CTA when supported).                                                       |
| `MainLayout/MenuList/`         | `NavGroup`, `NavItem`, `NavCollapse` — render the menu tree from `getMenuItemsForRole(getAuthUserRole())`.                                                                                      |
| `MainLayout/HorizontalBar.jsx` | Alternate horizontal menu bar (defined but **not mounted** by `MainLayout`).                                                                                         |
| `MainLayout/Footer.jsx`        | Static footer with CodedThemes / GitHub / Figma links.                                                                                                               |
| `MinimalLayout/index.jsx`      | Bare layout (just `<Outlet />`) used by guest pages.                                                                                                                 |
| `Customization/`               | Right-side drawer for live theme tweaks: `FontFamily`, `BorderRadius`. The Fab toggle is currently commented out, so the drawer is mounted but has no UI to open it. |
| `NavigationScroll.jsx`         | Smooth-scrolls to top once on mount.                                                                                                                                 |

### `src/ui-component/`

Reusable presentational components.

| File                                                                                                | Purpose                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Loadable.jsx`                                                                                      | HOC that wraps lazy-loaded route components in `<Suspense fallback={<Loader />}>`.                                                                                                                                                                          |
| `Loader.jsx`                                                                                        | Top-of-page `LinearProgress` indicator.                                                                                                                                                                                                                     |
| `Logo.jsx`                                                                                          | App logo (Berry SVG).                                                                                                                                                                                                                                       |
| `MalaysiaTime.jsx`                                                                                  | Formats a date in `Asia/Kuala_Lumpur` time zone using `Intl.DateTimeFormat` (`en-MY`, `dateStyle: 'medium'`, `timeStyle: 'short'`). Expects API datetimes as ISO-8601 UTC strings from Laravel (`PatrolSessionResource`); renders a `fallback` when value is missing/invalid. Used for patrol monitoring **`started_at`** / **`ended_at`** and legacy **`time_start`** / **`time_end`** aliases.                                                                     |
| `cards/MainCard.jsx`                                                                                | Standard card with header / divider / content slots.                                                                                                                                                                                                        |
| `cards/DetailCard.jsx`                                                                              | Variant of `MainCard` with built-in “Back” button (used by user view/add/edit).                                                                                                                                                                             |
| `cards/SubCard.jsx`, `cards/AuthFooter.jsx`, `cards/CardSecondaryAction.jsx`                        | Berry card variants.                                                                                                                                                                                                                                        |
| `cards/TotalIncomeDarkCard.jsx`, `cards/TotalIncomeLightCard.jsx`                                   | Dashboard income widgets.                                                                                                                                                                                                                                   |
| `cards/Skeleton/*`                                                                                  | MUI Skeleton placeholders for the dashboard widgets.                                                                                                                                                                                                        |
| `extended/AnimateButton.jsx`                                                                        | Framer-motion-driven button animations.                                                                                                                                                                                                                     |
| `extended/Transitions.jsx`                                                                          | MUI `Grow`/`Fade` transitions used by popovers.                                                                                                                                                                                                             |
| `extended/Breadcrumbs.jsx`                                                                          | Auto-generated breadcrumbs from `menu-items` + current path.                                                                                                                                                                                                |
| `extended/Avatar.jsx`, `extended/AppBar.jsx`, `extended/Accordion.jsx`, `extended/ImageList.jsx`    | Berry MUI extensions.                                                                                                                                                                                                                                       |
| `extended/Form/CustomFormControl.jsx`, `FormControl.jsx`, `FormControlSelect.jsx`, `InputLabel.jsx` | Styled form controls used by login form / Berry pages.                                                                                                                                                                                                      |
| `table/PaginationFooter.jsx`                                                                        | Generic “rows per page + page index + MUI Pagination” footer (used by management and monitoring lists).                                                                                                                                                   |
| `table/TableActionButtons.jsx`                                                                      | Shared View / Edit / Delete icon-button group for management tables.                                                                                                                                                                                        |
| `table/TableEmptyRow.jsx`                                                                           | Centered empty-state row inside a table body.                                                                                                                                                                                                               |
| `table/tableStyles.js`                                                                              | Shared Paper/header/row sx tokens for standardized tables.                                                                                                                                                                                                  |
| `LiveIndicator.jsx`                                                                                 | Blinking red dot live status indicator (tooltip only; used by ANPR and Patrol Monitoring).                                                                                                                                                                  |
| `state/ListLoadingSkeleton.jsx`                                                                     | M5-style skeleton list placeholder (patrol monitoring initial load).                                                                                                                                                                                        |
| `state/ContentEmptyState.jsx`                                                                       | Contextual empty state panel with optional action.                                                                                                                                                                                                          |
| `state/ContentErrorState.jsx`                                                                       | Error alert with optional retry button.                                                                                                                                                                                                                     |
| `third-party/SimpleBar.jsx`                                                                         | Wrapper around `simplebar-react` for custom scrollbars. Renders `BrowserView` (SimpleBar) and `MobileView` (plain `Box`) — **the main layout sidebar on small screens does not use this** for the menu scroller; see `layout/MainLayout/Sidebar/index.jsx`. |

### `src/hooks/`

| Hook                                 | Purpose                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useConfig`                          | Implemented in `contexts/ConfigContext.jsx` and re-exported as default from `hooks/useConfig.js`. Returns `{ state, setState, setField, resetState }`. If React context cannot be resolved (e.g. duplicate React bundles in edge builds), logs a **one-time warning** and returns **non-persistent defaults** so the app still renders instead of throwing. |
| `useLocalStorage(key, defaultValue)` | Generic `useState`-backed local-storage hook with `setField` and `resetState` helpers. Backs `ConfigContext`.                                                                                                                                                                                                                                               |
| `useMenuCollapse`                    | Walks the menu tree and auto-expands the parent menu of the current pathname (uses `react-router-dom#matchPath`).                                                                                                                                                                                                                                           |
| `useScriptRef`                       | Tiny `useRef` helper that flips to `false` after mount; used to guard async state updates after unmount.                                                                                                                                                                                                                                                    |
| `usePwaInstallPrompt`                | Listens for `beforeinstallprompt` / `appinstalled`, tracks standalone mode (`matchMedia`, `navigator.standalone`), exposes `showInstallButton` and `promptInstall`. Safe on browsers without PWA install APIs (guarded `matchMedia` / legacy `MediaQueryList.addListener`).                                                                                 |

### `src/utils/`

| File                   | Purpose                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth.js`              | Token storage utilities. Exports `AUTH_TOKEN_KEY = 'access_token'`, `getAuthToken`, `hasAuthToken`, `setAuthToken`, `clearAuthToken`. **M2:** in-memory token cache (localStorage fallback for route guards); `markSessionExpired` / `consumeSessionExpiredFlag` for session-expired UX. |
| `colorUtils.js`        | `hexToRgbChannel`, `extendPaletteWithChannels`, `withAlpha` — hex→rgb channel string and CSS-var-aware alpha handling for the MUI palette. |
| `getImageUrl.js`       | Builds an `import.meta.url`-relative image path (`/src/assets/images/<path>/<name>`).                                                      |
| `password-strength.js` | Pure scoring functions used by the (static) Register form: `strengthIndicator`, `strengthColor`.                                           |

### `src/contexts/`

| File                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ConfigContext.jsx` | Defines `ConfigContext`, `ConfigProvider`, and **`useConfig`** in one module so provider and hook always share the same context identity. Persists Berry UI prefs via `useLocalStorage('berry-config-vite-js', appConfig)`. Default context uses a **sentinel** (`Symbol`) so “outside provider” is distinguishable from legitimate values; **fallback path** avoids crashing when duplicate React copies break `useContext`. |

### `src/store/`

Despite the name, this is **not** a state-management store.

| File          | Purpose                                                                         |
| ------------- | ------------------------------------------------------------------------------- |
| `constant.js` | Constants only: `gridSpacing = 3`, `drawerWidth = 260`, `appDrawerWidth = 320`. |

### `src/themes/`

MUI theme definition.

| File                 | Purpose                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.jsx`          | Builds the MUI theme using `createTheme` with `colorSchemes.light` and CSS variables (`cssVarPrefix`, `colorSchemeSelector: 'data-color-scheme'`). Composes palette, typography, custom shadows, and component overrides. |
| `palette.jsx`        | `buildPalette(presetColor)` — builds the palette from preset color sets.                                                                                                                                                  |
| `typography.jsx`     | Builds typography from a chosen `fontFamily`.                                                                                                                                                                             |
| `custom-shadows.jsx` | Custom MUI shadow tokens.                                                                                                                                                                                                 |
| `theme/default.js`   | Default named color tokens (primary/secondary/success/error/orange/warning/grey + dark variants).                                                                                                                         |
| `overrides/*.jsx`    | Per-component MUI overrides (Button, Chip, Paper, Tabs, …).                                                                                                                                                               |

### `src/menu-items/`

Role-aware navigation is built from **`getMenuItemsForRole.js`**, not the legacy static `index.js` aggregate. **`MenuList`** and **`Breadcrumbs`** call `getMenuItemsForRole(getAuthUserRole())`.

| File                      | Purpose                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getMenuItemsForRole.js`  | **Primary** — returns `{ items: [...] }` per role: Guard → dashboard + guard; Security Operator → dashboard + patrol home + operator monitoring subset; Admin → dashboard + patrol home + operator + admin. |
| `dashboard.js`            | Dashboard group → `/dashboard`.                                                                                                                                      |
| `patrolHome.js`           | Patrol Home → `/patrol` (Admin + Security Operator).                                                                                                                 |
| `guard.js`                | Guard-only patrol entry.                                                                                                                                             |
| `operator.js`             | Operator group: Patrol Monitoring, ANPR Monitoring, legacy live/history (live/history **Admin-only** at route level).                                              |
| `admin.js`                | Admin group: Blockchain Monitoring, Management collapse (**User**, **Zone**, **Camera**, **Vehicle**), Auth Monitoring. Checkpoint menu entry remains commented out. |
| `index.js`                | Legacy Berry aggregate `[dashboard, admin, pages, utilities, other]` — **not** used by `MenuList` today.                                                           |
| `pages.js`, `utilities.js`, `other.js` | Legacy Berry demo links — not in role-filtered menus.                                                                                                    |

### `src/assets/`

| Path                                     | Purpose                                                                                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `scss/style.scss`                        | Global styles (apexcharts theming, keyframes for `wings`, `bounce`, `slideX/Y`, `blink`). Imports `simplebar-react/dist/simplebar.min.css`. |
| `images/logo.svg`, `logo-dark.svg`       | App logo.                                                                                                                                   |
| `images/auth/*.svg`                      | Authentication background patterns (light + dark).                                                                                          |
| `images/users/user-round.svg`            | Default user avatar for the profile chip.                                                                                                   |
| `images/icons/google.svg`, `earning.svg` | Misc icons.                                                                                                                                 |

---

## 4. Routing Documentation

Routing uses **React Router v7** object routes via `createBrowserRouter`. The `basename` is normalized from `VITE_APP_BASE_NAME` (default `/` in the current `.env`; trailing slashes are stripped for subpaths such as `/fyp`).

### Top-Level Tree

```jsx
const router = createBrowserRouter([MainRoutes, AuthenticationRoutes], {
  basename: normalizeRouterBaseName(import.meta.env.VITE_APP_BASE_NAME)
});
```

| Group                  | Path | Wrapper            | Layout          |
| ---------------------- | ---- | ------------------ | --------------- |
| `MainRoutes`           | `/`  | `<ProtectedRoute>` | `MainLayout`    |
| `AuthenticationRoutes` | `/`  | `<GuestRoute>`     | `MinimalLayout` |

> Both groups declare `path: '/'`. React Router resolves child routes by their `path` segments, and the route guards (`ProtectedRoute` / `GuestRoute`) decide which group is reachable for the current visitor.

### Public (Guest) Routes

Defined in `src/routes/AuthenticationRoutes.jsx`. Wrapped in `GuestRoute` — authenticated users are redirected to their **role default route** (see [Role-based access](#role-based-access-milestone-6)).

| Path              | Component                             | Layout          | Purpose                                                    |
| ----------------- | ------------------------------------- | --------------- | ---------------------------------------------------------- |
| `/login`          | `views/pages/authentication/Login`    | `MinimalLayout` | Email/password login; branches to setup/2FA/OTP routes.    |
| `/first-login/setup` | `feature/authentication/views/FirstLoginSetup` | `MinimalLayout` | **M4** — first-login password setup (setup token via route state only). |
| `/first-login/2fa` | `feature/authentication/views/SetupTwoFactor` | `MinimalLayout` | **M5** — mandatory TOTP enrollment (setup token via route state only; local QR via `qrcode.react`). |
| `/login/otp`      | `feature/authentication/views/VerifyOtp` | `MinimalLayout` | **M5** — login OTP challenge (challenge ID via route state only). |
| `/pages/login`    | _redirect_                            | `MinimalLayout` | `<Navigate to="/login" replace />` (legacy compatibility). |
| `/pages/register` | `views/pages/authentication/Register` | `MinimalLayout` | Static register page (UI only).                            |

### Protected Routes

Defined in `src/routes/MainRoutes.jsx`. Wrapped in `ProtectedRoute` — unauthenticated visitors are redirected to `/login` (with `state.from = location`).

| Path                                              | Component                                | Layout       | Purpose                                                         |
| ------------------------------------------------- | ---------------------------------------- | ------------ | --------------------------------------------------------------- |
| `/`                                               | `RoleHomeRedirect`                       | `MainLayout` | Role-based home redirect.                                       |
| `/forbidden`                                      | `views/errors/Forbidden`                 | `MainLayout` | 403 page with link to role home.                                |
| `/dashboard`                                      | `feature/dashboard/views/DashboardHome` (via `views/dashboard/Default`) | `MainLayout` | **All roles** — operational home dashboard (M10).                          |
| `/patrol`                                         | `feature/patrol/views/PartrolHome`       | `MainLayout` | **All roles** — guard patrol PWA page.                          |
| `/account/profile`                                | `feature/profile/views/ProfilePage`      | `MainLayout` | **All roles** — Account Settings (M6): Profile Summary (`tab=profile`) and Security Settings (`tab=security`) tabs; contact update (M12 offline queue), picture (M10), push notifications (M6), sensitive actions + sessions (M11). |
| `/account/security`                               | _redirect_                               | `MainLayout` | `<Navigate to="/account/profile?tab=security" replace />` (M6 compatibility). |
| `/guard/patrol`                                   | _redirect_                               | `MainLayout` | `<Navigate to="/patrol" replace />` (legacy).                   |
| `/admin/management-user`                          | `feature/management-user/views/UserList` | `MainLayout` | **Admin only** — user list.                                     |
| `/admin/management-user/view/:userId`             | `feature/management-user/views/UserView` | `MainLayout` | **Admin only**.                                                 |
| `/admin/management-zone`                          | `feature/management-zone/views/ZoneList` | `MainLayout` | **Admin only** — zone list (search, pagination).                |
| `/admin/management-zone/add`                      | `feature/management-zone/views/ZoneAdd`  | `MainLayout` | **Admin only** — create zone.                                   |
| `/admin/management-zone/edit/:zoneId`             | `feature/management-zone/views/ZoneEdit` | `MainLayout` | **Admin only** — edit zone.                                     |
| `/admin/management-zone/view/:zoneId`             | `CheckpointList` (zone-scoped)           | `MainLayout` | **Admin only** — zone profile + checkpoints in zone.            |
| `/admin/management-checkpoint`                    | `CheckpointList`                         | `MainLayout` | **Admin only** — global checkpoint list (search, filters).      |
| `/admin/management-checkpoint/create`             | `CheckpointCreate`                       | `MainLayout` | **Admin only** — create with map picker.                        |
| `/admin/management-checkpoint/:checkpointId`      | `CheckpointView`                         | `MainLayout` | **Admin only** — detail + read-only map.                        |
| `/admin/management-checkpoint/:checkpointId/edit` | `CheckpointEdit`                         | `MainLayout` | **Admin only** — edit (zone from checkpoint).                   |
| `/admin/patrol-monitoring`                        | `PatrolMonitoringDashboard`              | `MainLayout` | **Admin + Security Operator**.                                  |
| `/admin/patrol-monitoring/:patrolSessionId`       | `PatrolSessionDetail`                    | `MainLayout` | **Admin + Security Operator**.                                  |
| `/admin/anpr-monitoring`                          | `AnprEventList`                          | `MainLayout` | **Admin + Security Operator** — ANPR event list.                |
| `/admin/anpr-monitoring/:anprEventId`               | `AnprEventDetail`                        | `MainLayout` | **Admin + Security Operator** — ANPR event detail.              |
| `/admin/blockchain-monitoring`                      | `BlockchainDashboard`                    | `MainLayout` | **Admin only** — blockchain proof monitoring.                   |
| `/admin/blockchain-monitoring/:blockchainRecordId`  | `BlockchainRecordDetail`                 | `MainLayout` | **Admin only** — record detail, verify/retry/refresh.           |
| `/admin/auth-monitoring`                            | `AuthMonitoringDashboard`              | `MainLayout` | **Admin only** — auth audit logs + cross-user sessions.         |
| `/admin/management-vehicle` (+ view)                | `VehicleList` / `VehicleDetail`          | `MainLayout` | **Admin only** — vehicle registry.                              |
| `/admin/management-camera`                          | `CameraList`                             | `MainLayout` | **Admin only** — camera credential management (M4).             |
| `/operator/patrol/live-tracking`                    | `PatrolLiveList`                         | `MainLayout` | **Admin only** — legacy operator live patrol list.              |
| `/operator/patrol/history` (+ view)                 | `PatrolHistoryList` / `PatrolHistoryView`| `MainLayout` | **Admin only** — legacy operator patrol history.                |
| `/typography`                                     | `views/utilities/Typography`             | `MainLayout` | Typography showcase.                                            |
| `/color`                                          | `views/utilities/Color`                  | `MainLayout` | Color showcase.                                                 |
| `/shadow`                                         | `views/utilities/Shadow`                 | `MainLayout` | Shadow showcase.                                                |
| `/sample-page`                                    | `views/sample-page`                      | `MainLayout` | Berry sample page.                                              |

### Admin Routes

Admin namespace routes under `/admin/*` use **`RoleProtectedRoute`** (JWT + role). Management routes are **Admin-only**; patrol monitoring is **Admin + Security Operator**.

| Path                                                  | Component                              | Allowed roles            |
| ----------------------------------------------------- | -------------------------------------- | ------------------------ |
| `/admin/management-user` (+ view/add/edit)            | User management                        | Admin                    |
| `/admin/management-zone` (+ add/edit)                 | Zone management                        | Admin                    |
| `/admin/management-zone/view/:zoneId`                 | Zone detail + embedded checkpoint list | Admin                    |
| `/admin/management-checkpoint` (+ create, view, edit) | Checkpoint management                  | Admin                    |
| `/admin/patrol-monitoring`                            | `PatrolMonitoringDashboard`            | Admin, Security Operator |
| `/admin/patrol-monitoring/:patrolSessionId`           | `PatrolSessionDetail`                  | Admin, Security Operator |
| `/admin/anpr-monitoring`                              | `AnprEventList`                        | Admin, Security Operator |
| `/admin/anpr-monitoring/:anprEventId`                 | `AnprEventDetail`                      | Admin, Security Operator |
| `/admin/blockchain-monitoring` (+ record detail)      | Blockchain monitoring                  | Admin                    |
| `/admin/auth-monitoring`                              | Auth audit + sessions                  | Admin                    |
| `/admin/management-vehicle` (+ view)                  | Vehicle management                     | Admin                    |
| `/admin/management-camera`                            | Camera management                      | Admin                    |
| `/operator/patrol/live-tracking`, `/operator/patrol/history` | Legacy operator patrol views   | Admin                    |

### Role-based access (Milestone 6)

Seeded backend roles: **Admin**, **Security Operator**, **Guard**.

| Role                  | Routes                                                                   | Sidebar menu (`getMenuItemsForRole`)                                                   | Default home               |
| --------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------- |
| **Admin**             | Dashboard, all `/admin/*` management, patrol monitoring, ANPR monitoring, blockchain/auth monitoring, `/patrol`, operator live/history | Dashboard + Patrol Home + Operator (Patrol Monitoring, ANPR Monitoring, live/history) + Admin (Management, Blockchain, Auth Monitoring) | `/dashboard` |
| **Security Operator** | `/dashboard`, `/admin/patrol-monitoring` (+ session detail), `/admin/anpr-monitoring` (+ event detail), `/patrol`                   | Dashboard + Operator → **Patrol Monitoring**, **ANPR Monitoring** + Patrol Home                         | `/dashboard` |
| **Guard**             | `/dashboard`, `/patrol` (no patrol monitoring)                                         | Dashboard + Guard → Patrol                                                                         | `/dashboard`                  |

**Utilities:** `src/utils/auth.js` — `getAuthSessionState()` (M8 central resolver), `getAuthUser()`, `getAuthUserRole()`, `hasRole()`, `hasAnyRole()`, `ALL_ROLES`, `getDefaultRouteForRole()`, `validateAuthSession()`, `isAuthUserTwoFactorEnabled()`, `clearAuthSession()` (clears `access_token` + `auth_user`). See [`../backend/docs/login/m8-route-guards-role-policies-and-middleware-hardening.md`](../backend/docs/login/m8-route-guards-role-policies-and-middleware-hardening.md).

**Role resolution** supports `auth_user.role.name`, `auth_user.role` (string), and `auth_user.role_name`.

**Invalid session:** token without parseable `auth_user`, `setup_required = true`, or `two_factor_enabled !== true` (missing, `false`, `null`, or stale pre-M5 values) → `clearAuthSession()` → `/login`.

Protected frontend sessions require **`two_factor_enabled === true`**. Missing or non-true values are treated as invalid and cleared.

### Route Guards

Guards live in `src/routes/guards/`.

#### `ProtectedRoute`

Wraps `MainLayout` — uses `getAuthSessionState()` (M8). Requires `reason === 'valid'` (token, parseable `auth_user`, `setup_required !== true`, `two_factor_enabled === true`, canonical role).

#### `RoleProtectedRoute`

Props: `allowedRoles` (array), `children`. Uses `getAuthSessionState()` for session checks.

- No token → `/login`
- Incomplete/invalid session → `clearAuthSession()` → `/login` (with optional `setupRequired` / `twoFactorRequired` state)
- Role not in `allowedRoles` → `/forbidden`

#### `RoleHomeRedirect`

`/` index route — uses `getAuthSessionState()`; valid sessions redirect to `getDefaultRouteForRole()`.

#### `GuestRoute`

Uses `getAuthSessionState()`. Valid session → role default route. Any non-valid state except `missing_token` clears persisted auth (including token-only stale sessions) before rendering the guest page.

### Redirect Behavior Summary

| Trigger               | Result                                                      |
| --------------------- | ----------------------------------------------------------- |
| `/` (no token)        | `ProtectedRoute` → `/login`.                                |
| `/` (with token)      | `RoleHomeRedirect` → role default.                          |
| `/login` (with token) | `GuestRoute` → role default.                                |
| Wrong role for route  | `RoleProtectedRoute` → `/forbidden`.                        |
| `/pages/login`        | Always redirected to `/login`.                              |
| API protected request responds `401` | Refresh-on-401 via `runAuthRefresh()` + retry once; refresh failure or retried `401` → clear auth state + session-expired UX + `/login`. |

### Unauthorized / Error Handling

`src/routes/ErrorBoundary.jsx` defines a `react-router` `ErrorBoundary` that maps `error.status` to MUI alerts (`404`, `401`, `503`, `418`, falls back to “Under Maintenance”). However, **it is not currently registered** on either route group via `errorElement`, so router-level errors fall back to the default React Router boundary. See [Section 13](#13-known-issues--technical-debt).

---

## 5. API Integration

### Base URL Setup

`src/api/api.js`:

```4:4:src/api/api.js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
```

The base URL is read from `VITE_API_BASE_URL` (see [Section 10](#10-configuration)) with `http://localhost:8000/api` as a hard-coded fallback. Vite's `base` is independently set from `VITE_APP_BASE_NAME` in `vite.config.mjs` (used as the SPA's public path).

### HTTP Client

The frontend uses the **native `fetch` API** wrapped in a small client. **Axios is not used.**

`src/api/api.js` exposes:

```js
const api = {
  get: (url, options) => request('GET', url, undefined, options),
  post: (url, data, options) => request('POST', url, data, options),
  put: (url, data, options) => request('PUT', url, data, options),
  patch: (url, data, options) => request('PATCH', url, data, options),
  delete: (url, options) => request('DELETE', url, undefined, options)
};
```

Behavior of `request()`:

1. **Headers** built by `buildHeaders()`:
   - Always: `Accept: application/json`.
   - If `getAuthToken()` returns a value: `Authorization: Bearer <token>`.
   - If body is **not** `FormData` and a body is being sent: `Content-Type: application/json`.
   - Caller-supplied headers are merged in.
2. **Body** is auto-serialized (`JSON.stringify`) unless it is `FormData`.
3. **Response parsing**:
   - If `Content-Type` includes `application/json` → parse JSON; else `await response.text()`.
4. **Error handling**:
   - Protected `401` → `runAuthRefresh()` (shared queue) → retry original request once with updated token; refresh failure or retried `401` → `clearAuthSession()`, session-expired flag/dialog, redirect to `/login`.
   - Auth paths (`/auth/login`, `/login`, `/auth/logout`, `/auth/refresh`) and `{ skipAuthRefresh: true }` bypass refresh-on-401.
   - Other non-`ok` → throws `Error('API request failed')` with `error.status` and `error.data` attached.
5. **Success return shape**: `{ data, status, headers }`.

### API Service Structure

Per-feature services wrap `api.*` calls and normalize responses. `userService` and `zoneService` are implemented.

`src/feature/management-user/datasources/userService.js`:

| Method                     | HTTP call                            | Notes                                         |
| -------------------------- | ------------------------------------ | --------------------------------------------- |
| `getAllUsers()`            | `api.get('/users')`                  | Throws a normalized service error on failure. |
| `getRoles()`               | `api.get('/roles')`                  | Used by User Add/Edit to populate `role_id` options. |
| `getUserById(id)`          | `api.get('/users/{id})`              |                                               |
| `createUser(userData)`     | `api.post('/users', userData)`       |                                               |
| `updateUser(id, userData)` | `api.patch('/users/{id}', userData)` |                                               |
| `deleteUser(id)`           | `api.delete('/users/{id}')`          |                                               |

It also normalizes errors via `buildServiceError()`:

- Reads `error.status` + `error.data?.message`.
- Maps `401` → "Unauthorized. Please log in again." and `403` → "Forbidden. Admin access is required."
- Re-throws an `Error` with `status`, `data`, and `originalError` attached.

`extractResponsePayload(response)` then returns `response.data` (the parsed JSON body), so callers receive the raw backend payload.

`src/feature/management-zone/datasources/zoneService.js`:

| Method                     | HTTP call                            | Notes                                                           |
| -------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `getAllZones(params)`      | `api.get('/zones')`                  | Query: `page`, `per_page`, `search`, `sort`. Returns parsed backend payload. |
| `getZoneById(id)`          | `api.get('/zones/{id}')`             |                                                                 |
| `createZone(zoneData)`     | `api.post('/zones', zoneData)`       | Admin-only route on backend.                                    |
| `updateZone(id, zoneData)` | `api.patch('/zones/{id}', zoneData)` | Uses PATCH to match Laravel `PUT/PATCH` update route.           |
| `deleteZone(id)`           | `api.delete('/zones/{id}')`          | Handles backend `204 No Content` responses safely.              |

Like `userService`, `zoneService` maps `401` and `403` to user-friendly service errors (`Unauthorized...` / `Forbidden...`) and rethrows with `status`, `data`, and `originalError`.

`src/feature/patrol/datasources/patrolService.js` (via **`PatrolRepository`** / **`usePatrolController`**):

| Method                      | HTTP call                             | Notes                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAllZones`               | `GET /zones`                          | Shared zones list for starting a patrol. Returns **`normalizeZonesResponse(response.data)`** — an **array** of zone objects (see below). Not the same as **`zoneService.getAllZones`**, which returns the raw JSON body for admin screens.                                                                                                               |
| `createPatrol`              | `POST /patrol-sessions`               | Creates **`patrol_sessions`** row; sends **`time_start`** as ISO-8601 UTC (`toISOString()`); maps to Laravel **`started_at`**. Response normalized via **`normalizePatrolSessionRecord`** (aliases **`started_at` ↔ `time_start`**, **`ended_at` ↔ `time_end`**). Returned **`id`** is **`patrolId`** for PWA location logs + **`POST /pwa/sync`**. **`usePatrolController.handleStartPatrol`** syncs form state from the API response timestamp after create. |
| `updatePatrol`              | `PUT /patrol-sessions/{id}`           | Maps `time_end` → **`ended_at`**, lifecycle **`status`** → Laravel enums (`in_progress` → **`active`**, **`cancelled`** → **`aborted`**).                                                                                                                                                                                                                |
| `getAllCheckpointsByZoneId` | `GET /checkpoints?zone_id={id}`       | Checkpoints for the selected zone.                                                                                                                                                                                                                                                                                                                       |
| `createCheckpointLog`       | `POST /checkpoint-events`             | Placeholder rows **`pending`** (`patrol_session_id`, `checkpoint_id`). Response normalized to pseudo checkpoint-log shape for UI.                                                                                                                                                                                                                        |
| `updateCheckpointLog`       | `PATCH /checkpoint-events/{id}`       | **Provisional** during patrol: continuous geofence sends **`verified`**, **`detected_at`**, **`detection_type: continuous`**, **`confidence_score: 80`**; resume sends **`detection_type: resume`**, **`confidence_score: 65`**, **`verified`** or **`uncertain`**. Authoritative scores come from backend validation (see **`validatePatrolSession`**). |
| `validatePatrolSession`     | `POST /patrol-sessions/{id}/validate` | Called from **`usePatrolController.completePatrol`** after **`flushSyncQueue()`** when online. Returns validation payload (`checkpoint_results`, gaps, anomalies). Backend is source of truth.                                                                                                                                                           |
| `getPatrolSummary`          | `GET /patrol-sessions/{id}/summary`   | Fetched **after** backend validation during stop patrol.                                                                                                                                                                                                                                                                                                 |
| `createPatrolRoute`         | `POST /patrol-routes`                 | **Deprecated.** SPA no longer dual-writes breadcrumbs; GPS persists only via Dexie `location_logs` → `POST /pwa/sync`. Method retained for legacy callers.                                                                                                                                                                                                |

#### Patrol zone list (`GET /zones`)

Laravel **`ZoneController@index`** returns **`{ success, message, data }`** where **`data`** is the paginator shape **`{ data: [...zones], links, meta }`**. **`patrolService.normalizeZonesResponse`** walks chained **`.data`** keys (bounded depth) until it reaches an **array**, so these shapes all yield a zone array: **`[]`**, **`{ data: [] }`**, **`{ data: { data: [], links, meta } }`**, **`{ success, message, data: { data: [] } }`**. **`PatrolRepository.getAllZones`** returns **`[]`** if the datasource ever returns a non-array. **`usePatrolController.loadZones`** maps zones to **`zoneOptions`**; on fetch failure it logs and sets **`zoneOptions`** to **`[]`** (empty dropdown, no crash).

**PWA offline sync** — `src/pwa/syncService.js` calls **`api.post('/pwa/sync', payload)`** with each **`sync_queue`** row’s **`payload`** (must align with backend **`SyncPwaLocationLogRequest`**: **`patrolId`** = **`patrol_sessions.id`**). Successful responses mark the queue row **`synced`** and, for **`location_log`** entries, set **`location_logs.syncStatus`** to **`synced`**. **M3:** When the access token is rejected (`401`), the shared **`api.js`** refresh-on-401 path retries sync once after **`POST /auth/refresh`**; refresh failure preserves Dexie queue/logs (see [`backend/docs/login/m3-patrol-token-expiry-safety.md`](../backend/docs/login/m3-patrol-token-expiry-safety.md)).

**`patrolRepository.createPatrolRoute`** is **deprecated** (warns on call). Movement for maps/replay comes from **`GET /patrol-routes`** (location_logs-backed) via **`patrolMonitoringRepository.getPatrolRoutes`** + **`patrolRoutePointUtils`**.

`src/feature/anpr-monitoring/datasources/anprMonitoringService.js` (via **`AnprMonitoringRepository`** / **`useAnprMonitoringController`**):

| Method              | HTTP call                                      | Notes                                                                                                                                                                                                 |
| ------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getAnprEvents`     | `GET /anpr-events`                             | Query: `page`, `per_page`, `plate_number`, `is_valid`, `is_flagged`, `sort` (`detection_time` default), `direction` (`desc` default) (built by `repository.buildListQueryParams`). Backend also supports `search`, `date_from`, `date_to`, `camera_id`, `since` when needed. |
| `getAnprEventById`  | `GET /anpr-events/{id}`                        | Primary detail source; includes safe nested `camera`, `vehicle`, `images`.                                                                                                                            |
| `getAnprImages`     | `GET /anpr-images`                             | Fallback when detail has no images (`anpr_event_id`, `per_page=100`).                                                                                                                               |

**Evidence previews:** `AnprImageResource` returns `url` / `image_url` pointing to `GET /anpr-images/{id}/file` when Laravel can resolve the stored path (upload mode uses `storage/app/anpr` by default). `AnprEvidenceGallery` fetches protected URLs with the JWT `Authorization` header and renders a blob preview; otherwise shows a placeholder. No event logs or raw metadata are rendered.

### Authentication Token Handling

- Token is stored in `localStorage` under the key `access_token` (`utils/auth.js#AUTH_TOKEN_KEY`) **after successful OTP or 2FA setup verification**.
- Every request automatically attaches the token via `buildHeaders` if present.
- The frontend stores the user object under `auth_user` after session completion (OTP/setup verify or legacy direct login).

### Request / Response Interceptors

There are **no axios-style interceptors**. Equivalent behavior is implemented inline inside `request()`:

- Pre-flight: `buildHeaders()` injects `Authorization`.
- Post-flight: protected `401` refresh-on-401 + single retry; content-type sniffing; structured error throwing.

### Error Handling Strategy

| Layer                                  | Behavior                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api.js`                               | Throws on non-2xx; carries `status` + `data`. Protected `401` → refresh-on-401 + single retry; refresh failure → session-expired UX + `/login`. |
| Service (`userService`)                | Catches the low-level error, maps to a friendlier message, re-throws as a normalized `Error`.                                                                   |
| Repository (`userRepository`)          | Logs to console and rethrows.                                                                                                                                   |
| Controller (`useUserController`, etc.) | `try/catch` around repository calls. On error: `console.error` + `window.alert(...)`.                                                                           |
| Login form                             | Extracts the most user-friendly message via `extractErrorMessage()` (Laravel-style `data.errors`, then `message`, then a generic fallback) and shows it inline. |

### API Utilities / Helpers

- `buildHeaders()` — builds request headers with optional token + JSON content-type.
- `request()` — central low-level fetch wrapper.
- `buildServiceError()` (per-service) — error normalization.
- `extractResponsePayload()` (per-service) — unwraps the `data` field from the `api.*` return value.

### Main Backend Endpoints Used

| Frontend caller                                 | Method   | Path                                                                                                      |
| ----------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| `AuthLogin` (primary)                           | `POST`   | `/auth/login`                                                                                             |
| `AuthLogin` (legacy fallback on 404)            | `POST`   | `/login`                                                                                                  |
| `authService.completePasswordSetup`             | `POST`   | `/auth/password-setup/complete`                                                                           |
| `authService.startTwoFactorSetup`               | `POST`   | `/auth/2fa/setup/start`                                                                                   |
| `authService.verifyTwoFactorSetup`              | `POST`   | `/auth/2fa/setup/verify`                                                                                  |
| `authService.verifyOtp`                         | `POST`   | `/auth/otp/verify`                                                                                        |
| `authService.refresh`                           | `POST`   | `/auth/refresh` (direct `fetch`, not `api.js`)                                                            |
| `authService.logout`                            | `POST`   | `/auth/logout`                                                                                            |
| `userService.getAllUsers`                       | `GET`    | `/users`                                                                                                  |
| `userService.getUserById`                       | `GET`    | `/users/{id}`                                                                                             |
| `userService.createUser`                        | `POST`   | `/users`                                                                                                  |
| `userService.updateUser`                        | `PATCH`  | `/users/{id}`                                                                                             |
| `userService.deleteUser`                        | `DELETE` | `/users/{id}`                                                                                             |
| `zoneService.getAllZones`                       | `GET`    | `/zones`                                                                                                  |
| `zoneService.getZoneById`                       | `GET`    | `/zones/{id}`                                                                                             |
| `zoneService.createZone`                        | `POST`   | `/zones`                                                                                                  |
| `zoneService.updateZone`                        | `PATCH`  | `/zones/{id}`                                                                                             |
| `zoneService.deleteZone`                        | `DELETE` | `/zones/{id}`                                                                                             |
| `patrolService` / repository                    | `GET`    | `/zones` (via patrol), `/checkpoints?zone_id=…`                                                           |
| `patrolService.createPatrol`                    | `POST`   | `/patrol-sessions`                                                                                        |
| `patrolService.updatePatrol`                    | `PUT`    | `/patrol-sessions/{id}`                                                                                   |
| `patrolService.createCheckpointLog`             | `POST`   | `/checkpoint-events`                                                                                      |
| `patrolService.updateCheckpointLog`             | `PATCH`  | `/checkpoint-events/{logId}`                                                                              |
| `patrolService.createPatrolRoute`               | `POST`   | `/patrol-routes`                                                                                          |
| `patrolService.getPatrolSummary`                | `GET`    | `/patrol-sessions/{id}/summary`                                                                           |
| `patrolService.validatePatrolSession`           | `POST`   | `/patrol-sessions/{id}/validate` — authoritative checkpoint validation (Milestone 2 wired on stop patrol) |
| `patrolMonitoringService.getPatrolSessions`     | `GET`    | `/patrol-sessions` — admin dashboard list (pagination, `status`, `zone_id`)                               |
| `patrolMonitoringService.getPatrolSessionById`  | `GET`    | `/patrol-sessions/{id}`                                                                                   |
| `patrolMonitoringService.getPatrolSummary`      | `GET`    | `/patrol-sessions/{id}/summary`                                                                           |
| `patrolMonitoringService.validatePatrolSession` | `POST`   | `/patrol-sessions/{id}/validate` — **Re-run Validation** on detail page                                   |
| `patrolMonitoringService.getCheckpointEvents`   | `GET`    | `/checkpoint-events?patrol_session_id={id}`                                                               |
| `patrolMonitoringService.getPatrolRoutes`       | `GET`    | `/patrol-routes?patrol_session_id={id}` — location_logs-backed movement points for map/replay (paginated; repository merges + normalizes) |
| `broadcastService` (Echo)                       | `POST`   | `/broadcasting/auth` — JWT private channel auth (Reverb WebSocket)                                        |
| `pushNotificationService` (subscribe)           | `POST`   | `/push-subscriptions`                                                                                     |
| `pushNotificationService` (unsubscribe)         | `DELETE` | `/push-subscriptions/{id}`                                                                                |
| `pushNotificationService.sendTestNotification`  | `POST`   | `/push-notifications/test`                                                                                |
| `syncService.flushSyncQueue`                    | `POST`   | `/pwa/sync`                                                                                               |

### Frontend ↔ Laravel Communication

- Token comes back as `data.access_token` from **OTP verify** or **2FA setup verify** responses (not from email/password login for M5 users).
- All subsequent calls send `Authorization: Bearer <token>` and `credentials: 'include'` for the HttpOnly refresh cookie.
- `Content-Type` is `application/json` for non-`FormData` requests; the backend Laravel API is JSON-first.
- The frontend assumes Laravel-style validation responses (`data.errors` or `errors` keyed by field with array of messages) when extracting login error messages.

---

## 6. Authentication & Authorization

**Login Module baseline (M0):** See [`../backend/docs/login/m0-auth-baseline-and-current-audit.md`](../backend/docs/login/m0-auth-baseline-and-current-audit.md) for the current JWT audit, protected API inventory, and migration path. Target design: [`../docs/login-module.md`](../docs/login-module.md).

**Login Module M1 (refresh sessions):** Laravel issues an HttpOnly refresh cookie on login and exposes `POST /api/auth/refresh`. The SPA sends `credentials: 'include'` on all API requests so the browser can store/send the cookie. `POST /api/auth/logout` is a **public** route: the backend revokes the refresh session from the HttpOnly cookie even when the JWT is missing or expired; the frontend still clears local state in `finally` regardless of network outcome. See [`../backend/docs/login/m1-laravel-session-foundation-and-refresh-tokens.md`](../backend/docs/login/m1-laravel-session-foundation-and-refresh-tokens.md).

**Login Module M2 (frontend refresh-on-401):** Protected API `401` responses trigger `runAuthRefresh()` → `POST /auth/refresh` → access-token update → single retry. See [`../backend/docs/login/m2-frontend-refresh-on-401-architecture.md`](../backend/docs/login/m2-frontend-refresh-on-401-architecture.md).

**Login Module M4 (first-login password setup):** Setup-required login returns `next_step=password_setup_required` without storing JWT; first-login setup at `/first-login/setup`. See [`../backend/docs/login/m4-first-login-password-setup.md`](../backend/docs/login/m4-first-login-password-setup.md).

**Login Module M5 (mandatory TOTP 2FA):** Login branches to `two_factor_setup_required` or `otp_required`; setup at `/first-login/2fa`, OTP at `/login/otp`. Tokens issued only after verify. See [`../backend/docs/login/m5-totp-two-factor-authentication.md`](../backend/docs/login/m5-totp-two-factor-authentication.md).

**Login Module M6 (rate limiting and lockout):** Login form displays backend lockout messages (**429**); password clears on **401** and **429**; `/auth/login` **429** does not trigger refresh. See [`../backend/docs/login/m6-rate-limiting-lockout-and-otp-protection.md`](../backend/docs/login/m6-rate-limiting-lockout-and-otp-protection.md).

**Login Module M7 (auth audit and session monitoring):** Admin route `/admin/auth-monitoring` lists audit logs and refresh sessions via `feature/auth-monitoring` (repository/controller/service pattern). Sensitive values (tokens, hashes, OTP, secrets) are not rendered. **Profile M14** extended the audit action filter dropdown with profile event types. See [`../backend/docs/login/m7-auth-audit-logs-and-session-monitoring.md`](../backend/docs/login/m7-auth-audit-logs-and-session-monitoring.md).

**Login Module M8 (route guards):** Central auth session resolver and role-aligned guards. See [`../backend/docs/login/m8-route-guards-role-policies-and-middleware-hardening.md`](../backend/docs/login/m8-route-guards-role-policies-and-middleware-hardening.md).

**Login Module M9 (security settings):** All initialized roles can open `/account/profile?tab=security` (profile → **Security Settings**) to view/revoke own sessions via `GET /auth/sessions?scope=mine`; reuses `feature/auth-monitoring` session components. `/account/security` redirects to the security tab (M6). Admin cross-user session management remains at `/admin/auth-monitoring` (no `scope=mine`). See [`../backend/docs/login/m9-security-settings-and-account-recovery-edge-cases.md`](../backend/docs/login/m9-security-settings-and-account-recovery-edge-cases.md).

**Login Module M10 (final hardening freeze):** M1–M9 auth regression coverage, umbrella tests, and manual demo checklist. See [`../backend/docs/login/m10-final-hardening-testing-and-documentation-freeze.md`](../backend/docs/login/m10-final-hardening-testing-and-documentation-freeze.md).

**Profile Module M0 (audit and architecture freeze):** M0 baseline audit and historical gap analysis (gaps since resolved in M1–M15) are documented in [`../backend/docs/profile/m0-profile-module-audit-and-architecture-freeze.md`](../backend/docs/profile/m0-profile-module-audit-and-architecture-freeze.md) and [`../docs/profile-module.md`](../docs/profile-module.md). **M8** implements the frontend foundation at `/account/profile`; see M8 note below.

**Profile Module M1 (backend data foundation only):** Backend adds `profile_change_tokens`, `ProfileChangeToken`, `config/profile.php`, and `users.last_security_changed_at`. No frontend changes in M1; at M1, Profile UI and `/account/profile` **were deferred to M8** (implemented in M8). See [`../backend/docs/profile/m1-profile-backend-data-foundation.md`](../backend/docs/profile/m1-profile-backend-data-foundation.md).

**Profile Module M2 (backend profile read/update API):** Backend exposes `GET /api/profile` and `PATCH /api/profile` for self-service phone/address updates. At M2, no frontend `feature/profile` or `/account/profile` route existed (added in M8). See [`../backend/docs/profile/m2-profile-backend-read-update-api.md`](../backend/docs/profile/m2-profile-backend-read-update-api.md).

**Profile Module M3 (backend profile picture upload):** Backend adds `POST /api/profile/picture` and `DELETE /api/profile/picture` only. At M3, no frontend profile picture UI, `feature/profile`, or `/account/profile` existed (M8–M10). See [`../backend/docs/profile/m3-profile-backend-profile-picture-upload.md`](../backend/docs/profile/m3-profile-backend-profile-picture-upload.md).

**Profile Module M5 (backend change password flow):** Backend adds `POST /api/profile/password/change` only. Frontend change-password dialog delivered in Profile M11. On success, the frontend clears auth and redirects to `/login`. See [`../backend/docs/profile/m5-profile-backend-change-password-flow.md`](../backend/docs/profile/m5-profile-backend-change-password-flow.md).

**Profile Module M6 (backend change email flow):** Backend adds `POST /api/profile/email/start` and `POST /api/profile/email/confirm` only. Frontend change-email dialog delivered in Profile M11. On confirm success, the frontend clears auth and redirects to `/login`. See [`../backend/docs/profile/m6-profile-backend-change-email-flow.md`](../backend/docs/profile/m6-profile-backend-change-email-flow.md).

**Profile Module M7 (backend 2FA reconfiguration):** Backend adds `POST /api/profile/2fa/reconfigure/start` and `POST /api/profile/2fa/reconfigure/verify` only. Frontend 2FA reconfiguration dialog delivered in Profile M11. The frontend **must not** expose a disable 2FA option. On verify success, the frontend clears auth and redirects to `/login`. See [`../backend/docs/profile/m7-profile-backend-2fa-reconfiguration.md`](../backend/docs/profile/m7-profile-backend-2fa-reconfiguration.md).

**Profile Module M8 (frontend profile foundation):** `feature/profile` is implemented with `/account/profile` for all initialized roles (Admin, Security Operator, Guard). Header **Account Settings** routes to `/account/profile`; **Security Settings** routes to `/account/profile?tab=security` (M6). See [`../backend/docs/profile/m8-frontend-profile-foundation.md`](../backend/docs/profile/m8-frontend-profile-foundation.md).

**Profile Module M9 (frontend profile view and non-sensitive update):** `/account/profile` displays a full profile summary and allows self-service `phone`/`address` updates with `profile_version` concurrency, validation errors, `409` conflict handling, `auth_user` sync, and cross-tab profile events. Sensitive-change dialogs delivered in M11; offline queue in M12. See [`../backend/docs/profile/m9-frontend-profile-view-and-non-sensitive-update.md`](../backend/docs/profile/m9-frontend-profile-view-and-non-sensitive-update.md).

**Profile Module M10 (frontend profile picture UI):** `/account/profile` adds `ProfilePictureUploader` for preview, upload (`POST /api/profile/picture`, `FormData` field `image`), and remove (`DELETE /api/profile/picture`). Updates sync to profile state, `auth_user`, header avatar, and cross-tab profile events. See [`../backend/docs/profile/m10-frontend-profile-picture-ui.md`](../backend/docs/profile/m10-frontend-profile-picture-ui.md).

**Profile Module M11 (frontend sensitive change flows):** `/account/profile` adds Security Actions for change password (`POST /api/profile/password/change`), change email (`POST /api/profile/email/start` + `POST /api/profile/email/confirm`), and 2FA reconfiguration (`POST /api/profile/2fa/reconfigure/start` + `POST /api/profile/2fa/reconfigure/verify`). Successful flows clear local auth and redirect to `/login`. Sensitive actions are disabled offline. No user-facing 2FA disable path. See [`../backend/docs/profile/m11-frontend-sensitive-change-flows.md`](../backend/docs/profile/m11-frontend-sensitive-change-flows.md).

**Profile Module M12 (PWA offline profile queue):** `/account/profile` queues offline `phone`/`address` updates in isolated Dexie table `profile_update_queue`, flushes via `PATCH /api/profile` through shared `api.js` on reconnect, and provides offline conflict recovery UI. Sensitive actions, profile picture, and session actions are not queued. See [`../backend/docs/profile/m12-pwa-offline-profile-queue.md`](../backend/docs/profile/m12-pwa-offline-profile-queue.md).

**Profile Module M13 (blockchain integration for profile changes):** Backend anchors committed sensitive profile changes (`profile_password_changed`, `profile_email_changed`, `profile_2fa_reconfigured`) as `user_profile` records in the central blockchain queue. Display path is the **Admin-only** Blockchain Monitoring dashboard (`user_profile` entity filter/label). No profile-page blockchain widget. See [`../backend/docs/profile/m13-blockchain-integration-for-profile-changes.md`](../backend/docs/profile/m13-blockchain-integration-for-profile-changes.md).

**Profile Module M14 (audit, monitoring, and hardening):** Backend hardening milestone; frontend adds profile audit action filters to `AuthAuditFilterBar` on `/admin/auth-monitoring` (`profile_updated`, `password_change_failed`, `email_change_failed`, `two_factor_reconfigure_failed`, and related profile events). See [`../backend/docs/profile/m14-audit-monitoring-and-hardening.md`](../backend/docs/profile/m14-audit-monitoring-and-hardening.md).

**Profile Module M15 (final documentation, demo checklist, and module freeze):** Confirms the final `/account/profile` user experience, session management on the Security Settings tab, Auth Monitoring profile filters, Blockchain Monitoring verification path, offline phone/address queue behavior, sensitive-action online-only controls, manual demo checklist, and final frontend test evidence. See [`../backend/docs/profile/m15-final-documentation-demo-checklist-and-module-freeze.md`](../backend/docs/profile/m15-final-documentation-demo-checklist-and-module-freeze.md).

**System Update M6 (Account Settings two-tab redesign):** `/account/profile` is the canonical Account Settings page with `tab=profile` (Profile Summary) and `tab=security` (Security Settings). `/account/security` redirects to the security tab. Push notification controls moved from the header demo dropdown into Profile Summary. See [`../docs/system-update/m6-account-settings-two-tab-redesign.md`](../docs/system-update/m6-account-settings-two-tab-redesign.md).

### Login Flow

Implemented in `src/views/pages/auth-forms/AuthLogin.jsx`.

1. User submits the login form (email + password).
2. Client-side validation:
   - Email is required and must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
   - Password is required (no length/complexity rule).
3. `submitLogin(payload)` calls `POST /auth/login` with `skipAuthRefresh: true` (legacy `/login` fallback on 404).
4. On success, unpack `response?.data?.data` and branch on `next_step`:

   | `next_step` | Action |
   |-------------|--------|
   | `password_setup_required` | Navigate to `/first-login/setup` with `setupToken`, `email`, `expiresIn` in route state. Do **not** persist token/user. |
   | `two_factor_setup_required` | Navigate to `/first-login/2fa` with `twoFactorSetupToken`, `email`, `expiresIn` in route state. Do **not** persist token/user. |
   | `otp_required` | Navigate to `/login/otp` with `loginChallengeId`, `email`, `expiresIn` in route state. Do **not** persist token/user. |
   | (direct `access_token`) | Legacy path: `setAuthToken()` + `setAuthUser()` → role home route. |

5. **Password setup complete** (`usePasswordSetupController`) navigates to `/first-login/2fa` with `twoFactorSetupToken` in route state.
6. **2FA setup verify** (`useTwoFactorSetupController`) and **login OTP verify** (`useOtpController`) call the respective auth endpoints; on success call `setAuthToken()` + `setAuthUser()` and navigate to `getDefaultRouteForRole()`.

On failure, `extractErrorMessage(error)` produces a user-facing message. If status is `401`, the password input is cleared.

### Logout Flow

Implemented end-to-end from the header Profile menu using the same layered pattern as other features (view → controller → repository → service).

**Entry point:** `layout/MainLayout/Header/ProfileSection/index.jsx` — the "Logout" `ListItemButton` calls `handleLogout()` from `useAuthController`. While `logoutLoading` is true, the button is disabled and the label reads **Logging out...**. A small `logoutError` caption appears only when the backend was unreachable (non-`401` HTTP errors or network failure); the user is still signed out locally.

**`handleLogout()` sequence** (`feature/authentication/controllers/useAuthController.js`):

1. Guard against duplicate clicks (`logoutInProgress` ref + `logoutLoading`).
2. `POST /auth/logout` via `authRepository` → `authService` → `api.post`.
3. **`finally` (always runs):**
   - `broadcastService.disconnect()` — leaves Reverb channels and tears down the Echo singleton (`services/realtime/broadcastService.js`).
   - `clearAuthSession()` — removes `access_token` and `auth_user` from `localStorage` (does **not** touch Dexie / PWA `sync_queue`).
   - `setCurrentUser(null)`.
   - `navigate('/login', { replace: true })`.

**Backend failure tolerance:** Logout always returns **200** when the request reaches Laravel (M1 hardening patch): refresh revocation and cookie clearing succeed even without a bearer token or with an expired/invalid JWT. The frontend `finally` block still runs disconnect + `clearAuthSession()` + navigation. Network errors and non-`401` HTTP failures may set optional `logoutError`. Logout `401` does not trigger refresh-on-401; other protected API `401`s use the M2 refresh queue unless refresh fails.

**Cross-tab:** `useAuthController` listens for `storage` events on `access_token` / `auth_user`. When another tab clears the token, this tab disconnects realtime and navigates to `/login` (SPA navigation, not a full reload).

**IndexedDB / PWA:** Patrol offline logs and the sync queue are intentionally preserved after logout so guards can finish syncing when they sign in again.

### Registration Flow

The Register page (`/pages/register`) uses `AuthRegister.jsx`, which is a **purely visual form**:

- Inputs are uncontrolled, with `value` hard-coded to `"Jhones"`, `"Doe"`, etc.
- The `Sign up` button has `type="submit"` but no `onSubmit` handler is registered on the surrounding `<form>` (there is no `<form>` element).
- No registration API call is made.

### JWT / Token Storage

| Item            | Value                                                                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage backend | `localStorage`                                                                                                                                                                                                                          |
| Token key       | `access_token` (`utils/auth#AUTH_TOKEN_KEY`)                                                                                                                                                                                            |
| User key        | `auth_user` (set by `AuthLogin` after login)                                                                                                                                                                                            |
| Helper API      | `getAuthToken()`, `hasAuthToken()`, `setAuthToken()`, `clearAuthToken()`, `getAuthUser()`, `setAuthUser()`, `getAuthUserRole()`, `hasRole()`, `hasAnyRole()`, `getDefaultRouteForRole()`, `validateAuthSession()`, `clearAuthSession()` |

Centralizing the key avoids duplicated `localStorage.getItem('access_token')` calls.

### Token Refresh Behavior

M2 implements frontend refresh-on-401. When a protected API request returns `401`, `api.js` calls `runAuthRefresh()`, which uses `POST /auth/refresh` with `credentials: 'include'`. If refresh succeeds, the access token is updated and the original request is retried once. If refresh fails, the frontend clears auth state, marks the session-expired flag, redirects to `/login`, and shows `SessionExpiredDialog`.

Auth endpoints (`/auth/login`, `/login`, `/auth/logout`, `/auth/refresh`, `/auth/password-setup/complete`, `/auth/2fa/setup/start`, `/auth/2fa/setup/verify`, `/auth/otp/verify`) and requests using `skipAuthRefresh: true` bypass refresh-on-401.

**M4/M5 semi-public tokens:** Password setup tokens, 2FA setup tokens, and login challenge IDs are held in React Router location state only — never `localStorage` or `sessionStorage`. Email/password login and semi-public auth steps do not call `setAuthToken()` or `setAuthUser()` until OTP or 2FA setup verification succeeds.

**M5 QR rendering:** `qrcode.react` renders the authenticator QR locally from `otpauth_uri`; no external QR API is used.

**Route guards:** `ProtectedRoute` and `RoleProtectedRoute` clear sessions when stored `auth_user` has `setup_required = true` or **`two_factor_enabled !== true`** (strict default-deny; stale pre-M5 sessions without the field are rejected).

The refresh token remains browser-managed through an HttpOnly cookie and is never read or stored by JavaScript.

### Route Protection

See [Section 4](#4-routing-documentation). Implemented entirely client-side via:

- `ProtectedRoute` (token + `auth_user` must exist).
- `RoleProtectedRoute` (role must be in `allowedRoles`).
- `GuestRoute` (unauthenticated only).
- Global protected `401` handler in `api.js` (refresh-on-401 + single retry; session-expired UX on failure).

### Role-Based Rendering / Permission Handling

- **Routes:** `RoleProtectedRoute` per route in `MainRoutes.jsx`.
- **Menu:** `menu-items/getMenuItemsForRole.js` — sidebar and breadcrumbs use role-filtered items. Operator group includes **Patrol Monitoring** (`IconMapPin2`) and **ANPR Monitoring** (`IconCar`); Security Operator sees both via `OPERATOR_MONITORING_CHILD_IDS`.
- **Profile:** `ProfileSection` shows `auth_user.name` and `getAuthUserRole()`.
- **Login:** `AuthLogin` navigates to `getDefaultRouteForRole()` after storing user + token.

Backend login returns `data.user` with nested `role` (`UserResource` → `RoleResource.name`). Top-level `data.role` string is also present but the SPA reads from `auth_user`.

### Session Persistence

- Page reloads keep the user logged in because `access_token` lives in `localStorage`.
- **Cross-tab logout:** `useAuthController` listens for `storage` events on `access_token` / `auth_user`; when another tab clears the session, open tabs disconnect Reverb and `navigate('/login', { replace: true })`.
- A "Keep me logged in" checkbox exists in the login form but is **not used** when storing the token.

### Redirect Handling After Login / Logout

- After successful login: `navigate(getDefaultRouteForRole(role), { replace: true })` (currently `/dashboard` for all roles). The `state.from` saved by `ProtectedRoute` is **not** consumed.
- After protected API refresh failure or retried `401`: `window.location.replace('/login')` (full page reload) unless already at `/login`, with `SessionExpiredDialog` via session-expired flag/event.
- After logout: `navigate('/login', { replace: true })` from `handleLogout()` (Profile menu).

---

## 7. State Management

### Approach

The project deliberately avoids a global state library. State is split between:

| Layer                      | Mechanism                                                   | Used for                                                                                             |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| App config                 | `ConfigContext` (React Context) backed by `useLocalStorage` | Theme + UI preferences (font, border radius, miniDrawer, presetColor, container, outlinedFilled, …). |
| App-wide ephemeral         | SWR (`api/menu.js`)                                         | Sidebar drawer open/close (`isDashboardDrawerOpened`).                                               |
| Per-feature business state | Custom controller hooks (`useUserController`, etc.)         | Lists, paging, filters, form state, loading, errors.                                                 |
| Component-local            | `useState`                                                  | UI toggles (popovers, drawers, dialog open).                                                         |

### Global State Flow

```
┌──────────────────────────┐
│   ConfigProvider         │  ← src/contexts/ConfigContext.jsx
│   (LocalStorage backed)  │
└──────────┬───────────────┘
           │ via useConfig() hook
           ▼
   ThemeCustomization (themes/index.jsx)
   MainLayout (drawer / mini-drawer)
   Customization drawer (font + border radius)
```

`ConfigContext.jsx` exposes:

```jsx
const { state, setState, setField, resetState } = useLocalStorage('berry-config-vite-js', config);
```

The **`useConfig`** hook lives in the same file as `ConfigProvider` so the context object is never duplicated by split chunks. If `useContext` still sees the empty sentinel (duplicate React in rare builds), the hook logs once and returns **in-memory defaults** with no-op setters so the app does not white-screen.

- `state` — current config object.
- `setState(next)` — replace.
- `setField(key, value)` — partial update.
- `resetState()` — restore defaults from `src/config.js`.

### Shared State Handling

The sidebar uses **SWR as a tiny shared state container**:

```13:18:src/api/menu.js
export function useGetMenuMaster() {
  const { data, isLoading } = useSWR(endpoints.key + endpoints.master, () => initialState, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });
```

- `useGetMenuMaster()` — read.
- `handlerDrawerOpen(value)` — write via `mutate('api/menumaster', updater, false)`.

`MainLayout`, `Header`, and `Sidebar` all read this state to keep the drawer in sync without prop-drilling.

### Local Component / Controller State

Each user-management controller exposes only the slice the view needs.

`useUserController` (`src/feature/management-user/controllers/useUserController.js`) state:

| State         | Default | Purpose                              |
| ------------- | ------- | ------------------------------------ |
| `users`       | `[]`    | All users from the API.              |
| `page`        | `0`     | Current pagination page (0-indexed). |
| `rowsPerPage` | `5`     | Page size; selectable: 5 / 10 / 25.  |
| `filterText`  | `''`    | Filter applied to name/email/phone.  |
| `loading`     | `true`  | Initial fetch indicator.             |

Controllers also expose handlers (`handleChangePage`, `handleChangeRowsPerPage`, `handleFilterChange`, `handleAddUser`, `handleViewUser`, `handleEditUser`, `handleDeleteUser`).

### Custom Hooks

| Hook                    | Location                                                      | Purpose                                                                                                     |
| ----------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `useConfig`             | `contexts/ConfigContext.jsx` (re-export `hooks/useConfig.js`) | Theme/config API; fallback path if context is broken by duplicate React (see `contexts/ConfigContext.jsx`). |
| `useLocalStorage`       | `hooks/useLocalStorage.js`                                    | Generic LocalStorage-backed `useState`.                                                                     |
| `useMenuCollapse`       | `hooks/useMenuCollapse.js`                                    | Auto-expands the parent menu of the active route.                                                           |
| `useScriptRef`          | `hooks/useScriptRef.js`                                       | Tracks mounted state for guarded async updates.                                                             |
| `usePwaInstallPrompt`   | `hooks/usePwaInstallPrompt.js`                                | PWA install prompt capture (`beforeinstallprompt`), standalone detection, `promptInstall`.                  |
| `useUserController`     | `feature/management-user/controllers/...`                     | Business logic for user list.                                                                               |
| `useUserViewController` | same                                                          | Business logic for user detail.                                                                             |
| `useUserAddController`  | same                                                          | Business logic for create form.                                                                             |
| `useUserFormController` | same                                                          | Business logic for edit form.                                                                               |
| `useGetMenuMaster`      | `api/menu.js`                                                 | SWR-backed sidebar state.                                                                                   |

### Loading / Error State Management

**System Update M5** standardized shared UI states under `ui-component/state/` and `ui-component/table/`:

| Component | Purpose | Used by (examples) |
| --------- | ------- | ------------------ |
| `TableBodySkeleton` | Table row placeholders while loading | User, Zone, Checkpoint, Camera, Vehicle, ANPR, Patrol session, Auth audit/session tables |
| `ListLoadingSkeleton` | Non-table list placeholders | Available; prefer `TableBodySkeleton` in tables |
| `ContentEmptyState` | Contextual empty panel with optional action | Dashboard lists/map, Patrol monitoring, feature empty branches |
| `ContentErrorState` | Error alert with optional retry | Dashboard home, Patrol monitoring dashboard |

There is **no** `PageSkeleton` component. Each controller hook still owns its own `loading` boolean.

**Global feedback (not a unified toast provider):**

- **`NetworkSnackbar`** (`App.jsx`) — offline / back-online connectivity.
- **`PwaUpdateSnackbar`** (`App.jsx`) — new service worker available; **Reload now** applies waiting worker via `useServiceWorkerUpdate`.
- **`SessionExpiredDialog`** (`App.jsx`) — shown after refresh failure / session expiry.
- **`SuccessDialog`** — post-create/update success with auto-redirect on some management forms.

Per-feature errors may still use inline alerts, `ContentErrorState`, form helper text, or `window.alert` / `window.confirm` on older management flows.

### Data-Fetching Patterns

- **Imperative fetch in controllers** (User Management): `useEffect(() => loadX(), [...])` + `setState`. No caching, no automatic refetch, no optimistic updates.
- **SWR** is imported and used in only one place (`api/menu.js`) — and not for actual remote fetching.

---

## 8. UI Components & Design System

### Reusable UI Components

See [Section 3 → `src/ui-component`](#srcui-component). The most reused are:

| Component                | Used by                                |
| ------------------------ | -------------------------------------- |
| `MainCard`               | Almost every page wrapper.             |
| `DetailCard`             | User detail / add / edit pages.        |
| `Loadable`               | All lazy-loaded route components.      |
| `Loader`                 | Layout suspense fallback.              |
| `PaginationFooter`       | Management and monitoring list pages.  |
| `LiveIndicator`          | ANPR Monitoring + Patrol Monitoring titles. |
| `TableActionButtons`     | User, Zone, Checkpoint, Vehicle, ANPR, Patrol session tables. |
| `MalaysiaTime`           | User table + user detail (timestamps). |
| `Transitions`            | Header popovers.                       |
| `AnimateButton`          | Primary CTA buttons.                   |
| `Breadcrumbs` (extended) | `MainLayout` body.                     |

### Layout Components

| Layout          | Path                                  | Used by                                                             |
| --------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `MainLayout`    | `layout/MainLayout/index.jsx`         | All protected routes.                                               |
| `MinimalLayout` | `layout/MinimalLayout/index.jsx`      | All guest routes.                                                   |
| `HorizontalBar` | `layout/MainLayout/HorizontalBar.jsx` | Defined but not mounted in current code path.                       |
| `Customization` | `layout/Customization/index.jsx`      | Mounted by `MainLayout` (drawer-only; toggle Fab is commented out). |

### Navigation Components

- **Sidebar** (`Sidebar/index.jsx`) — switches between MUI `<Drawer>` (mobile / mini-drawer mode) and a styled permanent drawer (`MiniDrawerStyled`). **Desktop:** `MenuList` + `MenuCard` live inside `SimpleBar`. **Mobile:** a flex column uses a native scrolling `Box` for the menu and pins **Install App** (`SidebarPwaInstall`) under it when the PWA install prompt is available. `usePwaInstallPrompt()` is called on `Sidebar` so `beforeinstallprompt` is captured even when the drawer starts closed.
- **MenuList** (`MenuList/index.jsx`) — renders the menu tree from **`getMenuItemsForRole(getAuthUserRole())`**. Uses `NavGroup` → `NavCollapse` → `NavItem`.
- **Header** (`Header/index.jsx`) — Logo + drawer toggler + `NotificationSection` + `ProfileSection`.
- **Breadcrumbs** (`ui-component/extended/Breadcrumbs.jsx`) — auto-derived from the current path + menu items.

### Tables / Charts / Cards

| Type       | Where                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Table      | Standardized `Paper` + `TableContainer` + `secondary.light` header row. Reference: `UserTable`, `ZoneTable`, `CheckpointTable`, `VehicleTable`, `AnprEventTable`, `PatrolSessionTable`. Actions via `TableActionButtons`. |
| Pagination | `ui-component/table/PaginationFooter.jsx` (MUI `Pagination` + rows-per-page `Select`).                            |
| Charts     | M10 `feature/dashboard` uses operational cards/lists/map — **not** Berry ApexCharts demo widgets. `react-apexcharts` remains a dependency but is unused on `/dashboard` today. |
| Cards      | `MainCard`, `DetailCard`, `SubCard`, `EarningCard`, `TotalIncomeDarkCard`, `TotalIncomeLightCard`, `PopularCard`. |

### Modal / Toast / Alert Systems

- **Alerts** — `routes/ErrorBoundary.jsx` (inline MUI `<Alert>` for HTTP error codes); feature views use `ContentErrorState` / inline `Alert`.
- **Snackbars** — global **`NetworkSnackbar`** (connectivity), **`PwaUpdateSnackbar`** (installed-app / SW update reload prompt). No app-wide `SnackbarProvider`; feature-specific snackbars are not used elsewhere.
- **Modal/Dialog** — `ui-component/dialogs/SuccessDialog` after successful User/Zone create or update (~2s auto-redirect); **`SessionExpiredDialog`** for auth expiry; destructive actions often use native `window.confirm()` / `window.alert()`.

### Form Components

- `CustomFormControl` (Berry's styled MUI `<FormControl>`) — used in login/register forms.
- `OutlinedInput` + `InputLabel` + `FormHelperText` — MUI primitives.
- Feature views (UserAdd / UserEdit / ZoneAdd / ZoneEdit) use `FieldContainer`, `SelectFieldContainer`, `SectionHeader`, and `SubmitButton` from `ui-component/`.

### Styling Approach

- **Material UI v7** is the primary styling system, using its `styled()` API and `sx` prop.
- **Emotion** is the underlying engine.
- **CSS variables** are enabled via `cssVariables.cssVarPrefix` and `colorSchemeSelector: 'data-color-scheme'`. Components frequently read `theme.vars.palette.*` instead of `theme.palette.*`.
- **SCSS** is used for a single global stylesheet (`src/assets/scss/style.scss`) — keyframes, ApexCharts theming overrides, and `simplebar` import.

### CSS Framework / Library

- No utility-CSS framework (no Tailwind, no Bootstrap).
- Berry's MUI theme + `styled()` is the design system.

### Theme / Color Usage

- Defined in `src/themes/`. Default tokens live in `themes/theme/default.js`.
- Theme uses MUI v7 **color schemes** with a `light` scheme defined; dark mode is **not** explicitly provided in this codebase (`createTheme` only declares `colorSchemes.light`). However, the default config is `DEFAULT_THEME_MODE = 'system'` (`config.js`), which is passed to `<ThemeProvider defaultMode={DEFAULT_THEME_MODE}>`. Without a `colorSchemes.dark`, system dark mode preference cannot fully apply.

### Responsive Design Handling

- Breakpoints come from MUI: `useMediaQuery(theme.breakpoints.down('md' | 'sm'))`.
- Pages adapt with the `Grid size={{ xs: 12, md: 6 }}` API.
- `Sidebar` switches between temporary/persistent/mini drawer based on screen size and config.
- `PaginationFooter` and `UserTableToolbar` collapse to a column layout on `xs`.

---

## 9. Forms & Validation

### Form Architecture

There are two patterns in the code:

1. **Berry / direct MUI** — used by `AuthLogin.jsx` and `AuthRegister.jsx` (standalone `useState`).
2. **Controller-driven** — used by User Management forms. The controller hook (`useUserAddController`, `useUserFormController`) owns `formData`, `errors`, `loading`, and exposes `handleChange(field)`, `handleSubmit(event)`, `handleCancel()`.

### Validation Libraries Used

- `yup` (1.7.1) is **listed in `package.json`** but no `import yup` / schema definition is present in `src/`. All current validation is hand-written.
- `prop-types` is used at runtime where present.

### Validation Patterns

#### Login (`AuthLogin.jsx`)

- Inline `validateForm()`:
  - Required: email, password.
  - Email format: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.

#### User Add (`useUserAddController.js`)

| Field          | Rule                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `full_name`    | Required (trimmed).                                                                             |
| `username`     | Required (trimmed).                                                                             |
| `email`        | Required + must match `/\S+@\S+\.\S+/`.                                                         |
| `phone_number` | Required + must reduce to 10–15 digits via `/^\d{10,15}$/.test(replace(/\D/g, ''))`.            |
| `address`      | Required (trimmed).                                                                             |
| `role`         | Required (trimmed).                                                                             |
| `password`     | Required + minimum 8 characters. (Stronger uppercase/lowercase/number policy is commented out.) |

#### User Edit (`useUserFormController.js`)

Same as Add **minus** the password rule. Password is excluded from `formData` entirely in edit mode.

### Error Display Handling

- Per-field errors live in `controller.errors[field]` and are rendered as MUI `helperText` + the `error` boolean on the input.
- Submit-level errors:
  - Login form → `submitError` rendered as a `<FormHelperText error>`.
  - User Add/Edit → `console.error` + `window.alert('Failed to ...: ' + error.message)`.

### Create / Edit Form Flows

```
UserAdd / UserEdit page
  ▼
useUserAddController / useUserFormController
  ▼
validate()
  └── on fail → setErrors() and return
  └── on pass:
        repository.createUser / updateUser
          └── userService.createUser / updateUser
                └── api.post / api.patch
        → on success: setShowSuccessModal(true)
              → useEffect 2s timer → handleModalClose() → navigate(`/admin/management-user/view/${id}`)
        → on failure: set `submitError` and field-level `errors` from Laravel validation when available
```

User payloads are built in `feature/management-user/utils/userValidation.js` (`name`, `email`, `phone`, `address`, `role_id`, optional `password` on edit).

### Client-Side Validation

All validation is client-side (regex + truthiness). The backend's validation responses are surfaced to the user only through the global error-message extraction logic in `AuthLogin.extractErrorMessage()`.

### File Upload Handling

`useUserAddController` and `useUserFormController` contain handlers for profile-image upload (`handleImageUpload`, `handleRemoveImage`, `previewUrl`, `fileInputRef`):

- The picked file is read via `FileReader.readAsDataURL` to produce a preview.
- The file is stored as `formData.profilePicture`.
- The actual UI (`UserAddProfile`) is **commented out** in both `UserAdd.jsx` and `UserEdit.jsx`, so this flow is unreachable today.
- The HTTP layer would need to switch to `FormData` to send the file; `api.js` already detects `FormData` and skips JSON serialization, but the controllers send the plain `formData` object as JSON.

---

## 10. Configuration

### Important `.env` Variables

`.env` (committed):

```
VITE_APP_VERSION=v5.1.0
GENERATE_SOURCEMAP=false
VITE_APP_BASE_NAME=/
VITE_API_BASE_URL=http://localhost:8000/api
VITE_VAPID_PUBLIC_KEY=<url-safe-base64-public-key>
VITE_REVERB_APP_KEY=<reverb-app-key>
VITE_REVERB_HOST=localhost
VITE_REVERB_PORT=8080
VITE_REVERB_SCHEME=http
```

Optional (development diagnostics only — not in committed `.env` by default):

```
VITE_PWA_DEBUG=true    # pwa/pwaLogger.js — PWA diagnostic logs in dev
VITE_APP_DEBUG=true    # utils/appDebug.js — general app debug logs in dev
VITE_REVERB_ENABLED=false   # omit or set false to disable Echo/Reverb (polling-only realtime)
```

| Variable             | Used in                                                               | Purpose                                    |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| `VITE_APP_VERSION`   | `Sidebar/index.jsx` (commented `<Chip>`)                              | Versions the sidebar (currently disabled). |
| `GENERATE_SOURCEMAP` | —                                                                     | CRA-style flag, currently unused by Vite.  |
| `VITE_APP_BASE_NAME` | `vite.config.mjs` (`base`) and `routes/index.jsx` (router `basename`) | Public path of the SPA (e.g. `/fyp`).      |
| `VITE_API_BASE_URL`  | `api/api.js`                                                          | Base URL of the Laravel API.               |
| `VITE_VAPID_PUBLIC_KEY` | `pwa/pushNotificationService.js`                                 | Web Push VAPID public key (must match backend `VAPID_PUBLIC_KEY`). |
| `VITE_REVERB_*`      | `services/realtime/broadcastService.js`                               | Laravel Reverb / Echo websocket connection for patrol monitoring realtime. |
| `VITE_PWA_DEBUG`     | `pwa/pwaLogger.js`                                                    | Dev-only PWA diagnostic logging when `true`. |
| `VITE_APP_DEBUG`     | `utils/appDebug.js`                                                   | Dev-only general debug logging when `true`. |

### Vite Configuration (`vite.config.mjs`)

The config file is **`vite.config.mjs`** (not `vite.config.js`). Plugins include **`VitePWA`** from `vite-plugin-pwa`, a custom **`jsconfigSrcBaseUrlFallback`** plugin (bare imports when `vite-jsconfig-paths` has no importer during the prod graph), **`react()`**, and **`jsconfigPaths()`**.

| Section          | Setting                                                                                            | Notes                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server`         | `open: true`, `port: 3000`, `host: true`                                                           | Auto-opens browser; binds on all interfaces; fixed dev port.                                                                                                                                              |
| `build`          | `chunkSizeWarningLimit: 1600`                                                                      | Raises Vite's default chunk warning.                                                                                                                                                                      |
| `preview`        | `open: true`, `host: true`                                                                         | Used by `yarn preview`.                                                                                                                                                                                   |
| `optimizeDeps`   | `dedupe: ['react', 'react-dom']`, `include: ['react', 'react-dom', 'react/jsx-runtime']`           | Dev pre-bundle consistency.                                                                                                                                                                               |
| `define`         | `global: 'window'`                                                                                 | Polyfills CommonJS-style `global`.                                                                                                                                                                        |
| `resolve.dedupe` | `react`, `react-dom`, `scheduler`                                                                  | Reduces duplicate React in the bundle.                                                                                                                                                                    |
| `resolve.alias`  | `react`, `react-dom`, `react/jsx-runtime`, `react/jsx-dev-runtime` → absolute `node_modules` paths | Pins a single React instance for context/providers.                                                                                                                                                       |
| `resolve.alias`  | `contexts/ConfigContext`, `config` → absolute paths under `src/`                                   | Ensures one canonical module for context + default config.                                                                                                                                                |
| `resolve.alias`  | `@tabler/icons-react` → ESM icons bundle                                                           | Smaller icon imports.                                                                                                                                                                                     |
| `base`           | Normalized from `VITE_APP_BASE_NAME` via `normalizeAppBaseName` / `toViteBasePath` (`/` or `/fyp/`) | SPA public base path for asset URLs (from `.env`, currently `/`). PWA manifest `start_url`, `scope`, and icon paths use the same normalized base. |
| `plugins`        | `jsconfigSrcBaseUrlFallback`, `react()`, `jsconfigPaths()`, `VitePWA({ … })`                       | PWA: `generateSW`, manifest, Workbox precache + **`runtimeCaching`** from **`pwa/workbox-runtime-caching.mjs`**; `injectRegister: false` because registration uses `virtual:pwa-register` in `index.jsx`. |

The **`jsconfigSrcBaseUrlFallback`** plugin resolves bare imports from `src/` when needed for Vite 7 production builds; it explicitly **skips** `react`, `react-dom`, and `scheduler` so those always resolve via normal node resolution.

### Build Configuration

- `vite build` produces a `dist/` folder.
- `vite preview` serves the build with the same `base` setting.
- Source maps are not customized — Vite uses defaults.

### Environment Handling

- Variables are read with Vite's `import.meta.env.*`.
- Only the `VITE_*`-prefixed variables are exposed to the bundle.
- The `.gitignore` ignores `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local`. The committed `.env` is the project-default file.

### Constants / Config Files

| File                    | Constants                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| `src/config.js`         | `DASHBOARD_PATH`, `DEFAULT_THEME_MODE`, `CSS_VAR_PREFIX`, default `fontFamily`, `borderRadius`. |
| `src/store/constant.js` | `gridSpacing`, `drawerWidth`, `appDrawerWidth`.                                                 |
| `src/utils/auth.js`     | `AUTH_TOKEN_KEY`.                                                                               |

### Runtime Configuration

- The Berry config object is persisted under `localStorage['berry-config-vite-js']` (`ConfigContext`), and changes apply live without reloading. Defaults come from `src/config.js`.
- The user/token live under `localStorage['access_token']` and `localStorage['auth_user']`.
- The MUI color-scheme mode is stored under `localStorage['theme-mode']` (the `modeStorageKey` passed to `<ThemeProvider>`).

### `jsconfig.json` (Path Aliases)

```13:19:jsconfig.json
"resolveJsonModule": true,
"isolatedModules": true,
"noEmit": true,
"jsx": "react-jsx",
"baseUrl": "src"
}
```

`baseUrl: "src"` lets the codebase import without relative paths, e.g.:

- `import api from 'api/api'`
- `import { hasAuthToken } from 'utils/auth'`
- `import MainCard from 'ui-component/cards/MainCard'`

### Secrets

No secrets are currently stored in `.env` or `src/`. Be careful to keep this true: only the Laravel API base URL and the public base name belong here.

---

## 11. Dependencies

### Runtime Dependencies (from `package.json`)

| Package                                                            | Version  | Purpose / Where it is used                                                           |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------ |
| `react`                                                            | 19.2.0   | Core UI library.                                                                     |
| `react-dom`                                                        | 19.2.0   | Rendering / `createRoot`.                                                            |
| `react-router`                                                     | 7.9.6    | Router primitives.                                                                   |
| `react-router-dom`                                                 | 7.9.6    | DOM bindings (`createBrowserRouter`, `RouterProvider`, `Outlet`, `Navigate`, hooks). |
| `@mui/material`                                                    | 7.3.5    | Primary UI component library. Used everywhere.                                       |
| `@mui/icons-material`                                              | 7.3.5    | Material icons (used by login form, header, etc.).                                   |
| `@emotion/react`                                                   | 11.14.0  | MUI styling engine.                                                                  |
| `@emotion/styled`                                                  | 11.14.1  | MUI styling engine.                                                                  |
| `@tabler/icons-react`                                              | 3.35.0   | Most icons in the app (sidebar, table actions, …).                                   |
| `@vitejs/plugin-react`                                             | 5.1.1    | React Fast Refresh + JSX.                                                            |
| `vite`                                                             | 7.2.6    | Bundler / dev server.                                                                |
| `vite-jsconfig-paths`                                              | 2.0.1    | Honors `jsconfig.json` path aliases at build time.                                   |
| `apexcharts`                                                       | 5.3.6    | Dashboard charts.                                                                    |
| `react-apexcharts`                                                 | 1.9.0    | React wrapper for ApexCharts.                                                        |
| `framer-motion`                                                    | 12.23.25 | Animations (`AnimateButton`).                                                        |
| `lodash-es`                                                        | 4.17.21  | Utility functions (used by some Berry internals).                                    |
| `material-ui-popup-state`                                          | 5.3.6    | Used in (commented) `Header/SearchSection`.                                          |
| `react-device-detect`                                              | 2.2.3    | Device detection (imported by Berry components).                                     |
| `simplebar-react`                                                  | 3.3.2    | Custom scrollbars (sidebar).                                                         |
| `slick-carousel`                                                   | 1.8.1    | Listed in `package.json`; no `import` detected in `src/` (template residue).         |
| `swr`                                                              | 2.3.7    | Used in `api/menu.js` as a local key/value store.                                    |
| `web-vitals`                                                       | 5.1.0    | Optional performance reporting (`reportWebVitals.js`).                               |
| `dexie`                                                            | ^4.4.x   | IndexedDB abstraction for `src/pwa/db.js` (patrol logs + sync queue).                |
| `yup`                                                              | 1.7.1    | Listed but **not currently imported** (no schemas defined).                          |
| `@fontsource/inter` / `@fontsource/poppins` / `@fontsource/roboto` | 5.x      | Self-hosted fonts loaded in `index.jsx`.                                             |

### Development Dependencies

| Package                                            | Version | Purpose                                 |
| -------------------------------------------------- | ------- | --------------------------------------- |
| `eslint`                                           | 9.39.1  | Linter (flat-config).                   |
| `@eslint/js`, `@eslint/eslintrc`, `@eslint/compat` | —       | ESLint core + flat-config compat.       |
| `eslint-plugin-react`                              | 7.37.5  | React lint rules.                       |
| `eslint-plugin-react-hooks`                        | 7.0.1   | React hooks rules.                      |
| `eslint-plugin-jsx-a11y`                           | 6.10.2  | Accessibility rules.                    |
| `eslint-plugin-prettier`                           | 5.5.4   | Surface Prettier issues as lints.       |
| `eslint-config-prettier`                           | 10.1.8  | Disable conflicting style rules.        |
| `prettier`                                         | 3.7.3   | Code formatter (config: `.prettierrc`). |
| `prettier-eslint-cli`                              | 8.0.1   | CLI helper.                             |
| `sass`                                             | 1.94.2  | Compiles `assets/scss/style.scss`.      |
| `vite-plugin-pwa`                                  | ^1.3.0  | PWA manifest + Workbox `generateSW`.    |
| `workbox-window`                                   | ^7.4.1  | PWA client registration bundle support. |

### Categorized Notes

| Category           | Library                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| UI primitives      | `@mui/material`, `@mui/icons-material`, `@emotion/*`, `@tabler/icons-react` |
| Routing            | `react-router`, `react-router-dom`                                          |
| State / data       | `swr` (very limited use), local `useState`                                  |
| PWA                | `vite-plugin-pwa`, `workbox-window`, `dexie` (`src/pwa/`)                   |
| Forms / validation | Hand-written (yup is unused)                                                |
| Charts             | `apexcharts`, `react-apexcharts`                                            |
| Utilities          | `lodash-es`, `react-device-detect`, `material-ui-popup-state`               |
| HTTP               | Native `fetch` (wrapped in `src/api/api.js`)                                |

### M14 automated tests (Vitest)

M14 adds a minimal Vitest stack for ANPR monitoring and vehicle management regression coverage.

| Command | Purpose |
| ------- | ------- |
| `yarn test` | Run Vitest once (`vitest run`) |
| `yarn test:watch` | Watch mode |

**Config:** `vitest.config.mjs` merges with `vite.config.mjs` (aliases preserved). Setup: `src/test/setupTests.js`.

**M14 coverage:** `AnprMonitoringRepository`, `useAnprMonitoringController`, `AnprLiveIndicator`, `AnprEventTable`, `AnprEventSummaryCards`, `AnprEvidenceGallery`, `VehicleManagementRepository`, `VehicleEditDrawer`.

Full cross-stack testing architecture: `anpr/docs/m14-testing-architecture.md`.

---

## 12. Build & Deployment

### Required Tooling

| Tool    | Version                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Node.js | The project itself does not pin a Node version, but Vite 7 requires **Node 20.19+ or 22.12+** (per upstream Vite 7 requirements). |
| Yarn    | `4.10.3` (`packageManager` field). The repo includes `.yarn/`, `.yarnrc.yml`, and `yarn.lock`.                                    |
| npm     | Optional — scripts are equivalent under npm, but Yarn 4 is the declared package manager.                                          |

### Installation

From `frontend/`:

```bash
# Using Yarn (recommended; Yarn 4 is bootstrapped via Corepack)
corepack enable
yarn install
```

### Development Setup

```bash
# Start the dev server (Vite, port 3000, opens browser, exposes on LAN)
yarn start
```

The dev server is configured by `vite.config.mjs`:

- Port: `3000`
- `host: true` (binds on `0.0.0.0`)
- `open: true` (auto-opens browser)
- Public path / base: `VITE_APP_BASE_NAME` (default `/` in the current `.env`).

So with the default `.env`, the app is reachable at `http://localhost:3000/`.

### Run Commands

| Command         | What it does                                                      |
| --------------- | ----------------------------------------------------------------- |
| `yarn start`    | `vite` — starts the dev server.                                   |
| `yarn build`    | `vite build` — produces a production build in `dist/`.            |
| `yarn preview`  | `vite preview` — serves the built `dist/` for local verification. |
| `yarn lint`     | `eslint "src/**/*.{js,jsx,ts,tsx}"`.                              |
| `yarn lint:fix` | `eslint --fix ...`.                                               |
| `yarn prettier` | `prettier --write "src/**/*.{js,jsx,ts,tsx}"`.                    |

### Build Commands

```bash
yarn build      # production bundle into ./dist
yarn preview    # local sanity check of the built bundle
```

### Production Deployment Notes

- Output directory: `dist/` (Vite default).
- The bundle expects to be served under the path defined by `VITE_APP_BASE_NAME` (default `/` in the current `.env`). The hosting server (Nginx, Apache, S3+CloudFront, Netlify, etc.) must:
  - Serve `dist/` at that path.
  - Fallback unknown paths to `index.html` so the SPA router can take over.
- Backend CORS must allow the frontend origin and the `Authorization` header.

#### Netlify SPA routing

`public/_redirects` is copied into `dist/` on build. It tells Netlify to serve `index.html` for client-side routes (fixes refresh and direct URL 404s).

| `VITE_APP_BASE_NAME` | `public/_redirects` rule |
| -------------------- | ------------------------ |
| `/` (root)           | `/*    /index.html   200` |
| `/fyp`               | `/fyp/*    /fyp/index.html   200` |

Keep `VITE_APP_BASE_NAME`, Vite `base`, React Router `basename`, and `_redirects` aligned. Set `VITE_APP_BASE_NAME` at **build time** before `yarn build`.

### Environment Variable Setup

For production, override:

```
VITE_APP_BASE_NAME=/your-public-path
VITE_API_BASE_URL=https://api.example.com/api
```

These must be set **at build time** (Vite inlines `import.meta.env.VITE_*` into the bundle).

### Vite Build Output

After `yarn build`:

```
dist/
├── index.html                  # Entry HTML; `<link rel="manifest">` injected by vite-plugin-pwa
├── _redirects                  # Netlify SPA fallback (copied from public/_redirects)
├── manifest.webmanifest        # Web app manifest (name, icons, theme_color, …)
├── sw.js                       # Generated service worker (Workbox)
├── workbox-*.js                # Workbox runtime (hash varies by build)
├── icons/                      # Copied from public/icons (PWA icons referenced by manifest)
├── assets/
│   ├── *.js                    # Hashed JS chunks (one per route via React.lazy + Loadable)
│   ├── *.css                   # Hashed CSS / SCSS output
│   └── *.{svg,woff2,…}         # Static + font assets
└── favicon.svg                 # May be hashed under assets/ depending on build
```

`build.chunkSizeWarningLimit` is bumped to `1600` KB to account for the large MUI + ApexCharts bundles.

---

## 13. Known Issues / Technical Debt

The following items were verified against the current source tree and represent real gaps or bugs.

### ~~Broken / Disabled User Add & Edit Flow~~ (resolved)

User Add/Edit routes are active at `/admin/management-user/add` and `/admin/management-user/edit/:userId`. Controllers now map form fields to the Laravel contract (`name`, `email`, `phone`, `address`, `role_id`, `password`) and load role options from `GET /roles`. Navigation uses `/admin/management-user/...` consistently.

### ~~Hard-Coded Wrong Navigation Paths in User Controllers~~ (resolved)

Cancel/success navigation in `useUserAddController` and `useUserFormController` now targets `/admin/management-user/...`.

### ~~Repository-Side Validation Field Mismatch~~ (resolved)

`UserRepository` no longer blocks requests with stale `full_name` / `phone_number` checks. Payload building and validation live in `utils/userValidation.js`.

### `userDataSource.js` Mock Is Unused

`feature/management-user/datasources/userDataSource.js` is a hand-written mock dataset. It is **not imported by any view** today (`userService.js` is used instead). It is dead code.

### ~~Logout Is Not Implemented~~ (resolved — Milestone 7)

Logout is wired through `useAuthController.handleLogout()` from `ProfileSection`. Protected API `401` handling uses M2 refresh-on-401 in `api.js` (not immediate logout).

### Register Form Is Visual-Only

`AuthRegister.jsx` uses hard-coded `value` props on the inputs and has no submit handler. Calling the backend `/auth/register` (or equivalent) is not wired.

### `state.from` from `ProtectedRoute` Is Never Consumed

`ProtectedRoute` saves `state.from = location` when bouncing to login, but the login flow always navigates to `getDefaultRouteForRole(role)` (currently `/dashboard` for all roles), ignoring the original target.

### Camera Management (M4)

Implemented under `feature/management-camera` at `/admin/management-camera` (**Admin only**). List, create/edit drawer, detail drawer, delete with confirmation. Consumes Laravel `/cameras` CRUD APIs. RTSP URL is read-only and masked; camera passwords are never shown in the UI.

### Patrol GPS singleton (`feature/patrol/services/geolocationService.js`)

Patrol browser tracking uses a **single** module-scope **`watchPosition`** id. Only **`usePatrolController`** starts or stops it; **`PatrolTracking.jsx`** is presentational and does not call **`startPatrolTracking`** / **`stopPatrolTracking`** (see **`PartrolHome.jsx`** composition).

### `ErrorBoundary` Is Defined but Not Wired

`src/routes/ErrorBoundary.jsx` defines an HTTP-status-aware error UI, but neither route group sets `errorElement`. Therefore the React Router default error boundary is what users see on routing errors.

### Toggle for Customization Drawer Is Commented Out

`layout/Customization/index.jsx` mounts the drawer but the `Fab` that opens it is wrapped in a comment. The drawer is therefore unreachable through the UI.

### `MainCard` Inside Sidebar Is Empty

`layout/MainLayout/Sidebar/MenuCard/index.jsx` returns a `<Card>` with no content (the original Berry copy was removed). It still mounts but adds visual weight without information.

### SCSS Variables Reference May Drift

`src/assets/scss/style.scss` references CSS custom properties (`--palette-text-secondary`, `--palette-primary-main`, …) that depend on the `cssVarPrefix` used by `themes/index.jsx`. Today `CSS_VAR_PREFIX = ''` so the names match (`--palette-...`). Changing the prefix in the future requires updating this SCSS file in lock-step.

### `yup` Is Listed but Unused

`yup` is in `dependencies` but no schema is imported. Either adopt it for the validation rules in `useUserAddController` / `useUserFormController` / `AuthLogin`, or remove the dependency to slim the bundle.

### Repeated Validation Logic

`useUserAddController` and `useUserFormController` duplicate the same validation rules. The phone, email, role, address, and required-name checks should be extracted (or moved into a single `yup` schema).

### `FieldContainer`-Style Imports in UserAdd / UserEdit

`FieldContainer`, `SectionHeader`, and related wrappers exist under `ui-component/`. User add/edit views use them; profile image upload UI remains commented out in those views.

### Native `alert` / `confirm` Dialogs

Both `useUserController.handleDeleteUser` (uses `window.confirm`) and various error paths (`window.alert(...)`) ship with the user — accessible/i18n-friendly modal-based dialogs would be a better fit.

### Test Tooling (Vitest)

**Correction (2026-07-09):** Vitest is configured and in active use.

| Item | Value |
| ---- | ----- |
| Config | `vitest.config.mjs` (merges `vite.config.mjs`, `jsdom`, `setupFiles: src/test/setupTests.js`) |
| Scripts | `yarn test` (`vitest run`), `yarn test:watch` (`vitest`) |
| Coverage | **74** test files under `src/**/*.{test,spec}.{js,jsx}` — auth guards, `api.js`, profile, patrol, PWA, dashboard, camera management, blockchain/auth monitoring, etc. |

Run `yarn test` from `frontend/` before releases. CI integration is project-dependent (not defined in this repo's frontend package alone).

### ~~`serviceWorker.unregister()`~~ (removed)

The legacy CRA-style `serviceWorker.jsx` was removed. Service worker lifecycle is handled by **`vite-plugin-pwa`** via `registerSW` from `virtual:pwa-register` in `src/index.jsx`.

---

## 14. Future Improvements

Suggestions that are actionable given the current implementation.

### Feature Enhancements

- ~~**Complete the User Management module**~~ — done: add/edit forms aligned with Laravel `StoreUserRequest` / `UpdateUserRequest`; roles from `GET /roles`; improved User Details page.
- ~~**Implement logout**~~ — done (Milestone 7): Profile menu → `useAuthController.handleLogout()` → `POST /auth/logout`, `clearAuthSession()`, Reverb disconnect, `/login`.
- **Implement Register**: convert `AuthRegister.jsx` from a static form into a controlled form that calls the backend register endpoint.
- ~~**Implement Checkpoint module**~~ — done (Milestone 8): `feature/management-checkpoint` with map picker and full CRUD.
- ~~**Implement Camera module (System Update M4)**~~ — done: `feature/management-camera` at `/admin/management-camera`; Admin sidebar Camera item enabled.
- **Blockchain monitoring (M11):** Implemented under `feature/blockchain-monitoring`; Laravel API only; **Admin-only** routes `/admin/blockchain-monitoring` and `/admin/blockchain-monitoring/:blockchainRecordId`.
- ~~**Show authenticated user info** in the header~~ — done: `ProfileSection` reads `currentUser` from `useAuthController` (`name`, avatar from `profile_picture_url`).

### Refactoring Opportunities

- **Adopt `yup`**: replace the bespoke regex validation in `AuthLogin`, `useUserAddController`, and `useUserFormController` with a shared `yup` schema per form. Today `yup` is installed but unused.
- **Single source of truth for routes**: extract the path constants (`/admin/management-user`, `/dashboard`, etc.) into a `src/routes/paths.js` to avoid mismatches like the `userManagement` vs. `management-user` bug.
- **Unify table tooling**: a generic `<DataTable />` (with the existing `PaginationFooter`) could replace per-feature tables when more management screens are built.
- **Replace native dialogs**: introduce a global `ConfirmDialog` to drop remaining `window.alert` / `window.confirm` usage (global snackbars already exist for network/PWA update).
- **Remove dead code**: delete `feature/management-user/datasources/userDataSource.js` (mock dataset) and `slick-carousel` dependency if not adopted.

### Scalability Improvements

- **Per-feature SWR adoption**: switch the user list to `useSWR('/users', userService.getAllUsers)` for background revalidation, retry, and cache sharing across pages.
- **Global error / session expiry handling**: refresh failure still uses `window.location.replace('/login')`; a future AuthContext or router-level navigation could unify this with SPA transitions.
- **Code splitting per feature**: today route components are lazy-loaded but feature controllers / repositories still ship as common chunks. With more features, dynamic imports per feature module would matter.

### Better Architecture Patterns

- **Consider a thin auth context** (`AuthProvider`) that exposes `user`, `isAuthenticated`, `login()`, `logout()`. Today `useAuthController` + `utils/auth.js` cover this without a React context provider.
- **Type safety**: migrate to TypeScript progressively. The project already has `jsconfig.json` that enables `strict` semantics, and React Router 7 is fully typed.
- **Domain entities**: introduce a `User` model class (or zod/yup-typed object) so controllers and views can rely on a stable shape, even when the backend tweaks fields like `phone` vs `phone_number`.

### UI / UX Improvements

- **Re-enable the Customization Fab** (or replace it with a header gear icon).
- **Show a 404 page** for unknown routes (currently router falls back to its default error UI). Wire the existing `ErrorBoundary.jsx` via `errorElement` on both route groups, plus a catch-all `path: '*'` route.
- **Consistent toast feedback** for create/update/delete actions in user management.
- **Theme dark mode**: add `colorSchemes.dark` alongside the existing `light` scheme so `DEFAULT_THEME_MODE = 'system'` actually has somewhere to switch to.
- **Empty / not-found visuals**: `ContentEmptyState` and `ContentErrorState` are shared; extend to remaining management screens that still use ad-hoc empty branches.

### Testing Improvements

- ~~**Add Vitest**~~ — done: `vitest.config.mjs`, `yarn test`, 74+ test files.
- Expand RTL coverage for management-user CRUD views and E2E smoke tests for login → dashboard → patrol.
- **Linting in CI**: run `yarn lint` in CI to enforce the existing flat ESLint config.

---

## 15. Progressive Web App (PWA)

### Overview

The app uses **`vite-plugin-pwa`** with the **`generateSW`** strategy. Workbox **precaches** hashed build assets, and runtime caching is restricted to static assets only (`CacheFirst`). Protected API runtime caching is intentionally disabled for security; API mutation responses are never cached. SPA **navigations** fall back to precached **`index.html`** (offline app shell only — not API responses). Registration uses **`import { registerSW } from 'virtual:pwa-register'`** in `src/index.jsx` with `injectRegister: false` in the Vite plugin (registration is explicit in application code, not auto-injected into HTML).

Additionally, **`src/pwa/`** holds **client-side** persistence and sync plumbing (Dexie / IndexedDB), **network status** hooks, and **browser geolocation** primitives used by the patrol feature. **`src/feature/patrol/services/geolocationService.js`** implements **patrol-domain** GPS orchestration (singleton watch lifecycle, **`saveLocationLog`**) on top of those primitives. **`PartrolHome`** mounts **`PatrolPwaStatusPanel`** (reads **`pwa/db.js`**, **`flushSyncQueue`**, **`useNetworkStatus`**) without starting or stopping GPS.

### Manifest & icons

- **Manifest** filename: `manifest.webmanifest` (emitted to `dist/`).
- **Branding:** VeriPatrol icons and logos are used for browser/PWA surfaces (`favicon.svg`, `src/assets/images/logo.svg`, `src/assets/images/logo-dark.svg`).
- **Icons:** static PNGs under **`public/icons/`** (`icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png`) — copied to `dist/icons/` at build time.
- **Theme / meta:** `index.html` includes `<meta name="theme-color" content="#111827">` aligned with the manifest.

### Entry (`src/index.jsx`)

- Calls **`registerSW({ immediate: true, … })`** inside `typeof window !== 'undefined'` with try/catch.
- Logs basic online/offline events (`navigator.onLine`, `online` / `offline` listeners).
- **`src/vite-env.d.js`** references **`vite-plugin-pwa/client`** for TypeScript/IDE support of `virtual:pwa-register`.

### Installed app update behavior (`PwaUpdateSnackbar`, `useServiceWorkerUpdate`)

- **`vite-plugin-pwa`** uses `registerType: 'autoUpdate'` — a new service worker installs in the background when a new build is deployed.
- **`src/index.jsx`** registers the SW via `registerSW({ immediate: true, … })` from `virtual:pwa-register`.
- **`useServiceWorkerUpdate`** detects a **waiting** worker while a controller is active and sets `updateAvailable`.
- **`PwaUpdateSnackbar`** (mounted in **`App.jsx`**) shows **New update available** with **Reload now** — posts skip-waiting to the waiting worker and reloads the page (`reloadApplication`).
- Until the user reloads (or closes all tabs and reopens), the installed PWA may continue running the previous cached shell; precached assets update on reload.

### Offline UI & connectivity (`NetworkSnackbar`, `useNetworkStatus`)

- **`src/components/NetworkSnackbar.jsx`** is mounted globally from **`App.jsx`**. It shows a warning-style snackbar when the browser goes offline and a success-style snackbar when connectivity returns.
- **`src/pwa/useNetworkStatus.js`** exposes a boolean derived from **`navigator.onLine`** plus **`window`** **`online`** / **`offline`** listeners.
- On **`online`**, **`flushSyncQueue()`** from **`src/pwa/syncService.js`** runs (errors are logged only — UI must not crash).

### Background Sync (Milestone 16)

Dexie/API logic stays in the **app thread**; the service worker only schedules sync and asks open clients to flush.

| Step     | Where                                                                           | Behavior                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register | App (`backgroundSyncService`, `locationLogService`, `syncService`, `index.jsx`) | After **`saveLocationLog`**, after a failed flush, or on startup when **`sync_queue`** has **pending** / **failed** rows → **`registration.sync.register('pwa-sync-queue')`** (no-op if **`SyncManager`** missing). |
| Fire     | **`public/push-handlers.js`**                                                   | **`sync`** event with tag **`pwa-sync-queue`** → **`clients.matchAll`** → **`postMessage({ type: 'PWA_SYNC_REQUEST' })`**.                                                                                          |
| Flush    | **`src/index.jsx`**                                                             | Listens for SW messages; on **`PWA_SYNC_REQUEST`** → **`flushSyncQueue()`**.                                                                                                                                        |
| Fallback | **`useNetworkStatus`**, **`PatrolPwaStatusPanel`**                              | **`online`** event and **Retry Sync** unchanged when Background Sync is unsupported.                                                                                                                                |

**Outbound push (Milestone 9):** Laravel sends JSON payloads (`title`, `body`, `url`, `tag`, …) when patrol sessions complete/abort, checkpoint events become suspicious or need review, or validation finishes. Admins/operators receive monitoring deep links; guards may receive missed-checkpoint alerts.

**`push-handlers.js`:** `push` displays notifications; **`notificationclick`** opens `data.url` (or top-level `url`), focuses an existing window when possible (`client.navigate`), otherwise `openWindow`. Falls back to `/`.

### Service worker caching (M7)

Configured in **`vite.config.mjs`** → **`pwa/workbox-runtime-caching.mjs`** (emitted into **`dist/sw.js`** on build).

| Layer          | Strategy                           | Cache name      | Notes                                                                                                                                                                            |
| -------------- | ---------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Precache       | Workbox precache manifest          | (precache)      | Hashed **`dist/assets/*`**, `index.html`, icons — existing **`globPatterns`**                                                                                                    |
| Static runtime | **CacheFirst**                     | `static-assets` | `js`, `css`, images, fonts; **maxEntries 100**, **maxAge 30 days**                                                                                                               |
| App navigation | **`navigateFallback: index.html`** | precache        | Offline **app shell** for SPA routes; **`navigateFallbackAllowlist`** respects Vite **`base`** / React Router **`basename`**; denylist skips **`/api/*`** and excluded API paths |

**Security posture (M7):** Protected API responses are **not** runtime-cached. API writes (**POST/PUT/PATCH/DELETE**) are **never** cached by the service worker. Offline patrol evidence is stored in **IndexedDB** (Dexie) and uploaded via **`POST /pwa/sync`** — not via Workbox response caching.

### IndexedDB (Dexie) & sync queue

- **`src/pwa/db.js`** defines database **`PatrolPWA`** with schema migrations (**v1–v3**). Tables include **`location_logs`** (indexed fields include **`syncStatus`**, **`source`**, **`trackingState`** where applicable), **`sync_queue`** (**`payload`**, **`retryCount`**, **`lastAttempt`**), **`patrol_sessions`**, and **`notifications`** (schemas reserved for future use).
- **`src/pwa/locationLogService.js`** — **`saveLocationLog`** assigns **`crypto.randomUUID()`**, normalizes **`LOCATION_SOURCE`** (**`live` \| `resume` \| `sync`**) and **`TRACKING_STATE`** (**`active` \| `resumed` \| `offline`**), stores lat/lng/accuracy/speed/heading/**device `timestamp` (ms, strictly increasing per patrol session)**, sets **`syncStatus: pending`**, and inserts a companion **`sync_queue`** row whose **`payload`** mirrors fields sent later to **`POST /pwa/sync`**. Live watch positions use **`live`**; resume snapshots use **`resume`**; unknown/legacy values normalize to **`sync`**. Mobile browsers often repeat **`position.timestamp`** at second precision; duplicates are bumped by **+1 ms** before IndexedDB write so backend movement validation stays consistent with localhost.
- **`src/pwa/syncService.js`** — **`flushSyncQueue`** reconciles **`sync_queue`** with **`POST /pwa/sync`**: **200/201** → **`synced`** or **`duplicate_synced`**; **422** → **`validation_failed`** (no auto-retry); **409** → **`conflict`**; other errors → **`failed`** with **`retryCount`** until **`exhausted`** (≥ 5). **`PatrolPwaStatusPanel`** shows validation/conflict/exhausted counts.

### Geolocation layering (infrastructure vs patrol domain)

| Layer              | Module                                                  | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infrastructure** | **`src/pwa/geolocationService.js`**                     | **`navigator.geolocation`** only: **`getCurrentPosition`**, **`watchPosition`**, **`clearWatch`**, **`normalizeGeolocationError`**, **`DEFAULT_GEOLOCATION_OPTIONS`** (`enableHighAccuracy`, `timeout`, `maximumAge`). No IndexedDB / patrol semantics.                                                                                                                                                                         |
| **Patrol domain**  | **`src/feature/patrol/services/geolocationService.js`** | **`startPatrolTracking`**, **`stopPatrolTracking`**, **`capturePatrolLocationSnapshot`** (returns **`{ position, record }`**), **`calculateDistance`** (Haversine), **`isPatrolTrackingActive`**. Owns a **singleton** browser watch id; each persisted fix goes through **`saveLocationLog`** (PWA data layer). Supports **`skipInitialPersistAndFetch`** when the controller already ran **`capturePatrolLocationSnapshot`**. |

**`usePatrolController`** (`feature/patrol/controllers/usePatrolController.js`) starts tracking by:

1. **`capturePatrolLocationSnapshot`** with **`LOCATION_SOURCE.LIVE`** (IndexedDB + queue).
2. Updating UI / checkpoint proximity / **`recordPatrolRoute`** on that first **`GeolocationPosition`**.
3. **`startPatrolTracking`** with **`skipInitialPersistAndFetch: true`** so subsequent fixes use the same patrol service watch and persistence path.

It stops tracking with **`stopPatrolTracking`** on complete/unmount (replacing previous **`navigator.geolocation.clearWatch`** + local **`watchId`** state).

**Patrol ↔ Laravel ↔ PWA alignment**

| Concept                             | Frontend                                                                             | Laravel                                                                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical patrol row                | **`patrols.data.id`** from **`POST /patrol-sessions`**                               | **`patrol_sessions.id`**                                                                                                                                                                                                                                                  |
| Dexie **`location_logs.patrolId`**  | Same UUID as patrol session                                                          | **`location_logs.patrol_session_id`** on sync                                                                                                                                                                                                                             |
| **`POST /pwa/sync`** **`patrolId`** | Same UUID                                                                            | Must **`exists:patrol_sessions,id`**                                                                                                                                                                                                                                      |
| Route / movement display            | **`GET /patrol-routes`** (monitoring) — location_logs-backed                         | Canonical **`location_logs`**; legacy **`patrol_routes`** fallback only when a session has no usable logs                                                                                                                                                                 |
| Server location evidence            | Append-only via **`POST /pwa/sync`** (and optional direct **`POST /location-logs`**) | **`location_logs`** are immutable raw evidence — **no** HTTP update/delete (Milestone 13). The SPA does not call **`DELETE /location-logs`** and no longer dual-writes **`POST /patrol-routes`**. See [`../docs/system-update/patrol-location-logs-canonical-movement.md`](../docs/system-update/patrol-location-logs-canonical-movement.md). |

Geofence **auto-completion** for checkpoints: the controller computes distances vs a radius; on entry, **`patrolService.updateCheckpointLog`** PATCHes Laravel **`checkpoint_events`** with **`verified`**, **`detected_at`**, **`detection_type: continuous`**, and provisional **`confidence_score: 80`**. **Resume detection (Milestone 11):** on `visibilitychange` (visible) or `window` `focus`, if a patrol session is active, **`capturePatrolLocationSnapshot`** runs once with **`LOCATION_SOURCE.RESUME`** (5s cooldown; does **not** start/stop the GPS watch), then re-runs geofence checks. Resume GPS is persisted only via **`location_logs`** (Dexie + sync). Resume hits PATCH **`detection_type: resume`**, **`confidence_score: 65`**, and **`verified`** or **`uncertain`** when GPS accuracy is poor. Already-verified checkpoints are skipped. Per-event lat/lng are not persisted on checkpoint events — GPS remains in **`location_logs`**.

**Stop Patrol finalization (Milestone 2):** `usePatrolController.completePatrol` runs:

1. Stop GPS (`stopPatrolTracking` via patrol geolocation service).
2. `PUT /patrol-sessions/{id}` — `completed` + `ended_at`.
3. `finalizingStep: syncing` → `flushSyncQueue()`.
4. Inspect Dexie `sync_queue` (pending / failed / conflict / validation_failed / exhausted); set warning if any remain.
5. If **online**: `finalizingStep: validating` → `POST /patrol-sessions/{id}/validate` → store `validationResult` (errors are non-fatal).
6. If **offline**: skip validate; warning: _"Patrol saved locally. Validation will be available after sync."_
7. `finalizingStep: loading_summary` → `GET /patrol-sessions/{id}/summary`.
8. `finalizingStep: completed` — UI in **`PatrolSummaryCard`** shows validation + summary.

**Provisional vs authoritative:** Live geofence PATCH (`confidence_score` 80/65) is provisional. Backend **`POST …/validate`** upserts authoritative **`checkpoint_events`** + metrics; summary reflects post-validation state.

**Duplicate stop:** Ignored while `validatingPatrol` or `finalizingStep !== idle`.

**`PatrolPwaStatusPanel`:** Warns when sync queue has failed/conflict/validation_failed/exhausted rows — _"Some patrol logs require attention. Backend validation may be incomplete."_

### Patrol monitoring realtime (Milestone 5)

**Stack:** Laravel **Reverb** (backend) + **laravel-echo** / **pusher-js** (frontend). Services live in `src/services/realtime/` — **not** in feature views (views/controllers only consume hooks).

| File                                                              | Role                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `services/realtime/broadcastService.js`                           | Singleton Echo connection, JWT auth to `POST /broadcasting/auth`, private channel subscribe/unsubscribe |
| `services/realtime/usePatrolRealtime.js`                          | React hook: monitoring + optional session channel, connection state                                     |
| `services/realtime/patrolRealtimeNotifier.js`                     | Lightweight pub/sub for toast notifications                                                             |
| `feature/patrol-monitoring/components/PatrolRealtimeSnackbar.jsx` | MUI snackbar for realtime alerts                                                                        |
| `feature/patrol-monitoring/controllers/patrolRealtimeHandlers.js` | Maps websocket event names → controller state updates                                                   |

**Channels (private, admin JWT):**

| Channel                                    | Used by                                                                     |
| ------------------------------------------ | --------------------------------------------------------------------------- |
| `private-patrol.monitoring`                | Dashboard — session lifecycle, review checkpoints (`needs_review` / `suspicious`), validation completed |
| `private-patrol.session.{patrolSessionId}` | Session detail — route crumbs, checkpoint status, validation                |

**Events (listen with leading dot, e.g. `.PatrolRouteUpdated`):**

| Event                        | Payload highlights                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `PatrolSessionStarted`       | `patrol_session_id`, `session`                                                               |
| `PatrolSessionCompleted`     | `patrol_session_id`, `status`, `session`                                                     |
| `PatrolCheckpointVerified`   | `checkpoint_event_id`, `checkpoint_id`, `status`, `confidence_score`, `detected_at`, `event` |
| `PatrolCheckpointSuspicious` | Same shape; fired for `suspicious`, `needs_review`, or legacy `uncertain`; frontend increments `suspiciousEvents` only when `status === 'suspicious'` |
| `PatrolRouteUpdated`         | Compact scalars from **`location_logs`**: `patrol_session_id`, `id` / `location_log_id`, `latitude`, `longitude`, `accuracy`, `recorded_at` |
| `PatrolValidationCompleted`  | `patrol_session_id`, `validation`                                                            |

**Reconnect / fallback:**

- Echo connection states exposed as `connectionState` / `isConnected` on controllers.
- When **not** connected, dashboard and detail run **30s polling** (`loadStats` / `loadSessions` / `loadAll`) — existing REST flows unchanged.
- Set `VITE_REVERB_ENABLED=false` or omit `VITE_REVERB_APP_KEY` to disable websockets (polling only).

**Frontend env (build-time):**

| Variable              | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `VITE_REVERB_APP_KEY` | Reverb app key (must match backend `REVERB_APP_KEY`) |
| `VITE_REVERB_HOST`    | WebSocket host (e.g. `localhost`)                    |
| `VITE_REVERB_PORT`    | WebSocket port (e.g. `8080`)                         |
| `VITE_REVERB_SCHEME`  | `http` or `https`                                    |
| `VITE_REVERB_ENABLED` | Optional; `false` disables realtime                  |

**Toasts:** suspicious checkpoint (strong evidence only), checkpoint needs review, patrol completed/aborted, validation completed, large GPS gap (>300s between route points on detail map).

**Map:** `PatrolRouteMap` incrementally appends polyline points on live `PatrolRouteUpdated` (preserves zoom after initial fit). After validation, overlays **movement review items** (route concerns, speed review, GPS quality context) from `anomalies.items` (backend `POST …/validate` or `PatrolValidationCompleted.validation`).

**Run Reverb locally:** `php artisan reverb:start` (backend) with `BROADCAST_CONNECTION=reverb`.

### Patrol monitoring dashboard (Milestone 3 + 4 + 10 + 11)

**Module:** `src/feature/patrol-monitoring/` — view → controller → repository → `patrolMonitoringService`.

| File                                              | Role                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `views/PatrolMonitoringDashboard.jsx`             | Stats cards, filters, session table, pagination, shared `LiveIndicator` in title                          |
| `views/PatrolSessionDetail.jsx`                   | Session info, summary, **patrol route map**, **replay controls**, checkpoint events, **Re-run Validation**                                |
| `controllers/usePatrolMonitoringController.js`    | List loading, filters, summary prefetch for completed rows                                                                                |
| `controllers/usePatrolSessionDetailController.js` | Detail load; validation + reload summary/events/**routes**; stores `anomalies`, `selectedAnomaly`, `showAnomalies` from validation result |
| `datasources/patrolMonitoringService.js`          | Laravel API adapter (401/403/422/409/5xx messages)                                                                                        |
| `components/PatrolSessionTable.jsx`               | Dashboard table                                                                                                                           |
| `components/PatrolStatusChip.jsx`                 | Status chips (patrol / checkpoint / confidence)                                                                                           |
| `components/PatrolConfidenceCard.jsx`             | Summary confidence display                                                                                                                |
| `components/CheckpointStatusSummary.jsx`          | Legacy count boxes (optional; no longer shown on session detail — counts remain in API/summary)                                            |
| `components/PatrolRouteMap.jsx`                   | Leaflet map: trail, breadcrumbs, checkpoints, start/end, GPS gaps, **movement review overlays**; **Map / Satellite** layer switcher via `utils/leafletBaseLayers.js` |
| `components/PatrolAnomalyList.jsx`                | Clickable list of validation anomalies (type, severity, time range); opens from **Movement review** dialog on session detail                |
| `components/MapLegend.jsx`                        | Map color legend (route, gaps, checkpoints, **anomaly types**); opens from **Map legend** dialog on session detail                         |
| `utils/patrolStatusUtils.js`                      | M8 checkpoint labels/colors/map colors + **`CHECKPOINT_STATUS_HELP`** tooltip copy for chips and tables                                   |
| `utils/patrolAnomalyUtils.js`                     | Normalizes `anomalies.items`, popup HTML, map styles, severity counts                                                                     |
| `controllers/usePatrolReplayController.js`        | Replay playback state (play/pause/seek/speed) over sorted route points from **`GET /patrol-routes`** (location_logs-backed via `PatrolMovementService`) |
| `components/PatrolReplayControls.jsx`             | MUI replay toolbar (play, stop, slider, speed, time/coords)                                                                               |
| `utils/patrolReplayUtils.js`                      | Route sort by `recorded_at`, step delay cap, checkpoint/anomaly timeline helpers                                                          |

**Dashboard:** `GET /patrol-sessions` with server pagination; optional `status` and `zone_id` filters; client search on guard/zone name (loads up to 100 rows when searching). Stats use lightweight `per_page=1` meta totals. Needs-review and suspicious headline counts come from `GET /checkpoint-events?status=…` totals.

**Detail:** Loads session, summary, checkpoint events, and patrol routes (`GET /patrol-routes?patrol_session_id={id}`). **Patrol route map** uses Leaflet from CDN (`index.html`) with a shared **Map / Satellite** base-layer control (`src/utils/leafletBaseLayers.js` — OpenStreetMap + Esri World Imagery); shows checkpoint markers by status color, polyline trail ordered by `recorded_at`, breadcrumb dots, start/end pins, and dashed **GPS gap** segments when consecutive route points differ by **> 30s**. **Map legend** and **Movement review** are available via info link / dialog (not always visible). Checkpoint status chips in the events table expose hover tooltips from **`patrolStatusUtils`**. Auto-fits bounds to routes + checkpoints. Empty state: _"No patrol route data available."_ **Re-run Validation** calls `POST /patrol-sessions/{id}/validate` (backend authoritative — same engine as guard stop flow), then refreshes summary, events, and routes. Failures show an alert without crashing the page.

#### Movement review visualization (Milestone 10 / M8)

**Data source:** `validationResult.anomalies.items` from `POST /patrol-sessions/{id}/validate` (not a separate GET). The controller extracts items via `extractAnomalyItems()` and passes them to the map and list. Realtime: `PatrolValidationCompleted` includes the full validation payload when broadcast; the detail handler updates anomalies the same way as **Re-run Validation**.

**Anomaly types (map styling):**

| Backend `type`      | Map overlay                      | Color            |
| ------------------- | -------------------------------- | ---------------- |
| `speed_anomaly`     | Dashed polyline between logs     | Red `#dc2626`    |
| `gps_jump`          | Dashed polyline                  | Purple `#9333ea` |
| `poor_accuracy`     | Dashed segment (segment bounds)  | Orange `#ea580c` |
| `route_deviation`   | Dashed segment (route concern)   | Amber `#ca8a04`  |
| `timestamp_issue`   | Circle marker (point or segment) | Dark `#1e293b`   |

Each overlay has a Leaflet popup: type, severity, message, time range, distance/speed when provided by the backend.

**UX (M8):** After validation, **Movement review** is available from a link on the session detail page (dialog). Empty list: _"No route concerns detected."_ Status chips use M8 labels (`verified`, `partial`, `needs_review`, `suspicious`, `missed`) with hover tooltips; legacy `uncertain`/`rejected` display as **Needs review** / **Missed**. See `docs/system-update/m8-patrol-validation-tuning.md`.

**Realtime checkpoint broadcasts:** `PatrolCheckpointVerified` and `PatrolCheckpointSuspicious` cover live status changes. The suspicious channel name is legacy; payloads may carry `verified`, `suspicious`, or `needs_review` (legacy `uncertain`). The frontend increments dashboard counters and shows toasts only for `suspicious` and `needs_review` respectively. **`partial` is not broadcast as a live alert** — it appears after validation completes, session reload, or **Re-run Validation** (same as other non-alert evidence states).

**Relation to backend:** Coordinates come from `location_logs` used by `PatrolValidationService` (M8-tuned movement rules; see `config/patrol_validation.php`). Route polyline uses points from **`GET /patrol-routes`** (location_logs-backed via `PatrolMovementService`; legacy `patrol_routes` fallback only when a session has no usable logs); movement review overlays use validation log coordinates (typically aligned after PWA sync).

#### Patrol replay (Milestone 11)

**Data source:** `GET /patrol-routes?patrol_session_id={id}` (no new backend endpoint). Routes are sorted client-side by `recorded_at` before playback.

**Availability:** Replay is enabled only when session `status` is **`completed`** or **`aborted`**. Active sessions show _"Replay available after patrol is completed."_

**Controller:** `usePatrolReplayController` — state: `isPlaying`, `currentIndex`, `speedMultiplier` (0.5×, 1×, 2×, 5×, 10×), `currentRoutePoint`, `replayProgress` (0–100%), `replayTime`, `replayFinished`. Methods: `play`, `pause`, `stop`/`reset`, `seek(index | 0–1 fraction)`, `setSpeedMultiplier`.

**Timing:** Step delay uses delta between consecutive `recorded_at` values divided by speed multiplier, capped at **1500 ms** per step (long GPS gaps do not stall replay). Missing timestamps use a default step interval. Requires **≥ 2** route points.

**Map (`PatrolRouteMap` replay props):** `replayPoint`, `replayActive`, `replayProgressIndex`, `highlightedCheckpointIds`. During replay: green **traversed** polyline, dashed gray **remaining** polyline, cyan **guard** marker; base trail dimmed. Does **not** re-fit bounds on each step (initial fit only). Live realtime route append and anomaly overlays remain intact.

**Timeline UX:** Checkpoints with `detected_at` ≤ current replay time are emphasized (larger marker, gold ring). When replay time overlaps a validation anomaly window, `PatrolReplayControls` shows a warning chip (e.g. _"Anomaly at current segment: speed anomaly"_).

**Map library:** No npm `leaflet` package — reuses global **`window.L`** (Leaflet 1.9.4 CDN in `index.html`). All Leaflet maps use **`addLeafletBaseLayersControl`** from **`src/utils/leafletBaseLayers.js`** (OpenStreetMap **Map** default + Esri **Satellite**). Same pattern in `feature/management-checkpoint/components/LeafletMap.jsx`, `CheckpointMapPicker.jsx`, `feature/dashboard/components/DashboardMapPanel.jsx`, `PatrolRouteMap.jsx`, and **`feature/patrol-history/components/LeafletMap.jsx`** (legacy patrol history route view).

**Provisional vs authoritative:** Dashboard reflects backend-persisted `checkpoint_events` after validation; guard live PATCH scores remain provisional until validate runs.

### ANPR monitoring dashboard (Milestone 10 + M12 live polling)

**Module:** `src/feature/anpr-monitoring/` — view → controller → repository → `anprMonitoringService`.

| File                                           | Role                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `views/AnprEventList.jsx`                      | List page: filters, table, pagination, refresh, blinking red dot live indicator (tooltip only)            |
| `views/AnprEventDetail.jsx`                    | Detail page: status chips, summary cards, evidence gallery, back/refresh                                  |
| `controllers/useAnprMonitoringController.js`   | `useAnprMonitoringController` (list + M12 live polling) + `useAnprEventDetailController` (detail)         |
| `repositories/AnprMonitoringRepository.js`     | Normalize events/images; build backend filter query params (`sort`, `direction`); unwrap Laravel paginator |
| `datasources/anprMonitoringService.js`         | Laravel API adapter (`/anpr-events`, `/anpr-images`)                                                     |
| `components/AnprEventTable.jsx`                | Detection table with new-row highlighting                                                               |
| `components/AnprLiveIndicator.jsx`             | Re-export of shared `ui-component/LiveIndicator`                                                          |
| `components/AnprEventSummaryCards.jsx`         | Plate, confidence, camera, vehicle, coordinates                                                         |
| `components/AnprEvidenceGallery.jsx`           | Ordered full/plate/annotated cards; JWT blob fetch for protected file URLs                                |
| `components/AnprStatusChip.jsx`                | Validity, flagged, evidence chips                                                                         |
| `components/AnprEmptyState.jsx`                | Empty list placeholder                                                                                    |

**List:** `GET /anpr-events` with server pagination and filters (`plate_number`, `is_valid`, `is_flagged`, `sort=detection_time`, `direction=desc`). **M12:** auto-refreshes every 5 seconds while the page is open; manual **Refresh** reloads the current page; new detections are highlighted for ~4 seconds. **M15:** repeated poll failures use exponential backoff (5s base, 30s cap); successful poll resets live status; list rows use `images_count` for evidence badges when full image arrays are not returned.

**Live indicator:** Blinking red dot beside the page title (shared `ui-component/LiveIndicator`). Tooltip: **Live update** (or reconnecting/paused tooltips). No `LIVE` text label or last-updated timestamp in the header or body. On polling failure, shows `RECONNECTING` without clearing existing rows; backoff reduces request spam until the backend recovers. Patrol Monitoring uses the same indicator component and visual style.

**Detail:** `GET /anpr-events/{id}` first; `GET /anpr-images?anpr_event_id=…` only when images are missing from the detail payload. Displays summary + evidence only — **no** event logs and **no** raw metadata panel.

**Camera panel:** Shows name, location, and active/inactive status only. Does not display IP address, port, RTSP URL, username, or password.

**Security:** Does not render `event.raw` or backend lifecycle logs. Camera credentials and network details are omitted from ANPR API responses via `AnprCameraResource` on the backend.

**Cross-repo doc:** `anpr/docs/m15-performance-and-accuracy-tuning-architecture.md` (M15); `anpr/docs/m12-live-anpr-monitoring-architecture.md` (M12); `anpr/docs/m10-frontend-anpr-feature-architecture.md` (M10)

### Vehicle management (Milestone 13)

**Module:** `src/feature/management-vehicle/` — view → controller → repository → `vehicleManagementService`.

| File | Role |
| ---- | ---- |
| `views/VehicleList.jsx` | Admin list: search, table, pagination, edit drawer |
| `views/VehicleDetail.jsx` | Admin detail: read-only plate/source, editable metadata via drawer |
| `controllers/useVehicleManagementController.js` | List + detail controllers |
| `repositories/VehicleManagementRepository.js` | Normalize vehicles; build update payloads |
| `datasources/vehicleManagementService.js` | Laravel `/vehicles` adapter |
| `components/VehicleTable.jsx` | Vehicle list table |
| `components/VehicleEditDrawer.jsx` | Edit owner/type/status/notes; plate/source disabled |
| `components/VehicleStatusChip.jsx` | Status and source chips |

**Routes:** `/admin/management-vehicle`, `/admin/management-vehicle/view/:vehicleId` — **Admin only**.

**Menu:** Admin → Management → Vehicle.

**API:** `GET /vehicles`, `GET /vehicles/{id}`, `PATCH /vehicles/{id}` (admin-only). Plate number and source are read-only in the UI and prohibited on backend update.

**ANPR detail link:** Admins see **Open vehicle record** on linked vehicle cards in ANPR event detail. Security Operators see vehicle context read-only without admin management navigation.

**Cross-repo doc:** `anpr/docs/m13-linked-vehicle-record-architecture.md`

### Sidebar install UX

- **`usePwaInstallPrompt`** is invoked from **`layout/MainLayout/Sidebar/index.jsx`** (not only inside the button component) so `beforeinstallprompt` can be captured **before** the mobile drawer opens.
- **`SidebarPwaInstall.jsx`** renders the **Install App** button when `showInstallButton` is true (Chromium-style browsers that expose the deferred prompt). Wrapped in an error boundary so failures hide only this UI.
- **Mobile layout:** For `useMediaQuery(theme.breakpoints.down('md'))`, the sidebar avoids the shared **`SimpleBar`** wrapper for the menu list (see [Section 3 — `ui-component/third-party/SimpleBar.jsx`](#3-directory-structure)) so the install button stays visible at the bottom of the drawer.

### Platform notes

- **`beforeinstallprompt`** is **not** available on iOS Safari; the install button typically appears only on browsers that support it (e.g. Chrome on Android).
- **`navigator.standalone`** is iOS-specific; Android ignores it.

### Related source files

| Path                                                                                                                                                   | Role                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.mjs`                                                                                                                                      | `VitePWA({ manifest, workbox, registerType: 'autoUpdate', injectRegister: false, … })` — **`pwa/workbox-runtime-caching.mjs`** supplies **`runtimeCaching`** + navigation fallback lists |
| `pwa/workbox-runtime-caching.mjs`                                                                                                                      | Workbox **runtimeCaching**: **`static-assets`** (CacheFirst, 30d) only. Protected API GET and mutation responses are not runtime-cached. Navigation fallback denylist excludes API paths. |
| `hooks/usePwaInstallPrompt.js`                                                                                                                         | Install prompt state + safe media-query listeners                                                                                                                                        |
| `layout/MainLayout/Sidebar/SidebarPwaInstall.jsx`                                                                                                      | Install button UI + optional mobile debug logs                                                                                                                                           |
| `App.jsx`                                                                                                                                              | Global **`NetworkSnackbar`**, **`PwaUpdateSnackbar`**, **`SessionExpiredDialog`**                                                                                                                                                             |
| `components/PwaUpdateSnackbar.jsx`, `pwa/useServiceWorkerUpdate.js`                                                                                    | Installed PWA / SW update prompt and reload flow                                                                                                                                                                                              |
| `public/push-handlers.js`                                                                                                                              | Workbox **`importScripts`**: inbound Web Push display, **`notificationclick`** deep links, Background **`sync`** → **`PWA_SYNC_REQUEST`**                                                |
| `pwa/pushNotificationService.js`                                                                                                                       | Subscribe/unsubscribe + **`sendTestNotification()`**                                                                                                                                     |
| `feature/patrol/components/PatrolPwaStatusPanel.jsx`                                                                                                   | Push permission/subscription UI + test button                                                                                                                                            |
| `pwa/db.js`, `pwa/locationLogService.js`, `pwa/syncService.js`, `pwa/backgroundSyncService.js`, `pwa/useNetworkStatus.js`, `pwa/geolocationService.js` | Offline storage, sync POST (**`/pwa/sync`**), Background Sync registration, connectivity hook, browser geo primitives                                                                    |
| `feature/patrol/services/geolocationService.js`                                                                                                        | Patrol GPS orchestration + **`saveLocationLog`**                                                                                                                                         |
| `feature/patrol/controllers/usePatrolController.js`                                                                                                    | Patrol workflow; sole starter/stopper of patrol GPS (not raw **`navigator.geolocation`**)                                                                                                |
| `feature/patrol/components/PatrolPwaStatusPanel.jsx`                                                                                                   | Patrol-page PWA/GPS status (Dexie queries ~3s, Retry **`flushSyncQueue`**)                                                                                                               |
| `feature/patrol/components/PatrolTracking.jsx`                                                                                                         | Presentational checkpoint list + coords (**no** **`startPatrolTracking`** / **`stopPatrolTracking`**)                                                                                    |
| `feature/patrol/views/PartrolHome.jsx`                                                                                                                 | Only guard patrol route UI; composes **`PatrolTracking`** + **`PatrolPwaStatusPanel`**                                                                                                   |
| `feature/authentication/datasources/authService.js`                                                                                                    | `POST /auth/logout`                                                                                                                                                                      |
| `feature/authentication/repositories/authRepository.js`                                                                                                | Delegates logout to `authService`                                                                                                                                                        |
| `feature/authentication/controllers/useAuthController.js`                                                                                              | `currentUser`, `handleLogout`, cross-tab session sync (used by patrol + Profile menu)                                                                                                    |
| `layout/MainLayout/Header/ProfileSection/index.jsx`                                                                                                    | Profile menu; Logout → `handleLogout`                                                                                                                                                    |
| `services/realtime/broadcastService.js`                                                                                                                | `disconnect()` on logout (Echo teardown)                                                                                                                                                 |
| `feature/management-checkpoint/`                                                                                                                       | Admin checkpoint CRUD — see below                                                                                                                                                        |

### Zone management

**Access:** **Admin** only (`RoleProtectedRoute` + `menu-items/admin.js` → Management → **Zone**).

**Architecture:** `views` → `useZoneController` / `useZoneFormController` → `ZoneRepository` → `zoneService` → `api.js`.

**Database fields used:** `id`, `name`, `description`, `created_by` (optional on API; not in admin forms), `checkpoints_count` (read-only), `created_at`, `updated_at`. API may return nested `creator` but admin UI does not display it.

**API methods (`zoneService.js`):**

| Method                | HTTP                       | Notes                                                                 |
| --------------------- | -------------------------- | --------------------------------------------------------------------- |
| `getAllZones(params)` | `GET /zones`               | Query: `page`, `per_page`, `search`, `sort` (`latest` default)      |
| `getZoneById(id)`     | `GET /zones/{id}`          | Returns `{ success, message, data }`                                  |
| `createZone(data)`    | `POST /zones`              | Admin-only; body: `name`, `description` (nullable)                    |
| `updateZone(id,data)` | `PATCH /zones/{id}`        | Admin-only                                                            |
| `deleteZone(id)`      | `DELETE /zones/{id}`       | Backend returns **204**                                               |

**Create / update payload (frontend → Laravel):**

```json
{
  "name": "Main Entrance",
  "description": "Primary public access point."
}
```

Empty description is sent as `null`. Only `name` is required client-side.

**List response mapping:** `useZoneController` calls `repository.normalizeZoneListResponse(payload)` → `items` from `data.data`, `total` from `meta.total`.

**Form fields:** `name` (required, max 255), `description` (optional, max 1000). Legacy fields removed (`code`, `zone_type`, `priority_level`, `center_latitude`, `center_longitude`).

**List UI:** Server-side search (`search` query), pagination (`page`, `per_page`; default **`rowsPerPage` = 5**), columns: row number, `name`, `checkpoints_count`, `updated_at` (Malaysia time), actions (view / edit / delete). Empty state: “No zones found.” Errors shown via `Alert` + delete feedback via `Snackbar`.

**Zone detail (`/admin/management-zone/view/:zoneId`):** Renders `CheckpointList` scoped to the zone (same component as global checkpoint list, `zoneId` from route params). `ZoneProfileData` shows name, checkpoints count, description, created at, last modified (**Created by** / `creator` is omitted from UI only; still returned by API). Embedded checkpoint table hides the **Zone** filter and **Zone** column. **Create checkpoint** passes `location.state.zoneId` to `/admin/management-checkpoint/create`. **Back** on zone-scoped list returns to `/admin/management-zone`. Default page size **5**.

**Zone view route:** `/admin/management-zone/view/:zoneId` → `CheckpointList` (not a separate `ZoneView` page). Zone profile is the header block above the embedded checkpoint table.

**Frontend files:**

| Path | Role |
| ---- | ---- |
| `feature/management-zone/views/ZoneList.jsx` | List + toolbar + pagination |
| `feature/management-zone/views/ZoneAdd.jsx` | Create form |
| `feature/management-zone/views/ZoneEdit.jsx` | Edit form |
| `feature/management-zone/controllers/useZoneController.js` | List logic |
| `feature/management-zone/controllers/useZoneFormController.js` | Create/edit logic |
| `feature/management-zone/repositories/zoneRepository.js` | Response normalization |
| `feature/management-zone/datasources/zoneService.js` | HTTP client |
| `feature/management-zone/utils/zoneValidation.js` | Client + API error mapping |
| `feature/management-checkpoint/components/view/ZoneProfileData.jsx` | Zone detail header on view route |

**Known limitations:** `created_by` is not set automatically from the logged-in admin in the UI (optional API field). Zone delete does not warn about dependent patrol sessions (`patrol_sessions.zone_id` is `restrict` on delete at DB level — delete may fail if sessions exist).

### Checkpoint management (Milestone 8)

**Access:** **Admin** only (`RoleProtectedRoute` + `menu-items/admin.js` → Management → **Checkpoint**). Security Operator and Guard do not see this menu item.

**Architecture:** `views` → `useCheckpointController` / `useCheckpointFormController` / `useCheckpointViewController` → `CheckpointRepository` → `checkpointService` → `api.js`. Global checkpoint list still loads zones for the zone filter via `checkpointService.getZones()`; create/edit forms do **not** expose a zone dropdown (zone is fixed from route state or loaded checkpoint).

**API methods (`checkpointService.js`):**

| Method                       | HTTP                       | Notes                                                                        |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `getCheckpoints(params)`     | `GET /checkpoints`         | Query: `page`, `per_page`, `zone_id`, `is_active`, `location_type`, `search` |
| `getCheckpointById(id)`      | `GET /checkpoints/{id}`    | Includes nested `zone`                                                       |
| `createCheckpoint(data)`     | `POST /checkpoints`        |                                                                              |
| `updateCheckpoint(id, data)` | `PATCH /checkpoints/{id}`  |                                                                              |
| `deleteCheckpoint(id)`       | `DELETE /checkpoints/{id}` | Backend returns **204**                                                      |

**Form fields:** `name`, `zone_id` (fixed from zone context — **not** shown as a dropdown), `latitude`, `longitude`, `radius` (5–100 m per backend validation), `location_type`, `is_active`.

**`location_type` (create/edit):** `SelectFieldContainer` dropdown (`LOCATION_TYPE_OPTIONS` in `checkpointConstants.js`). UI labels **Outdoor** / **Indoor**; submitted values **`outdoor`** / **`indoor`** (matches DB enum). Default on create: `outdoor`. On edit, the current checkpoint value is preselected via `normalizeLocationType()`. Client validation rejects any value outside `outdoor` \| `indoor`.

Create receives `zoneId` via React Router `location.state` from `/admin/management-zone/view/:zoneId` → **Create checkpoint**. Without zone context, the form shows a warning and is disabled. Edit resolves `zone_id` from the loaded checkpoint (or route state). Switching type on create sets recommended radius (outdoor **20**, indoor **40**). On edit, changing type does **not** auto-change radius — use **Use recommended radius** button.

**Create / edit navigation:** **Back** on `CheckpointCreate` and `CheckpointEdit` returns to `/admin/management-zone/view/{zoneId}` when zone context exists; otherwise falls back to the checkpoint list. Success modal still redirects to checkpoint detail after save.

**Map picker (`CheckpointMapPicker.jsx`):** Leaflet via global `window.L` (CDN in `index.html`) with **Map / Satellite** layer control (`leafletBaseLayers.js`). Default center when coordinates are unset: **`2.2260014, 102.455422`** (`DEFAULT_MAP_CENTER` in `checkpointConstants.js`). Instruction text: `Click the map or drag the marker to set coordinates. Drag the map to pan. The circle shows the checkpoint radius.` Map click and marker `dragend` update form latitude/longitude via `onCoordinatesChange`; map drag only pans. **Recenter** button (top-right overlay) pans the map to the selected checkpoint coordinates, or to the default center when none are selected yet. Event handlers use refs (`disabledRef`, `onCoordinatesChangeRef`, `recenterTargetRef`) so coordinates still update after the form finishes loading (avoids stale `disabled=true` closure from initial render). Cursor uses **grab/grabbing** for pan; marker uses **grab/grabbing** while dragging. Radius circle stays synced with marker position.

**Read-only detail map (`LeafletMap.jsx`):** Instruction text: `Drag the map to pan. The circle shows the checkpoint radius.` No click-to-set and no marker drag on detail view. **Recenter** button recenters on the checkpoint coordinates.

**Coordinate normalization:** `normalizeCoordinate()` (`utils/coordinateUtils.js`) is applied to manual input, map click, marker drag, and loaded checkpoint values. It clamps latitude/longitude ranges, limits precision to **7 decimals**, and limits the final coordinate string to **10 chars** where possible to avoid UI freezes from extremely long inputs.

**List UI:** Search by name, filter by zone / active / location type (zone filter hidden on zone detail page), server-side pagination (default **`rowsPerPage` = 5**), view / edit / delete actions. Delete uses `window.confirm` (technical debt — prefer MUI dialog later). Snackbar feedback on delete.

**Detail UI (`CheckpointView`):** `DetailCard` supports optional `headerActions` (Edit button beside Back). **Edit checkpoint** uses `color="primary"`, contained. **Back** navigates to `/admin/management-zone/view/{zoneId}` using `checkpoint.zone_id` or `checkpoint.zone.id` (falls back to checkpoint list if zone is missing). Profile layout: column 1 — **Name** + **Location type**; column 2 — radius / coordinates; column 3 — **Created** + **Status** + **Last updated**.

**Frontend files (checkpoint module):**

| Path | Role |
| ---- | ---- |
| `feature/management-checkpoint/views/CheckpointList.jsx` | List (global or zone-scoped) |
| `feature/management-checkpoint/views/CheckpointCreate.jsx` | Create |
| `feature/management-checkpoint/views/CheckpointEdit.jsx` | Edit |
| `feature/management-checkpoint/views/CheckpointView.jsx` | Detail + read-only map |
| `feature/management-checkpoint/controllers/useCheckpointController.js` | List logic |
| `feature/management-checkpoint/controllers/useCheckpointFormController.js` | Create/edit logic |
| `feature/management-checkpoint/controllers/useCheckpointViewController.js` | Detail logic |
| `feature/management-checkpoint/components/CheckpointForm.jsx` | Shared form |
| `feature/management-checkpoint/components/CheckpointMapPicker.jsx` | Interactive map (create/edit) |
| `feature/management-checkpoint/components/LeafletMap.jsx` | Read-only map (view) |
| `feature/management-checkpoint/utils/checkpointConstants.js` | `LOCATION_TYPE_OPTIONS`, radii, default map center (`2.2260014, 102.455422`) |
| `feature/management-checkpoint/utils/checkpointValidation.js` | Client validation + payload |
| `feature/management-checkpoint/utils/coordinateUtils.js` | `normalizeCoordinate()` |
| `feature/management-checkpoint/repositories/checkpointRepository.js` | API normalization |
| `feature/management-checkpoint/datasources/checkpointService.js` | HTTP client |

**Removed / unused:** `zoneDataSource.js` (mock), `useZoneAddController.js`, `ZoneView.jsx` (zone detail uses scoped `CheckpointList`).

**Delete:** Does not touch PWA IndexedDB or patrol runtime data — only removes the checkpoint record on the server.

---

_Last updated: includes **zone management** alignment (`management-zone` CRUD, server pagination, zone-scoped checkpoint list), **checkpoint management** updates (zone-fixed forms, `location_type` select, map coordinate handling with `normalizeCoordinate`, navigation back to zone detail, read-only view map), and prior milestones (patrol replay, movement review map overlays, Web Push, checkpoint CRUD, logout, role routes, patrol monitoring, PWA sync, M8 validation tuning). Keep this file in sync whenever routing, authentication, API contracts, or feature modules change. Source files remain the source of truth._
