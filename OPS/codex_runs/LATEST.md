# Codex Run Latest

## Root cause of double header
The double header happened because BootShell visibility is controlled by `html[data-js="1"]` state, but that marker was not always being set after successful JS boot. Without `document.documentElement.dataset.js = "1"`, the BootShell header stayed visible and overlapped the runtime TopNav.

## Templates updated
### Repo root templates
- `index.html`
- `sleep.html`
- `readiness.html`
- `activity.html`
- `vitals.html`
- `trends.html`
- `journal.html`
- `data-tools-import.html`
- `data-tools-export.html`
- `glossary.html`
- `settings.html`
- `debug.html`
- `my-health.html`

### Dist templates
- `dist/index.html`
- `dist/sleep.html`
- `dist/readiness.html`
- `dist/activity.html`
- `dist/vitals.html`
- `dist/trends.html`
- `dist/journal.html`
- `dist/data-tools-import.html`
- `dist/data-tools-export.html`
- `dist/glossary.html`
- `dist/settings.html`
- `dist/debug.html`
- `dist/my-health.html`

## Visible difference before vs after
- **Before:** BootShell had a full fallback top bar (tabs + Import CTA), so users could see duplicate headers/nav when JS had partial boot issues. Some BootShell text also displayed mojibake (`â€”`, `â€¦`, `Â·`).
- **After:** BootShell is a minimal loading card only (`Loading&hellip;`) with optional `noscript` message. The app now shows only one runtime TopNav after boot, and corrupted punctuation text is removed from updated HTML templates.
