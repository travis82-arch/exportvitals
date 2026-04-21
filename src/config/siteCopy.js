export const SITE_COPY = {
  productName: 'Local Health Export Viewer',
  shortName: 'Health Viewer',
  description:
    'Free and open-source local dashboard for wearable export ZIP files. Supports Oura export ZIP now with Fitbit export planned.',
  support: {
    repoPublic: false,
    sourceUrl: 'https://github.com/travis82-arch/oura-pwa-dashboard',
    tipUrl: 'https://paypal.me/placeholder'
  },
  canonicalBaseUrl: 'https://oura-pwa-dashboard.pages.dev',
  trustStatement:
    'When you import an Oura export ZIP, parsing and metric generation run in your browser. Imported files and derived health data are stored locally on your device and are not sent to app server endpoints.',
  compatibility: {
    availableNow: 'Oura export ZIP',
    planned: 'Fitbit export'
  },
  disclaimer: 'Unofficial tool. Not affiliated with Oura.'
};
