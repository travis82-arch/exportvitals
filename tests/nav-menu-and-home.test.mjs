import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navManifest } from '../src/nav/navManifest.js';
import { SITE_COPY, getPublicRepoUrl } from '../src/config/siteCopy.js';

const topNavSource = readFileSync(new URL('../src/components/TopNav.js', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');
const landingHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appIndexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

const requiredMenuLabels = ['Home', 'Readiness', 'Sleep', 'Activity', 'Heart Rate', 'Stress', 'Strain'];

test('persistent tab strip is replaced by upper-right menu navigation', () => {
  assert.equal(topNavSource.includes('menu-trigger'), true);
  assert.equal(topNavSource.includes('menu-panel'), true);
  assert.equal(topNavSource.includes('Upload'), true);
  assert.equal(topNavSource.includes('About / Read me'), false);
  assert.equal(topNavSource.includes('Landing page'), true);
  assert.equal(topNavSource.includes('Public repo'), true);
  const labels = navManifest.map((item) => item.label);
  requiredMenuLabels.forEach((label) => {
    assert.equal(labels.includes(label), true);
  });
  assert.equal(labels.includes('Debug'), false);
});

test('menu controller defaults closed and closes safely on navigation interactions', () => {
  assert.equal(topNavSource.includes('let isOpen = false'), true);
  assert.equal(topNavSource.includes('panel.hidden = !isOpen'), true);
  assert.equal(topNavSource.includes('setOpen(!isOpen)'), true);
  assert.equal(topNavSource.includes("window.addEventListener('pageshow'"), true);
  assert.equal(topNavSource.includes("window.addEventListener('popstate'"), true);
  assert.equal(topNavSource.includes("window.addEventListener('pagehide'"), true);
  assert.equal(topNavSource.includes("document.addEventListener('pointerdown'"), true);
  assert.equal(topNavSource.includes("link.addEventListener('click', () => {"), true);
  assert.equal(topNavSource.includes('uploadAction?.addEventListener'), true);
  assert.equal(topNavSource.includes('localStorage'), false);
});

test('utility menu keeps theme choices collapsed under a dedicated trigger', () => {
  assert.equal(topNavSource.includes('menu-theme-trigger'), true);
  assert.equal(topNavSource.includes('menu-theme-options'), true);
  assert.equal(topNavSource.includes('setThemeExpanded'), true);
  assert.equal(topNavSource.includes('name="themeChoice"'), false);
  assert.equal(topNavSource.includes('Supports Oura export ZIP. Parsing runs locally.'), false);
});

test('public repo link comes from centralized config and gracefully handles placeholder values', () => {
  assert.equal(topNavSource.includes('getPublicRepoUrl'), true);
  assert.equal(SITE_COPY.support.publicRepoUrl.length > 0, true);
  assert.equal(getPublicRepoUrl(), '');
});

test('menu panel uses hidden attribute as the single source of visibility truth', () => {
  assert.equal(topNavSource.includes('id="appMenuPanel" hidden'), true);
  assert.equal(cssSource.includes('.menu-panel[hidden]'), true);
  assert.equal(cssSource.includes('display: none;'), true);
});

test('menu trigger uses hamburger icon and utility label', () => {
  assert.equal(topNavSource.includes('aria-label="Open utility menu"'), true);
  assert.equal(topNavSource.includes('>☰</button>'), true);
});

test('home remains default landing view and does not render redundant heading copy', () => {
  assert.equal(landingHtml.includes('Your data, in your browser'), true);
  assert.equal(appIndexHtml.includes('data-page="index"'), true);
  assert.equal(entrySource.includes('OURA DASHBOARD'), false);
  assert.equal(entrySource.includes('PAGE_META ='), true);
});

test('home summary cards include navigation links to detail pages', () => {
  assert.equal(entrySource.includes('chip-link'), true);
  assert.equal(entrySource.includes("`/app/${domain}/index.html`"), true);
  assert.equal(entrySource.includes('href="/app/readiness/index.html"'), true);
  assert.equal(entrySource.includes('href="/app/sleep/index.html"'), true);
  assert.equal(entrySource.includes('href="/app/activity/index.html"'), true);
  assert.equal(entrySource.includes('href="/app/heart-rate/index.html"'), true);
  assert.equal(entrySource.includes('href="/app/stress/index.html"'), true);
  assert.equal(entrySource.includes('href="/app/strain/index.html"'), true);
});

test('home cards use destination accent treatment classes', () => {
  assert.equal(entrySource.includes('destinationAccentClass'), true);
  assert.equal(cssSource.includes('.card-accent-readiness'), true);
  assert.equal(cssSource.includes('.card-accent-sleep'), true);
  assert.equal(cssSource.includes('.card-accent-activity'), true);
  assert.equal(cssSource.includes('.card-accent-heart-rate'), true);
  assert.equal(cssSource.includes('.card-accent-stress'), true);
  assert.equal(cssSource.includes('.card-accent-strain'), true);
});

test('settings page is no longer routed as a top-level view', () => {
  assert.equal(entrySource.includes("if (page === 'settings')"), false);
  assert.equal(entrySource.includes("if (page === 'debug')"), true);
});
