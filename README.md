# Oura PWA Dashboard

Static, local-only Oura-style dashboard (no build step, no backend).

## Navigation map
Top tabs (always visible):
- By Date
- Readiness
- Sleep
- Activity
- Vitals
- My Health

Inside **My Health**:
- Trends
- Journal (Tags)
- Data Tools
- Settings

Inside **Data Tools**:
- Import
- Export
- Glossary
- Debug (visible only in Developer Mode)

Unknown routes fall back to `/by-date`.

## How “By Date” works
- The app opens on `/by-date`.
- A shared **Date Context** controls By Date, Readiness, Sleep, Activity, and Vitals.
- **Day** mode shows latest date + previous 6 calendar days as chips.
- Choosing a date older than latest-6 days auto-switches to **Week**.
- **Week** uses ISO week (Mon–Sun), with prev/next navigation.
- **Month** shows month-level aggregate medians and available-day counts.
- Long-term history remains in **My Health → Trends**.

## Data import support
ZIP parsing is in-browser only and keeps compatibility with semicolon-delimited CSV exports.

Required for full experience:
- `daily_readiness.csv`
- `daily_sleep.csv`
- `daily_activity.csv`

Optional:
- `daily_spo2.csv` (SpO2 average + BDI)
- `heart_rate.csv` + `sleep_time.csv` (derived nightly vitals)

## Exported vs derived metrics
Export files:
- `normalized_daily_readiness.csv`
- `normalized_daily_sleep.csv`
- `normalized_daily_activity.csv`
- `normalized_daily_spo2.csv`
- `derived_nightly_vitals.csv`
- `journal_tags.csv`
- `normalized_all.json`

Derived locally (not uploaded):
- `rhr_night_bpm`
- `hrv_rmssd_proxy_ms`
- baseline medians (7/14/30)
- insight cards (rule-based, explainable)
- week/month aggregates

## Testing
Run:
```bash
node --test
```

## Local preview / deploy
Open `index.html` directly, or serve with any static server.
Cloudflare Pages: no build step required.
