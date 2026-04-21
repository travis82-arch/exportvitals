# Codex Run (LATEST)

## Summary
- Replaced the persistent top tab strip with a compact upper-right menu trigger and panel.
- Moved Upload into the menu and wired it to the existing import flow with inline progress/status.
- Removed Settings from top-level navigation and promoted Debug as a top-level destination in the menu.
- Kept Home as default (`index`) while removing redundant dashboard/title-bar clutter from the app chrome.
- Made Home summary cards/tiles navigate to corresponding detail pages (Readiness, Sleep, Activity, Heart Rate, Stress).
- Kept compact date control pattern (preset + active date/range row, custom start/end only when Custom).
- Refined Strain copy/presentation to keep baseline-driven “No signs / Minor signs / Major signs” behavior with concise biometrics and a categorical recent-days chart.
- Updated nav manifest/build checks and tests for the new menu/nav behavior and debug page date-control rules.

## Key files changed
- `src/components/TopNav.js`
- `src/nav/navManifest.js`
- `src/mpa-entry.js`
- `src/style.css`
- `src/state/pageConfig.js`
- `scripts/check-nav-manifest.mjs`
- `vite.config.js`
- `tests/strain-feature.test.mjs`
- `tests/data-hydration.test.mjs`
- `tests/nav-menu-and-home.test.mjs`

## Tests / commands run
- `npm run build` ❌ (attempt 1: `vite` permission issue)
- `chmod +x node_modules/.bin/vite && npm run build` ❌ (attempt 2: missing optional Rollup native module)
- `npm i` ✅
- `npm run build` ❌ (attempt 3: same missing optional Rollup native module)
- `npm run check:mpa` ❌ (initially failed due stale dist expectation)
- `npm run check:mpa` ✅ (after script fix)
- `npm test` ❌ (initially failed due outdated tests)
- `npm test` ✅ (after test updates)

## Smoke import local
- `node scripts/smoke-import-local.mjs` was skipped because `OPS/_local/data3.zip` is absent.

## Known intentional follow-ups (next PR)
- Dashboard final polish pass.
- Future sleep-formula calibration pass.
