# ROADMAP

## Version
- v0.5 (PR5 baseline)

## Current State (after PR5)
- Primary information architecture is locked to three top-level tabs:
  - Today
  - Vitals
  - My Health
- Import is no longer a top-level tab and now lives under:
  - My Health → Data Tools → Import
- Debug tools (Ingest Report + Debug Inspector) are preserved but gated behind Developer Mode:
  - My Health → Settings → Developer Mode toggle
  - My Health → Data Tools → Debug (visible only when Developer Mode is on)
- Existing ingest and vitals behavior is preserved:
  - ZIP import
  - Forget data
  - Existing vitals metrics, baselines, and deltas

## Target IA
- **Today**
  - Readiness score
  - Sleep score
  - Activity score
  - (Future) richer daily summary cards
- **Vitals**
  - Existing vitals cards and baseline comparisons
  - Existing trend sparks
- **My Health**
  - Trends
  - Data Tools (Import, Debug when Developer Mode is enabled)
  - Settings

## PR Roadmap (PR5–PR10)
- **PR5**: Lock IA to Today/Vitals/My Health, move Import into Data Tools, gate Debug via Developer Mode, add roadmap.
- **PR6**: Expand Today cards (score contributors, latest nightly context, consistency checks).
- **PR7**: Add Trends foundation in My Health (date ranges, metric selectors, chart scaffolding).
- **PR8**: Improve Vitals insights (annotations, confidence/coverage indicators, clearer baseline explainers).
- **PR9**: Add export and sharing tools in My Health (data snapshot export + basic report format).
- **PR10**: Settings hardening and polish (baseline window configurability, persistence UX, IA guardrails/tests).

## Feature Map
- **Today**
  - Readiness / Sleep / Activity cards (implemented)
  - Import prompt fallback when no data (implemented)
- **Vitals**
  - RHR Night card
  - Estimated HRV RMSSD proxy card
  - SpO2 Night Avg card
  - Temperature deviation card
  - 14-day median baselines + deltas + trend spark lines
- **My Health**
  - Trends hub entry (placeholder)
  - Data Tools
    - Import (implemented)
    - Debug (Developer Mode only)
  - Settings
    - Developer Mode toggle (implemented)
    - Baseline window config display, read-only in PR5
