# Codex Run (LATEST)

## Audit verdict
- **VERIFIED WITH CAVEATS**
- Imported Oura ZIP/CSV data is parsed client-side and persisted in browser storage (`IndexedDB` + small metadata in `localStorage`) with no repo code path that uploads import payloads or derived metrics to app servers.
- Caveat: normal static hosting request metadata (IP, user agent, requested assets) still exists outside import data flow.

## Supporting code locations inspected
- Import entry/UI: `src/components/TopNav.js`, `src/components/ImportController.js`, `src/state/importFlow.js`.
- ZIP parse + normalize + derive + persistence pipeline: `src/store/dataStore.js`.
- App bootstrap and page rendering paths: `src/mpa-entry.js`, `src/app.js`.
- Service worker + cache behavior: `src/boot/swPurge.js`, `sw.js`.
- Repo infrastructure scan for cloud/server paths and telemetry: project root (`rg` scan for `fetch`, `sendBeacon`, websocket/SSE, analytics SDKs, Cloudflare worker/function patterns, wrangler config).

## Changes made
- Removed redundant card microcopy globally by:
  - suppressing metric-card note text unless explicitly opted in,
  - removing contributor-row subtitle lines,
  - removing redundant summary chip sublabels on Home cards.
- Added concise local-processing reassurance in upload surfaces:
  - menu upload panel reassurance text,
  - import modal reassurance text.

## Recommended public-facing wording
1. **Strictest accurate**
   - “When you import an Oura export ZIP, parsing and metric generation run in your browser. In this app codebase, imported files and derived health data are stored locally on your device (IndexedDB/local browser storage) and are not sent to app server endpoints.”
2. **Normal marketing**
   - “Your Oura export is processed locally in your browser. We do not upload your imported files or derived health data to our servers.”
3. **Shortest in-app reassurance**
   - “Imports stay local on this device.”

## Tests / commands run
- `npm run build` ❌ (attempt 1: `vite` permission denied)
- `chmod +x node_modules/.bin/vite && npm run build` ❌ (attempt 2: missing optional Rollup native module `@rollup/rollup-linux-x64-gnu`)
- `npm i` ✅
- `npm run build` ❌ (attempt 3: same missing optional Rollup module)
- `npm i -D @rollup/rollup-linux-x64-gnu` ❌ (HTTP 403 forbidden by registry policy in this environment)
- `npm run check:mpa` ✅
- `npm test` ✅

## Smoke import local
- `node scripts/smoke-import-local.mjs` was **skipped** because `OPS/_local/data3.zip` is absent.

## Manual sanity review
- Reviewed import flow and data store implementation: no network upload path for ZIP contents/parsed rows/derived health metrics was found.
- Verified storage model remains browser-local (`IndexedDB` + `localStorage` metadata/state).
- Updated UI copy to avoid overclaiming and tightened upload reassurance wording.
- Reduced repeated subtitle/helper text across cards while preserving key metric labels/values.
