# ADR 0001: Frontend decisions

- Angular 22.2, standalone, signals, OnPush. Unit tests use the CLI default runner (Vitest).
- NG-ZORRO 22.1; wrapped in `ib-` components from F1.
- Runtime config is `public/config.json`, served at `/config.json`.
- MSW 3 uses `onUnhandledFrame`, not `onUnhandledRequest`.
- `openapi-typescript` declares a TypeScript 5 peer; an npm `overrides` entry lets it use TypeScript 6. It generates types only.
- Token storage, hosting and headers follow the frontend plan (T11 to T13).

## Hardening (F12, 2026-10-21)

- Production builds replace `src/mocks/start.ts` with `start.prod.ts` (angular.json `fileReplacements`), so no mock
  code or mock sign-ins ship, and leave out `mockServiceWorker.js`. The build's `config.json` comes from
  `docker/config.json` with `useMocks: false`; a config that still asks for mocks makes the app refuse to start.
- Critical-CSS inlining is off in production. It loads the stylesheet with an inline script, which the CSP blocks,
  so production would have run with only the critical styles. No CSP exception is needed this way.
- `npm run check:bundle` runs after the build (and in the Docker image build): sign-in JavaScript under 250 KB
  gzipped, no mock code or service worker, mocks off, no inline script in `index.html`.
- Security headers live in `docker/security-headers.inc`, included by every nginx location, because a location that
  adds its own header drops the server-level ones. `index.html` and routes are revalidated on every load; hashed
  scripts, styles and fonts are cached for a year. `style-src` keeps `'unsafe-inline'` for component styles;
  scripts are `'self'` only.
- The account menu and the phone More menu use the CDK menu, like `ib-menu-button`, for arrow keys and Esc.
