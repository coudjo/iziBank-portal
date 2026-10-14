# ADR 0002: Theme and design system

Status: accepted (2026-10-14)

## Theme mechanism (frontend plan 4.2.1 rule 4, F1-01)

- NG-ZORRO is themed at build time with Less: `src/styles/zorro-theme.less` sets `@root-entry-name: default`, imports only the components the `ib-` wrappers use, and overrides the theme variables with the approved token values.
- Less needs literal values, so the colours are written twice: in `src/styles/tokens.css` (the source) and in `zorro-theme.less`. `npm run check:contrast` fails if they drift.
- Global overrides that Less variables cannot reach (focus ring, 44px touch height below 1280px, banner tints) live in `src/styles.scss` and use the CSS tokens.
- The full prebuilt NG-ZORRO stylesheet is not used (about 590 kB); the selective import is about 300 kB raw, 28 kB compressed.

## Rules

- Features never import NG-ZORRO. They use `shared/ui` (`ib-` components).
- Icons are registered statically in `core/icons.ts`. No runtime icon loading.
- No hard-coded colours outside the token and theme files (`npm run check:colours`).
- Inter is self-hosted through `@fontsource-variable/inter`.
- Selector prefix is `ib` (`app-root` is the only exception).
