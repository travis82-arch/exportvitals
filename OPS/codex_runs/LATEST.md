# Codex Run (LATEST)

## Summary
- Fixed the top-right menu visibility source-of-truth issue by adding an explicit `.menu-panel[hidden] { display: none; }` rule so closed state is actually rendered closed on first load and after every close action.
- Kept the existing single boolean menu controller (`isOpen`) and strengthened route transition cleanup by closing menu state on `pagehide` in addition to existing `pageshow`/`popstate` handling.
- Extended focused regression tests for menu behavior contracts (toggle, hidden-state CSS enforcement, route cleanup hooks, and no persistence coupling).

## Key files changed
- `src/style.css`
- `src/components/TopNav.js`
- `tests/nav-menu-and-home.test.mjs`

## Tests / commands run
- `npm run build` ❌ (attempt 1: `vite` permission denied because `node_modules/.bin/vite` was not executable)
- `chmod +x node_modules/.bin/vite && npm run build` ❌ (attempt 2: missing optional Rollup native module `@rollup/rollup-linux-x64-gnu`)
- `npm i` ✅
- `npm run build` ❌ (attempt 3: same missing optional Rollup native module)
- `npm i @rollup/rollup-linux-x64-gnu` ❌ (registry access forbidden in this environment: HTTP 403)
- `npm run check:mpa` ✅
- `npm test` ✅

## Smoke import local
- `node scripts/smoke-import-local.mjs` was skipped because `OPS/_local/data3.zip` is absent.

## Known follow-ups
- Build remains blocked by missing optional Rollup native binary package in this environment; once registry policy permits fetching `@rollup/rollup-linux-x64-gnu` (or a compatible alternative), rerun `npm run build`.
- Browser manual sanity validation is still pending because build is currently blocked in this container.
