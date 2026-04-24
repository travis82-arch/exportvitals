import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navManifest } from '../src/nav/navManifest.js';

const topNavSource = readFileSync(new URL('../src/components/TopNav.js', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');
const landingHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const appIndexHtml = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const appAboutHtml = readFileSync(new URL('../app/about/index.html', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

const requiredMenuLabels = ['Home', 'Readiness', 'Sleep', 'Activity', 'Heart Rate', 'Stress', 'Strain'];

test('persistent tab strip is replaced by upper-right menu navigation', () => {
  assert.equal(topNavSource.includes('menu-trigger'), true);
  assert.equal(topNavSource.includes('menu-panel'), true);
  assert.equal(topNavSource.includes('Upload / Import data'), true);
  assert.equal(topNavSource.includes('About'), true);
  assert.equal(topNavSource.includes('Landing page'), false);
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

test('utility menu exposes a single dark mode toggle and no theme submenu', () => {
  assert.equal(topNavSource.includes('menuDarkModeToggle'), true);
  assert.equal(topNavSource.includes('Dark Mode'), true);
  assert.equal(topNavSource.includes('menu-theme-trigger'), false);
  assert.equal(topNavSource.includes('data-theme-option="dark"'), false);
  assert.equal(topNavSource.includes('data-theme-option="light"'), false);
});

test('utility menu keeps only upload, about, and dark mode actions', () => {
  assert.equal(topNavSource.includes('Upload / Import data'), true);
  assert.equal(topNavSource.includes('href="/app/about/index.html"'), true);
  assert.equal(topNavSource.includes('Dark Mode'), true);
  assert.equal(topNavSource.includes('Public repo'), false);
  assert.equal(topNavSource.includes('menu-upload-status'), false);
  assert.equal(topNavSource.includes('menu-upload-progress'), false);
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


test('about opens inside app shell with top controls still present', () => {
  assert.equal(appAboutHtml.includes('data-page="about"'), true);
  assert.equal(appAboutHtml.includes('<header class="topbar">'), true);
  assert.equal(appAboutHtml.includes('<div id="topNav"></div>'), true);
  assert.equal(entrySource.includes("if (page === 'about')"), true);
});

test('home remains default landing view and does not render redundant heading copy', () => {
  assert.equal(landingHtml.includes('Your data, in your browser'), true);
  assert.equal(landingHtml.includes('<nav class="smallnav">'), false);
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


test('home stress summaries use range-aware total high stress minutes', () => {
  assert.equal(entrySource.includes("title: range.isSingleDay ? 'Stress' : 'High stress'"), true);
  assert.equal(entrySource.includes('summary.totalHighStress'), true);
  assert.equal(entrySource.includes("label: range.isSingleDay ? 'High stress' : 'Total high stress'"), true);
});
