import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const pages = [
  'index.html',
  'readiness.html',
  'sleep.html',
  'activity.html',
  'heart-rate.html',
  'stress.html',
  'settings.html',
  // legacy pages kept in build output for safer PR1 transition
  'vitals.html',
  'trends.html',
  'journal.html',
  'data-tools-import.html',
  'data-tools-export.html',
  'glossary.html',
  'debug.html',
  'my-health.html'
];

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page.replace('.html', ''), resolve(__dirname, page)]))
    }
  }
});
