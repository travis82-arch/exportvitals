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

test('homepage starts with hero CTA and concise trust copy', () => {
  assert.equal(homeHtml.includes('<h1>ExportVitals</h1>'), true);
  assert.equal(homeHtml.includes('Your data, in your browser'), true);
  assert.equal(homeHtml.includes('<nav class="smallnav">'), false);
  assert.equal(homeHtml.includes('src="/icons/app-icon-512.png"'), true);
  assert.equal(homeHtml.includes('alt="ExportVitals app icon"'), true);
  assert.equal(homeHtml.includes('Supports Oura export ZIPs today'), true);
  assert.equal(homeHtml.includes('Fitbit support planned'), true);
  assert.equal(homeHtml.includes('not affiliated with Oura'), true);
  assert.equal(homeHtml.includes('href="/app">Open the dashboard</a>'), true);
});

test('homepage removes footer utility links and keeps a single final CTA section', () => {
  assert.equal(homeHtml.includes('href="/about"'), false);
  assert.equal(homeHtml.includes('href="/privacy"'), false);
  assert.equal(homeHtml.includes('<footer class="footer section">'), false);
  assert.equal(homeHtml.includes('<h2>Open your dashboard</h2>'), true);
});

test('exact trust statement is present on home and privacy pages and sourced by config on about', () => {
  assert.equal(homeHtml.includes(trustStatement), true);
  assert.equal(privacyHtml.includes(trustStatement), true);
  assert.equal(aboutHtml.includes("SITE_COPY.trustStatement"), true);
});

test('about page contains compact sections for privacy, compatibility, repo status, and affiliation', () => {
  assert.equal(aboutHtml.includes('What this is'), true);
  assert.equal(aboutHtml.includes('Privacy / local processing'), true);
  assert.equal(aboutHtml.includes('Compatibility'), true);
  assert.equal(aboutHtml.includes('Open source / public repo'), true);
  assert.equal(aboutHtml.includes('Affiliation'), true);
  assert.equal(aboutHtml.includes('Public repo coming soon.'), true);
  assert.equal(aboutHtml.includes('getPublicRepoUrl'), true);
  assert.equal(aboutHtml.includes('Open the dashboard'), false);
  assert.equal(aboutHtml.includes('Landing page'), false);
});

test('marketing metadata and canonical URLs use deployed pages domain', () => {
  assert.equal(homeHtml.includes('<link rel="canonical" href="https://oura-pwa-dashboard.pages.dev/" />'), true);
  assert.equal(aboutHtml.includes('https://oura-pwa-dashboard.pages.dev/about'), true);
  assert.equal(privacyHtml.includes('https://oura-pwa-dashboard.pages.dev/privacy'), true);
  assert.equal(robots.includes('https://oura-pwa-dashboard.pages.dev/sitemap.xml'), true);
  assert.equal(sitemap.includes('https://oura-pwa-dashboard.pages.dev/app'), true);
});

test('branding and support/source values are centralized and neutral', () => {
  assert.equal(siteCopy.includes("productName: 'ExportVitals'"), true);
  assert.equal(siteCopy.includes("publicRepoUrl: 'TBD_PUBLIC_REPO_URL'"), true);
  assert.equal(siteCopy.includes("PUBLIC_REPO_FALLBACK_TEXT = 'Public repo coming soon.'"), true);
  assert.equal(siteCopy.includes("canonicalBaseUrl: 'https://oura-pwa-dashboard.pages.dev'"), true);
  assert.equal(manifest.includes('\"name\": \"ExportVitals\"'), true);
  assert.equal(manifest.includes('\"short_name\": \"Vitals\"'), true);
  assert.equal(homeHtml.includes('Oura Dashboard'), false);
});
