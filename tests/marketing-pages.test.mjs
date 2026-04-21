import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const homeHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const aboutHtml = readFileSync(new URL('../about/index.html', import.meta.url), 'utf8');
const privacyHtml = readFileSync(new URL('../privacy/index.html', import.meta.url), 'utf8');
const siteCopy = readFileSync(new URL('../src/config/siteCopy.js', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8');
const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

const trustStatement = 'When you import an Oura export ZIP, parsing and metric generation run in your browser. Imported files and derived health data are stored locally on your device and are not sent to app server endpoints.';

test('homepage follows conversion copy structure and points CTA to /app', () => {
  assert.equal(homeHtml.includes('<h1>View your Oura export in your browser</h1>'), true);
  assert.equal(homeHtml.includes('Free and open source'), true);
  assert.equal(homeHtml.includes('No data leaves your browser'), true);
  assert.equal(homeHtml.includes('No account required'), true);
  assert.equal(homeHtml.includes('href="/app">Open the dashboard</a>'), true);
  assert.equal(homeHtml.includes('https://github.com/travis82-arch/oura-pwa-dashboard'), true);
});

test('exact trust statement is present on both home and privacy pages', () => {
  assert.equal(homeHtml.includes(trustStatement), true);
  assert.equal(privacyHtml.includes(trustStatement), true);
});

test('marketing metadata and canonical URLs use deployed pages domain', () => {
  assert.equal(homeHtml.includes('<link rel="canonical" href="https://oura-pwa-dashboard.pages.dev/" />'), true);
  assert.equal(aboutHtml.includes('https://oura-pwa-dashboard.pages.dev/about'), true);
  assert.equal(privacyHtml.includes('https://oura-pwa-dashboard.pages.dev/privacy'), true);
  assert.equal(robots.includes('https://oura-pwa-dashboard.pages.dev/sitemap.xml'), true);
  assert.equal(sitemap.includes('https://oura-pwa-dashboard.pages.dev/app'), true);
});

test('branding and support/source values are centralized and neutral', () => {
  assert.equal(siteCopy.includes("productName: 'Local Health Export Viewer'"), true);
  assert.equal(siteCopy.includes("sourceUrl: 'https://github.com/travis82-arch/oura-pwa-dashboard'"), true);
  assert.equal(siteCopy.includes("canonicalBaseUrl: 'https://oura-pwa-dashboard.pages.dev'"), true);
  assert.equal(manifest.includes('"name": "Local Health Export Viewer"'), true);
  assert.equal(homeHtml.includes('Oura Dashboard'), false);
});
