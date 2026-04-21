# Codex Run (LATEST)

## Summary
- Hardened top-right menu behavior with a single open/close controller so it is closed by default, toggles reliably, closes on outside tap/Escape, closes after destination click, and closes before upload starts.
- Removed Debug from user-facing menu destinations while preserving the internal Debug route/page implementation.
- Strengthened Home card ambience by introducing shared destination accent classes and applying them consistently to summary chips and Home preview cards.
- Added a small hardening refactor by centralizing destination accent mapping into a shared helper used by Home rendering.
- Added Strain as a Home preview card to align Home destination foreshadowing with the locked destination set.

## Key files changed
- `src/components/TopNav.js`
- `src/nav/navManifest.js`
- `src/state/destinationTheme.js`
- `src/mpa-entry.js`
- `src/style.css`
- `scripts/check-nav-manifest.mjs`
- `tests/nav-menu-and-home.test.mjs`
- `tests/strain-feature.test.mjs`

## Tests / commands run
- `npm run build` ❌ (attempt 1: `vite` permission denied)
- `chmod +x node_modules/.bin/vite && npm run build` ❌ (attempt 2: missing optional Rollup native module)
- `npm i` ✅
- `npm run build` ❌ (attempt 3: same missing optional Rollup native module)
- `npm run check:mpa` ✅
- `npm test` ✅

## Smoke import local
- `node scripts/smoke-import-local.mjs` was skipped because `OPS/_local/data3.zip` is absent.

## Known follow-ups for final wrap-up pass
- Resolve environment-specific optional Rollup native binary issue so `npm run build` can run cleanly in this container.
- Perform a browser-based visual/manual sanity pass once build/runtime environment is unblocked.
