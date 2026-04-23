import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const topNavSource = readFileSync(new URL('../src/components/TopNav.js', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');
const themeSource = readFileSync(new URL('../src/state/theme.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

test('theme mode has a single source of truth with persistence and document-level application', () => {
  assert.equal(themeSource.includes("const THEME_KEY = 'ouraDashboardThemeV1'"), true);
  assert.equal(themeSource.includes("document.documentElement.setAttribute('data-theme'"), true);
  assert.equal(themeSource.includes("storage.setItem(THEME_KEY, preferred)"), true);
  assert.equal(themeSource.includes("'system'"), false);
  assert.equal(entrySource.includes('initTheme()'), true);
  assert.equal(topNavSource.includes('name="themeChoice"'), true);
  assert.equal(topNavSource.includes('value="system"'), false);
});

test('import menu shows staged progress and returns users to home after success', () => {
  assert.equal(topNavSource.includes('menuUploadProgress'), true);
  assert.equal(entrySource.includes('Reading ZIP'), true);
  assert.equal(entrySource.includes('Parsing files'), true);
  assert.equal(entrySource.includes('Computing metrics'), true);
  assert.equal(entrySource.includes('Loading dashboard'), true);
  assert.equal(entrySource.includes("window.location.href = '/app/index.html'"), true);
});

test('light theme variables are present for major surfaces', () => {
  assert.equal(styleSource.includes(":root[data-theme='light']"), true);
  assert.equal(styleSource.includes('--bg: #edf2f8;'), true);
  assert.equal(styleSource.includes('--card: #ffffff;'), true);
  assert.equal(styleSource.includes('--text: #132238;'), true);
});
