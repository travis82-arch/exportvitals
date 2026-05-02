import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const pages = [
  'index.html',
  'about/index.html',
  'privacy/index.html',
  'app/index.html',
  'app/about/index.html',
  'app/readiness/index.html',
  'app/sleep/index.html',
  'app/activity/index.html',
  'app/heart-rate/index.html',
  'app/stress/index.html',
  'app/strain/index.html',
  'app/debug/index.html',
  'app/vitals/index.html',
  'app/trends/index.html',
  'app/journal/index.html',
  'app/data-tools-import/index.html',
  'app/data-tools-export/index.html',
  'app/glossary/index.html',
  'app/settings/index.html',
  'app/my-health/index.html',
  'wearable-export-viewer/index.html',
  'oura-export-viewer/index.html',
  'local-health-dashboard/index.html',
  'privacy-first-wearable-data/index.html',
  'docs/how-to-export-oura-data/index.html',
  'compare/local-vs-cloud-health-dashboard/index.html'
];

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page.replace('/index.html', '').replace('.html', '').replace(/\//g, '-'), resolve(__dirname, page)]))
    }
  }
});
