# CI steps

Provider-agnostic. Node 24 (Angular 22 needs 22.22.3 or newer, or 24.15+).

1. `npm ci`
2. `npm run lint` (warnings fail)
3. `npm run typecheck`
4. `npm run format:check`
5. `npm test -- --watch=false`
6. `npm run build`
7. `npx playwright install --with-deps chromium` then `npm run e2e` (desktop 1366x768, tablet 820x1180, phone 390x844, with axe)
8. Generated API types are in date: run `npm run gen:api` and `git diff --exit-code src/app/core/api` (added once the API exposes OpenAPI)
9. Contrast check of the tokens (F1-04)

Local: `npm run check` covers steps 2 to 6.
