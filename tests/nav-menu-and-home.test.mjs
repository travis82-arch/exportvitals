import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navManifest } from '../src/nav/navManifest.js';

const topNavSource = readFileSync(new URL('../src/components/TopNav.js', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const requiredMenuLabels = ['Home', 'Readiness', 'Sleep', 'Activity', 'Heart Rate', 'Stress', 'Strain', 'Debug'];

test('persistent tab strip is replaced by upper-right menu navigation', () => {
  assert.equal(topNavSource.includes('tabs'), false);
  assert.equal(topNavSource.includes('menu-trigger'), true);
  assert.equal(topNavSource.includes('menu-panel'), true);
  assert.equal(topNavSource.includes('Upload'), true);
  const labels = navManifest.map((item) => item.label);
  requiredMenuLabels.forEach((label) => {
    assert.equal(labels.includes(label), true);
  });
});

test('home remains default landing view and does not render redundant heading copy', () => {
  assert.equal(indexHtml.includes('data-page="index"'), true);
  assert.equal(entrySource.includes('OURA DASHBOARD'), false);
  assert.equal(entrySource.includes("PAGE_META ="), true);
});

test('home summary cards include navigation links to detail pages', () => {
  assert.equal(entrySource.includes('chip-link'), true);
  assert.equal(entrySource.includes("`/${domain}.html`"), true);
  assert.equal(entrySource.includes('href="/sleep.html"'), true);
  assert.equal(entrySource.includes('href="/activity.html"'), true);
  assert.equal(entrySource.includes('href="/heart-rate.html"'), true);
  assert.equal(entrySource.includes('href="/stress.html"'), true);
});

test('settings page is no longer routed as a top-level view', () => {
  assert.equal(entrySource.includes("if (page === 'settings')"), false);
  assert.equal(entrySource.includes("if (page === 'debug')"), true);
});
