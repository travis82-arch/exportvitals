import { existsSync } from 'node:fs';
import { navManifest } from '../src/nav/navManifest.js';

const requiredLabels = ['Home', 'Readiness', 'Sleep', 'Activity', 'Heart Rate', 'Stress', 'Settings'];
const labels = navManifest.map((item) => item.label);

const missingLabels = requiredLabels.filter((label) => !labels.includes(label));
const extraLabels = labels.filter((label) => !requiredLabels.includes(label));

const expectedHtml = [
  'index.html',
  'readiness.html',
  'sleep.html',
  'activity.html',
  'heart-rate.html',
  'stress.html',
  'settings.html'
];

const missingDistPages = expectedHtml.filter((file) => !existsSync(new URL(`../dist/${file}`, import.meta.url)));

if (missingLabels.length || extraLabels.length || missingDistPages.length) {
  if (missingLabels.length) console.error(`Missing nav labels: ${missingLabels.join(', ')}`);
  if (extraLabels.length) console.error(`Unexpected active nav labels: ${extraLabels.join(', ')}`);
  if (missingDistPages.length) console.error(`Missing dist HTML pages: ${missingDistPages.join(', ')}`);
  process.exit(1);
}

console.log('MPA nav manifest guard passed for locked PR1 scaffold.');
