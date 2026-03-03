import { existsSync } from 'node:fs';
import { navManifest } from '../src/nav/navManifest.js';

const requiredLabels = ['By Date', 'Readiness', 'Sleep', 'Activity', 'Vitals', 'My Health', 'Trends', 'Journal', 'Import', 'Export', 'Glossary', 'Settings', 'Debug'];
const labels = navManifest.map((item) => item.label);
const missingLabels = requiredLabels.filter((label) => !labels.includes(label));

const expectedHtml = [
  'index.html',
  'sleep.html',
  'readiness.html',
  'activity.html',
  'vitals.html',
  'trends.html',
  'journal.html',
  'data-tools-import.html',
  'data-tools-export.html',
  'glossary.html',
  'settings.html',
  'debug.html',
  'my-health.html'
];

const missingDistPages = expectedHtml.filter((file) => !existsSync(new URL(`../dist/${file}`, import.meta.url)));

if (missingLabels.length || missingDistPages.length) {
  if (missingLabels.length) console.error(`Missing nav labels: ${missingLabels.join(', ')}`);
  if (missingDistPages.length) console.error(`Missing dist HTML pages: ${missingDistPages.join(', ')}`);
  process.exit(1);
}

console.log('MPA nav manifest guard passed.');
