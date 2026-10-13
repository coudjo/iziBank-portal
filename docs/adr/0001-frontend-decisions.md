# ADR 0001: Frontend decisions

- Angular 22.2, standalone, signals, OnPush. Unit tests use the CLI default runner (Vitest).
- NG-ZORRO 22.1; wrapped in `ib-` components from F1.
- Runtime config is `public/config.json`, served at `/config.json`.
- MSW 3 uses `onUnhandledFrame`, not `onUnhandledRequest`.
- `openapi-typescript` declares a TypeScript 5 peer; an npm `overrides` entry lets it use TypeScript 6. It generates types only.
- Token storage, hosting and headers follow the frontend plan (T11 to T13).
