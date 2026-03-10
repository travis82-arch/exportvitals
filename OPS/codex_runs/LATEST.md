# Codex Run Latest

## Summary
Implemented chart standardization (explicit X/Y axes + tick labels), compact layout updates, sleep-model-driven Sleep/Readiness metrics, and a fully data-driven Activity tab scaffold using `dailyactivity` fields + `class_5_min` decoding.

## data3.zip import verification
`OPS/_local/data3.zip` is missing in this environment, so row counts and sample-day values could not be generated.

### rowCounts / daysPerDataset
Unavailable in this run.

Expected command:
- `node scripts/smoke-import-local.mjs`

Expected printed fields:
- `ingestReport.rowCounts`
- `ingestReport.daysPerDataset`
- `confirm.sleepModelRows>0: true`

## Required sample day values (Sleep + Readiness + Activity)
Unavailable in this run due to missing local ZIP.

After import, capture one date with:
- `date`
- `sleepModel.totalSleepSec`
- `sleepModel.timeInBedSec`
- `sleepModel.lowestHeartRate`
- `sleepModel.avgHeartRate`
- `sleepModel.avgHrv`
- `dailyActivity.steps`
- `dailyActivity.totalCalories`

## Chart scaling before/after
- **Before:** multiple chart renderers used inconsistent margins/scales and could appear skewed (different hardcoded viewBox behaviors, non-standardized domains).
- **After:** unified chart components now compute domains with `niceDomain()` (1/2/5 stepping), enforce consistent plot margins, always render X+Y axes with ticks/labels, and apply per-metric range guards (HR/HRV/movement domain rules).

## Manual verification checklist
1. Place `OPS/_local/data3.zip`.
2. Run `node scripts/smoke-import-local.mjs`; confirm `sleepModelRows>0`.
3. Start app and import `data3.zip`.
4. Sleep tab:
   - cards populated from `sleepModel` + `dailyspo2`.
   - stage timeline has categorical Y-axis labels.
   - movement chart has numeric Y-axis ticks.
   - HR/HRV charts have X and Y axes with tick labels.
5. Readiness tab:
   - compact card layout.
   - key metrics from `sleepModel`.
   - HR and HRV axis charts render with ticks/labels.
6. Activity tab:
   - score + contributors + key metrics use `dailyactivity` data.
   - daily movement chart from `class_5_min` decode.
   - weekly chart and zone proxy bars render.

## Blocking commands and stack traces
1. `npm run build`
   - `Error: Cannot find module @rollup/rollup-linux-x64-gnu`
2. `node scripts/smoke-import-local.mjs`
   - `Error: Missing local ZIP. Tried: /workspace/oura-pwa-dashboard/OPS/_local/data3.zip, /workspace/oura-pwa-dashboard/OPS/_local/data.zip`
3. `npx vite --host 0.0.0.0 --port 4173`
   - same missing rollup optional dependency error

## Top 3 next actions
1. Add `OPS/_local/data3.zip` and rerun smoke import.
2. Repair local JS toolchain optional dependency (`@rollup/rollup-linux-x64-gnu`) without changing lockfile policy unexpectedly.
3. Run browser manual check and capture Activity/Sleep/Readiness screenshot artifacts.
