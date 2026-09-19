# M7 — PWA Tuning and App Branding

**Milestone:** M7  
**Status:** Automated verification complete (manual device QA pending)  
**Completion Date:** 2026-07-02

---

## 1. Executive Summary

M7 upgraded the React application into a cleaner, branded, and safer Progressive Web App under the **VeriPatrol** identity.  
The work focused on five sub-milestones: brand assets, manifest alignment, service worker cache hardening, patrol sync resilience validation, and install UX improvements.

Key security outcomes:

- Protected API responses are no longer runtime-cached by Workbox.
- API mutation endpoints remain uncached.
- Patrol sync queue evidence remains preserved on auth refresh failures.
- PWA sync continues to use shared `api.js` refresh-on-401 behavior without duplicate token-refresh logic.

---

## 2. Scope

### In Scope

- M7.1 App logo and manifest icons.
- M7.2 Manifest and HTML metadata cleanup.
- M7.3 Service worker runtime caching hardening.
- M7.4 Background Sync / PWA sync validation support files and tests.
- M7.5 Install UX behavior and tests.
- M7 milestone documentation and focused frontend documentation updates.

### Out of Scope

- Backend auth model changes.
- 2FA policy changes.
- Camera identity/login model changes.
- Patrol validation algorithm changes.
- Web3/blockchain frontend calls.
- Unrelated dashboard/profile/backend refactors.

---

## 3. Files Changed

### Branding and Icons (M7.1)

- `frontend/src/assets/images/logo.svg`
- `frontend/src/assets/images/logo-dark.svg`
- `frontend/favicon.svg`
- `frontend/public/icons/veripatrol-icon.svg`
- `frontend/public/icons/icon-192.png`
- `frontend/public/icons/icon-512.png`
- `frontend/public/icons/icon-512-maskable.png`
- `frontend/public/icons/apple-touch-icon.png`
- `frontend/src/ui-component/Logo.jsx`

### Manifest and Metadata (M7.2)

- `frontend/vite.config.mjs`
- `frontend/index.html`

### Service Worker Caching Review (M7.3)

- `frontend/pwa/workbox-runtime-caching.mjs`
- `frontend/public/push-handlers.js`
- `frontend/src/pwa/workbox-runtime-caching.test.js` (new)

### Background Sync / PWA Sync Validation (M7.4)

- `frontend/src/pwa/backgroundSyncService.test.js` (new)

### Install UX (M7.5)

- `frontend/src/hooks/usePwaInstallPrompt.js`
- `frontend/src/hooks/usePwaInstallPrompt.test.jsx` (new)
- `frontend/src/layout/MainLayout/Sidebar/index.jsx`
- `frontend/src/layout/MainLayout/Sidebar/SidebarPwaInstall.jsx`
- `frontend/src/layout/MainLayout/Sidebar/SidebarPwaInstall.test.jsx` (new)

### Related Documentation

- `docs/system-update/m7-pwa-tuning-and-app-branding.md` (new)
- `frontend/documentation.md` (updated)

---

## 4. Implementation Details by Sub-Milestone

## 4.1 M7.1 — App Logo and Manifest Icons

- Replaced legacy/template identity with a consistent **VeriPatrol** visual set.
- Added a source vector icon (`veripatrol-icon.svg`) and generated production PNG icon outputs.
- Updated app logo render path in `Logo.jsx` to use `src/assets/images/logo.svg`.
- Added dark variant `logo-dark.svg` for dark-shell compatibility.
- Added a new shield/check/radar motif designed for small-size readability.
- Generated `icon-512-maskable.png` with additional safe-zone padding to reduce Android launcher cropping risk.

## 4.2 M7.2 — Manifest Cleanup

- Updated `vite.config.mjs` PWA manifest to:
  - `name: VeriPatrol`
  - `short_name: VeriPatrol`
  - `description` aligned to product scope
  - `display: standalone`
  - `start_url` and `scope` based on `viteBasePath`
  - icon set including 192, 512, maskable 512, and Apple touch icon
  - `background_color` aligned to dark shell
- Updated `index.html`:
  - favicon and Apple icon links with `%BASE_URL%` compatibility for non-root deployments
  - mobile/PWA tags (`theme-color`, Apple web-app tags)
  - metadata cleanup to remove outdated branding references
  - removed CodedThemes third-party tracking script and legacy template comments

## 4.3 M7.3 — Service Worker Caching Review

- Hardened runtime cache policy in `workbox-runtime-caching.mjs`:
  - keeps static hashed asset caching (`CacheFirst`)
  - removes runtime caching for protected API GET endpoints
  - keeps API and configured API-base paths denied from SPA fallback
- Maintains `navigateFallback` only for SPA routes and prevents API fallback leakage.
- Updated push service-worker defaults in `push-handlers.js`:
  - default title to `VeriPatrol`
  - relative icon paths (`icons/...`) for base-path compatibility
  - safe default URL `./` in notification handling
  - notification click URLs resolve against `self.registration.scope` (or `self.location.href`) so non-root deployments open the app scope instead of the domain root
- Added helper tests for:
  - static cache registration
  - mutation non-caching
  - protected path denylist behavior
  - base path allowlist behavior

## 4.4 M7.4 — Background Sync / PWA Sync Validation

- Kept sync architecture intact:
  - `flushSyncQueue()` continues to use shared `api.js` only.
  - no duplicate refresh-token logic added to sync modules.
  - failure path preserves queue and location evidence.
- Added background sync helper tests to cover:
  - unsupported browser path (safe no-op)
  - supported registration path (`pwa-sync-queue`)

## 4.5 M7.5 — Install UX

- Enhanced `usePwaInstallPrompt.js` with:
  - prompt support tracking
  - prompt outcome tracking
  - delayed unsupported-hint display (8s) to avoid premature “unavailable” messaging before `beforeinstallprompt`
  - existing standalone/installed guards preserved
- Enhanced sidebar install UI:
  - accessible install button labels/title
  - branded button text (`Install VeriPatrol`)
  - optional non-disruptive unsupported hint
  - mobile drawer visibility behavior preserved via existing non-SimpleBar mobile structure
- Added tests for:
  - capturing `beforeinstallprompt`
  - hiding in installed mode (`appinstalled`)
  - standalone mode hiding
  - unsupported-browser safe behavior
  - install click invoking prompt and clearing deferred state

---

## 5. Security and Privacy Decisions

- **No API mutation caching:** `POST/PUT/PATCH/DELETE` are not runtime-cached by Workbox.
- **Protected API caching decision:** runtime caching for protected API GET responses was removed to prevent user/session data leakage across contexts.
- **Patrol evidence preservation:** no logic added that deletes unsynced patrol records on token expiry, refresh failure, or offline state.
- **No token-refresh duplication in sync code:** `syncService` remains coupled to shared `api.js` refresh-on-401 behavior.

---

## 6. Testing Commands and Results

All commands run from `frontend`.

### Review remediation (post-conditional pass)

- Removed CodedThemes pixel script from `index.html`.
- Fixed notification click URL resolution in `push-handlers.js` to use service-worker scope.
- Moved `workbox-runtime-caching.test.js` to `src/pwa/` so Vitest `include` picks it up in normal runs.
- Corrected Workbox helper comment from “Milestone 17” to “M7”.
- Deferred unsupported install hint by 8 seconds in `usePwaInstallPrompt.js`.

### Automated test runs

1. `npx vitest run src/pwa/syncService.test.js`  
   - **Result:** Passed  
   - **Summary:** `Test Files 1 passed`, `Tests 6 passed`

2. `npx vitest run src/pwa/workbox-runtime-caching.test.js src/hooks/usePwaInstallPrompt.test.jsx src/layout/MainLayout/Sidebar/SidebarPwaInstall.test.jsx src/pwa/backgroundSyncService.test.js`  
   - **Result:** Passed  
   - **Summary:** `Test Files 4 passed`, `Tests 14 passed`

3. `npx vitest run src/hooks src/layout/MainLayout/Sidebar pwa`  
   - **Result:** Passed  
   - **Summary:** `Test Files 5 passed`, `Tests 20 passed`

4. `npm run build`  
   - **Result:** Passed  
   - **Summary:** Vite production build succeeded and generated PWA files (`dist/sw.js`, Workbox bundle, manifest output).

---

## 7. Manual QA Checklist

- [ ] Chrome Application tab shows valid manifest for **VeriPatrol**.
- [ ] Install prompt appears when browser supports `beforeinstallprompt`.
- [ ] Android installed icon is not cropped (maskable safe-zone validation).
- [ ] Installed app launches to expected route under root and non-root base path.
- [ ] Offline refresh shows safe shell behavior.
- [ ] Offline patrol log persists in IndexedDB.
- [ ] Reconnect triggers sync queue flush.
- [ ] Refresh-on-401 during `/pwa/sync` works through shared API client.
- [ ] Failed sync entries remain local and retryable.

---

## 8. Known Limitations

- Cross-device visual QA (especially Android launcher maskable rendering) still requires manual verification on physical hardware.
- Install unsupported hint appears only after an 8-second delay when no `beforeinstallprompt` event arrives; browsers that fire the event later may still show the install button without the hint.

---

## 9. Final Passing Criteria Checklist

- [x] Browser tab branding switched to VeriPatrol assets.
- [x] Sidebar/logo branding updated to VeriPatrol.
- [x] Manifest fields aligned to VeriPatrol and base-path compatibility.
- [x] Icons set includes 192, 512, maskable 512, and Apple icon.
- [x] Protected API runtime caching removed from Workbox policy.
- [x] API mutation caching remains disabled.
- [x] Background Sync helper coverage added.
- [x] Install UX hook/component hardening completed.
- [x] `syncService.test.js` passed.
- [x] Focused M7 Vitest groups passed (workbox helpers, install hook/UI, background sync).
- [x] Broader `src/hooks`, sidebar, and `pwa` Vitest suite passed.
- [x] `npm run build` passed.
- [ ] Manual device QA checklist (Section 7) completed on target hardware.
