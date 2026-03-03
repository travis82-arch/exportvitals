import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const pages = [
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

export default defineConfig({
  build: {
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page.replace('.html', ''), resolve(__dirname, page)]))
    }
  }
});
