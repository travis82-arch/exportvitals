# ExportVitals

ExportVitals is an independent, open-source, local-first web app for viewing wearable export ZIP files in your browser.

## Current support
- ✅ Oura export ZIP (available now)
- 🕒 Fitbit export (planned, not yet implemented)

## Trust and privacy
When you import an Oura export ZIP, parsing and metric generation run in your browser. Imported files and derived health data are stored locally on your device and are not sent to app server endpoints.

- No account required
- No backend upload flow
- Unofficial project, not affiliated with Oura

## Routes
- `/` → marketing landing page
- `/app` → dashboard app
- `/about` → about page
- `/privacy` → privacy page

## Local development
```bash
npm install
npm run build
npm test
```

## Cloudflare Pages deployment notes
- This project is static and works on Cloudflare Pages free tier.
- Client-side parsing and metric derivation run in-browser only.
- Routing support is handled with `public/_redirects` for `/app`, `/about`, and `/privacy` friendly paths.

## Support
If this project helped you, support development: https://paypal.me/placeholder
