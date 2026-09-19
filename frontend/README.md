# VeriPatrol — Frontend (React + Vite PWA)

React 19 + Vite 7 single-page application for the FYP surveillance platform. Built on the Berry Material UI template; extended with JWT auth, patrol PWA, monitoring dashboards, and admin management modules.

**Primary technical reference:** [`documentation.md`](./documentation.md)

## Prerequisites

- Node.js 18+ (20+ recommended)
- [Yarn 4](https://yarnpkg.com/) (`packageManager` is pinned in `package.json`)

## Quick start

```bash
cd frontend
yarn install
yarn start
```

Dev server: [http://localhost:3000](http://localhost:3000) (Vite `server.port` in `vite.config.mjs`).

## Scripts

| Command | Description |
| ------- | ----------- |
| `yarn start` | Vite dev server (`vite`), opens browser |
| `yarn build` | Production build → **`dist/`** (not `build/`) |
| `yarn preview` | Serve `dist/` locally |
| `yarn test` | Vitest run once |
| `yarn test:watch` | Vitest watch mode |
| `yarn lint` | ESLint |

## Environment variables

Copy values from committed `.env` or use [`.env.example`](./.env.example). Set at **build time** for production (`VITE_*` are inlined by Vite).

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `VITE_APP_BASE_NAME` | Yes | SPA public path (`/` or `/fyp`) — must match hosting rewrites |
| `VITE_API_BASE_URL` | Yes | Laravel API base (e.g. `http://localhost:8000/api`) |
| `VITE_VAPID_PUBLIC_KEY` | For push | Web Push public key (matches backend `VAPID_PUBLIC_KEY`) |
| `VITE_REVERB_APP_KEY` | For realtime | Laravel Reverb app key |
| `VITE_REVERB_HOST` / `PORT` / `SCHEME` | For realtime | WebSocket connection for patrol monitoring |
| `VITE_PWA_DEBUG` | Optional | `true` in dev → PWA diagnostic logs |
| `VITE_APP_DEBUG` | Optional | `true` in dev → general debug logs |

## Deployment

1. Set env vars, then `yarn build`.
2. Publish **`dist/`** to static hosting.
3. Configure SPA fallback so unknown routes serve `index.html` (see `public/_redirects` for Netlify).

Keep `VITE_APP_BASE_NAME`, Vite `base`, React Router `basename`, and `_redirects` aligned.

### Netlify SPA routing

- Root (`VITE_APP_BASE_NAME=/`): `/*    /index.html   200`
- Subpath (`VITE_APP_BASE_NAME=/fyp`): `/fyp/*    /fyp/index.html   200`

## PWA

- Install: **Install App** in sidebar when browser fires `beforeinstallprompt` (Chromium/Android; not iOS Safari).
- Offline: patrol GPS logs queue in IndexedDB; sync via `POST /api/pwa/sync`.
- Updates: new deployments install a waiting service worker; **`PwaUpdateSnackbar`** prompts **Reload now** to activate.

See [`documentation.md` §15](./documentation.md#15-progressive-web-app-pwa).

## Tests

Vitest + jsdom. Run `yarn test` before releases. See `vitest.config.mjs` and `src/**/*.test.{js,jsx}`.

## Related docs

- [`documentation.md`](./documentation.md) — full frontend reference
- [`../docs/login-module.md`](../docs/login-module.md) — auth architecture (implemented)
- [`../docs/profile-module.md`](../docs/profile-module.md) — account settings (implemented)
- [`../docs/system-update/`](../docs/system-update/) — milestone notes (M4–M10)
