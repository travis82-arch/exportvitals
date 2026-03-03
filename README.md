# Oura PWA Dashboard

Static, local-only Oura-style dashboard (no build step, no backend).

## Navigation map
Top tabs (always visible):
- Today
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
- Debug

Unknown routes fall back to Today.

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
Exported (direct):
- readiness_score
- sleep_score
- activity_score
- temperature_deviation_c
- spo2_avg
- breathing_disturbance_index
- contributors objects from readiness/sleep/activity

Derived locally:
- rhr_night_bpm
- hrv_rmssd_proxy_ms
- baseline medians (7/14/30)
- insights cards (rule-based)
- MET distribution summary

## Features
- Oura-style Readiness/Sleep/Activity pages with contributors + trend charts.
- Today overview with scores at-a-glance and explainable insights.
- Journal (Tags) with localStorage persistence and chart markers.
- Data Tools export buttons for normalized CSV/JSON artifacts.
- Settings for baseline window, night window mode, remember-derived toggle, and distance unit.

## Testing
Run:
```bash
node --test
```

## Local preview / deploy
Open `index.html` directly, or serve with any static server.
Cloudflare Pages: no build step required.
