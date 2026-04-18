# Codex Run Latest

## Summary of what changed
- Replaced active top-level navigation with the locked PR1 information architecture: Home, Readiness, Sleep, Activity, Heart Rate, Stress, Settings.
- Introduced shared persisted date-range state with presets and custom range support, plus clamped range resolution against available dates.
- Added a shared date-range control component used at the top of each active page.
- Rebuilt `mpa-entry` scaffold to render new page shells, range-aware summaries, and single-day vs multi-day semantics.
- Simplified Settings page to include only Data upload, My Health section scaffold, and Debug diagnostics with copy support.
- Removed header-level upload interaction from active shell (upload now only in Settings).
- Updated import behavior to replace prior dataset contents on ZIP import (instead of merging leftovers from previous imports).
- Added Heart Rate and Stress MPA routes/pages.
- Updated MPA guard script to enforce the new locked active structure.

## Key files changed
- `src/nav/navManifest.js`
- `src/components/TopNav.js`
- `src/state/selectedRange.js` (new)
- `src/components/DateRangeControl.js` (new)
- `src/mpa-entry.js`
- `src/store/dataStore.js`
- `src/style.css`
- `scripts/check-nav-manifest.mjs`
- `vite.config.js`
- `index.html`
- `heart-rate.html` (new)
- `stress.html` (new)

## Tests / commands run
- `npm run build` (failed, 3 attempts)
  - Blocked by missing optional Rollup binary package `@rollup/rollup-linux-x64-gnu` in this environment.
  - Attempted remediation: made vite launcher executable and attempted no-save install of missing package; install failed due 403 policy restriction.
- `npm run check:mpa` (failed, 3 attempts)
  - Fails because `dist/heart-rate.html` and `dist/stress.html` are not generated while build is blocked.
- `npm test` (passed)
- `node scripts/smoke-import-local.mjs` skipped because `OPS/_local/data3.zip` is absent.

## Smoke import local
- Skipped: `OPS/_local/data3.zip` not found.

## Known follow-up gaps intentionally left for PR2+
- Final screenshot-polished visuals and deep per-tab parity.
- Rich multi-day lower-chart sections beyond scaffold/placeholder level.
- Additional refinement of stress-specific and heart-rate-specific detail mappings.
