# ExportVitals

ExportVitals is a local-first browser dashboard for wearable export ZIPs.

## Current support
- Oura export ZIPs
- Fitbit support planned

## Privacy / local processing
“When you import an Oura export ZIP, parsing and metric generation run in your browser. Imported files and derived health data are stored locally on your device and are not sent to app server endpoints.”

- Unofficial project
- Not affiliated with Oura

## Development
```bash
npm install
npm test
npm run build
npm run check:mpa
```

## Cloudflare Pages deployment
- Build command: `npm run build`
- Output directory: `dist`
- `dist/` is generated build output and should not be committed.

## Public repository
https://github.com/travis82-arch/exportvitals

## License
AGPL-3.0-only

## Branding and trademark
See [TRADEMARKS.md](./TRADEMARKS.md).

## Support
ExportVitals is free to use. If it helped you, support future development:
https://ko-fi.com/tinytoolslab
