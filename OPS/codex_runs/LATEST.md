# Codex Run (LATEST)

## Summary
- Implemented compact date-range controls with single-row preset + active range summary, and custom start/end inputs shown only for Custom range.
- Removed the large intro/banner shell and tightened top-of-page layout.
- Reworked hero cards to use a centered circular metric treatment and page-tone gradients.
- Updated all major pages to remove repeated `Key metrics` headings (renamed to `Overview`) and reduced repeated title copy in hero sections.
- Kept Strain as a dedicated feature page with strain-state hero, biometrics drivers section, and recent-days discrete state chart.
- Hardened strain selector behavior to avoid one-day-noise Major state by requiring sustained major patterns over recent evaluable days.
- Added/updated tests for compact date control, banner removal, and strain page wiring/copy expectations.

## Key files changed
- `src/components/DateRangeControl.js`
- `src/mpa-entry.js`
- `src/state/pageSummaries.js`
- `src/state/pageConfig.js`
- `src/style.css`
- `tests/date-control-compact.test.mjs`
- `tests/strain-feature.test.mjs`
- `tests/ui-copy-cleanup.test.mjs`
- `tests/data-hydration.test.mjs`

## Tests / commands run
- `npm run build` (failed; see blocker)
- `chmod +x node_modules/.bin/vite && npm run build` (failed; optional rollup native module missing)
- `npm i @rollup/rollup-linux-x64-gnu --no-save` (failed 403)
- `npm install --include=optional` (completed)
- `npm run build` (failed again with same rollup native module issue)

## Smoke import local
- `node scripts/smoke-import-local.mjs` was skipped because `OPS/_local/data3.zip` is absent.

## Known intentional follow-ups (next PR)
- Dashboard/Home polish pass.
- Future sleep-formula calibration pass.
