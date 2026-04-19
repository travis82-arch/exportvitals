# Sleep tab derived approximations

This dashboard stays local-only and derives missing Sleep cards from fields already present in the Oura ZIP export.

## 1) `derivedSleepDebtEstimate` (UI label: **Sleep Debt**)

### Preferred source order per night
1. `sleepTime` explicit duration-like fields (if parseable):
   - `sleep_duration(_seconds)`
   - `total_sleep_duration(_seconds)`
   - `asleep_duration(_seconds)` / `asleep_time(_seconds)`
   - `duration(_seconds)`
   - `time_in_bed(_seconds)`
2. `sleepModel.totalSleepSec` when present.
3. Duration inferred from a sleep window:
   - `sleepTime.bedtimeStart + bedtimeEnd`
   - fallback to `sleepModel.bedtimeStart + bedtimeEnd`
   - fallback to a heart-rate inferred low-HR midpoint window.
4. Last-resort proxy from `dailySleep.score` (clearly marked low confidence).

### Target + debt behavior
- Personal target is derived from a rolling up-to-28-night window.
- Prefer stronger nights (higher sleep-score bands), else upper-middle duration distribution.
- Target is smoothed over time to reduce day-to-day jumps.
- Nightly deficits add fully.
- Surpluses repay debt partially (0.55 factor), not 1:1.
- Debt is clamped to 0..12h and mapped to None/Low/Moderate/High bands.

### Confidence meaning
- **high**: timing/duration is directly available and enough nights exist.
- **medium**: fallback timing source (e.g., sleepModel) and/or moderate history.
- **low**: inferred/proxy path or sparse history.

### Sparse data behavior
- Card still renders with subdued confidence.
- Debug metadata exposes source path + deficits so behavior is inspectable.

## 2) `derivedBodyClockOffsetEstimate` (UI label: **Body Clock**)

### Preferred source order per night midpoint
1. Midpoint from `sleepTime.bedtimeStart + bedtimeEnd`.
2. Midpoint from `sleepModel.bedtimeStart + bedtimeEnd`.
3. Midpoint from inferred heart-rate window.

### Baseline behavior
- Habitual midpoint baseline uses a rolling 21..42 night window (default 35 target).
- Baseline is computed with circular median logic (24h wrap aware).
- Selected night midpoint is compared to baseline with shortest signed circular delta.

### Output semantics
- Positive delta => selected midpoint is **behind** habitual body clock.
- Negative delta => selected midpoint is **ahead of** habitual body clock.

### Sparse data behavior
- If selected midpoint or baseline cannot be formed, card shows graceful “not enough history” copy.
- Debug includes selected midpoint, habitual midpoint, window span, source path, and confidence.
