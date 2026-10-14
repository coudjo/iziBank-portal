# iziBank Portal

Angular 22 + NG-ZORRO staff app for iziBank. The API lives in the sibling `iziBank` repo.

## Read first
1. `docs/plans/iziBank_development_plan.md` — working loop and definition of done.
2. `docs/plans/phase_a_frontend_plan.md` — tasks F0 to F12, technology decisions T1 to T18.
3. `docs/plans/phase_a_ux_design.md` — screen behaviour and exact wording. Use its text verbatim.
4. `docs/plans/iziBank_tokens.css` — approved palette (also in `src/styles/tokens.css`).
5. `docs/progress.md`, `docs/adr/`, `docs/api-requests.md`.

## Commands
Node 22.22.3+ or 24.15+.
```
npm ci
npm run check     # lint, typecheck, format check, unit tests, build
npm run e2e       # Playwright at 1366x768, 820x1180, 390x844 with axe
```

## Rules that never bend
- Features never import NG-ZORRO directly; use `ib-` wrappers in `shared/ui`.
- No colours or spacing hard-coded; use tokens. Accent `#E0A526` is for fills only, never text on white.
- Status is never colour alone (icon + text).
- Call only documented API endpoints. Missing ones go in `docs/api-requests.md` and are mocked with MSW.
- No personal data or secrets in URLs, titles, logs, localStorage, IndexedDB or cookies. Only the token, its expiry and session id go in sessionStorage.
- Every route and action button carries a permission check. Deny by default.
- Done = passes at all three viewports with no axe violations.
