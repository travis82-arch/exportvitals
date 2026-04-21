# Codex Run Latest

## Summary of what changed
- Renamed the top-level Insights tab/page to Strain (`/strain`) and updated nav/MPA manifest expectations.
- Replaced the Insights renderer with a new baseline/deviation-driven Signs of Strain flow.
- Added conservative strain state derivation in selectors (`No signs`, `Minor signs`, `Major signs`, and `Not enough history yet`) based on personal baseline windows and multi-signal agreement.
- Added compact Strain UI sections: restrained hero, 3-state legend, concise biometrics drivers, and recent-days discrete-state chart.
- Continued compaction pass: reduced repeated header/title treatment, reduced hero verbosity, compacted date-range header text, and cleaned Settings helper copy.
- Added/updated regression coverage for Strain tab wiring and strain selector output validity.

## Key files changed
- `src/nav/navManifest.js`
- `strain.html` (renamed from `insights.html`)
- `scripts/check-nav-manifest.mjs`
- `src/state/pageSummaries.js`
- `src/mpa-entry.js`
- `src/components/DateRangeControl.js`
- `src/style.css`
- `tests/strain-feature.test.mjs`
- `OPS/codex_runs/LATEST.md`
- `package-lock.json` (updated by npm install attempts during build blocker triage)

## Tests / commands run
- `npm run build`
  - Attempt 1 failed: `vite: Permission denied`.
  - Fix 1: `chmod +x node_modules/.bin/vite node_modules/vite/bin/vite.js`.
  - Attempt 2 failed: missing optional Rollup native module (`@rollup/rollup-linux-x64-gnu`).
  - Fix 2: `npm i`.
  - Attempt 3 failed: same missing Rollup native module.
  - Fix 3 attempt: `npm i @rollup/rollup-linux-x64-gnu --no-save` failed with registry/security 403.
  - Final rerun failed with same missing Rollup native module; build remains blocked after 3 fix->rerun cycles.
- `npm run check:mpa` not run (stopped due required build blocker stop condition).
- `npm test` not run (stopped due required build blocker stop condition).

## Smoke import local
- `node scripts/smoke-import-local.mjs` skipped because `OPS/_local/data3.zip` is absent.

## Known intentional follow-ups for next PR
- Dashboard/Home polish pass.
- Future sleep-formula calibration pass.
