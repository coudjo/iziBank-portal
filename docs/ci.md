# CI steps

Provider-agnostic. Node 24 (Angular 22 needs 22.22.3 or newer, or 24.15+).

1. `npm ci`
2. `npm run lint` (warnings fail)
3. `npm run typecheck`
4. `npm run format:check`
5. `npm test -- --watch=false`
6. `npm run build`
7. `npx playwright install --with-deps chromium` then `npm run e2e` (desktop 1366x768, tablet 820x1180, phone 390x844, with axe)
8. `npm run check:errors`, `npm run check:contrast`, `npm run check:colours`, `npm run check:bundle` (after the build)
9. Generated API types are in date: `npm run gen:api` then `git diff --exit-code src/app/core/api`

Local: `npm run check` covers steps 2 to 6 and the bundle check.

The Docker image (`docker/Dockerfile`) builds for production and runs `check:bundle` too; `docker/nginx.conf` serves it with the headers in `docker/security-headers.inc`.

## Updating the API contract

```
npm run sync:api   # copies docs/api/openapi.json and problem-types.md from ../iziBank (or $IZIBANK_API_DIR)
npm run gen:api    # regenerates src/app/core/api/schema.d.ts
```

## Mock sign-ins (development and e2e)

| Staff code | Password       | Role groups                                      |
| ---------- | -------------- | ------------------------------------------------ |
| `ADMIN`    | `Admin-Pass1`  | Administrator, Supervisor (must change password) |
| `TELLER1`  | `Teller-Pass1` | Teller                                           |
| `KYC1`     | `Kyc-Pass1`    | KYC officer                                      |
| `LOCKED`   | `Locked-Pass1` | Always locked (shows the lockout message)        |
