export const SITE_COPY = {
  productName: 'Local Health Export Viewer',
  shortName: 'Health Viewer',
  description:
    'Free and open-source local dashboard for wearable export ZIP files. Supports Oura export ZIP now with Fitbit export planned.',
  support: {
    publicRepoUrl: 'TBD_PUBLIC_REPO_URL'
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

export const PUBLIC_REPO_FALLBACK_TEXT = 'Public repo coming soon.';

export function getPublicRepoUrl() {
  const candidate = String(SITE_COPY?.support?.publicRepoUrl || '').trim();
  return /^https?:\/\//i.test(candidate) ? candidate : '';
}
