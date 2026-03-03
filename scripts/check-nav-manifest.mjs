import { navManifest } from '../src/nav/navManifest.js';

const required = ['By Date', 'Readiness', 'Sleep', 'Activity', 'Vitals', 'My Health', 'Trends', 'Journal', 'Data Tools', 'Settings', 'Import', 'Export', 'Glossary', 'Debug'];
const labels = [...navManifest.primary, ...navManifest.myHealth, ...navManifest.dataTools].map((item) => item.label);
const missing = required.filter((label) => !labels.includes(label));

if (missing.length) {
  console.error(`Missing required nav labels: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('Nav manifest guard passed.');
