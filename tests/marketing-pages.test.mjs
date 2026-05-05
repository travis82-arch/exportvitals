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


const faqHtml = readFileSync(new URL('../oura-ring-faq/index.html', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');

test('oura faq page is included in mpa build and contains robust content and anchors', () => {
  assert.equal(viteConfig.includes("'oura-ring-faq/index.html'"), true);
  assert.equal(faqHtml.includes('Oura Ring FAQ: App, Sync, Export, Membership, and Data Questions'), true);
  assert.equal(faqHtml.includes('Can updating Google Play fix an unsupported Android phone?'), true);
  assert.equal(faqHtml.includes('Battery and charging'), true);
  assert.equal(faqHtml.includes('Do I need Oura Membership to use the ring?'), true);
  assert.equal(faqHtml.includes('Does ExportVitals require an account?'), true);
  assert.equal(faqHtml.includes('Official references'), true);
  assert.equal(faqHtml.includes('Oura’s app requirements, membership rules, export options, API access, and feature availability can change.'), true);
  assert.equal(faqHtml.includes('id="does-exportvitals-upload-my-oura-zip"'), true);
  assert.equal(faqHtml.includes('id="can-exportvitals-sync-directly-with-my-oura-ring"'), true);
  assert.equal(faqHtml.includes('id="can-exportvitals-help-if-my-phone-is-too-old-for-the-oura-app"'), true);
  assert.equal(faqHtml.includes('id="can-exportvitals-replace-oura-on-the-web"'), true);
  assert.equal(faqHtml.includes('id="what-should-i-do-first-sync-export-or-import-into-exportvitals"'), true);
  assert.equal(faqHtml.includes('https://exportvitals.pages.dev/oura-ring-faq/'), true);
});

test('homepage shows faq answer previews and read more faqs link', () => {
  assert.equal(homeHtml.includes('No. ExportVitals is designed around a local-first workflow.'), true);
  assert.equal(homeHtml.includes('No. ExportVitals does not pair with the ring, connect over Bluetooth, or sync new ring data.'), true);
  assert.equal(homeHtml.includes('Partly. ExportVitals cannot install the Oura app on an unsupported phone'), true);
  assert.equal(homeHtml.includes('Read more FAQs'), true);
});

test('sitemap includes oura faq page and faq json-ld is parseable', () => {
  assert.equal(sitemap.includes('https://exportvitals.pages.dev/oura-ring-faq/'), true);
  const m = faqHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.notEqual(m, null);
  assert.doesNotThrow(() => JSON.parse(m[1]));
});
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
  assert.equal(aboutHtml.includes('View source on GitHub'), true);
  assert.equal(aboutHtml.includes('getPublicRepoUrl'), true);
  assert.equal(aboutHtml.includes('Open the dashboard'), false);
  assert.equal(aboutHtml.includes('Landing page'), false);
});

test('marketing metadata and canonical URLs use deployed pages domain', () => {
  assert.equal(homeHtml.includes('<link rel="canonical" href="https://exportvitals.pages.dev/" />'), true);
  assert.equal(aboutHtml.includes('https://exportvitals.pages.dev/about/'), true);
  assert.equal(privacyHtml.includes('https://exportvitals.pages.dev/privacy/'), true);
  assert.equal(robots.includes('https://exportvitals.pages.dev/sitemap.xml'), true);
  assert.equal(sitemap.includes('https://exportvitals.pages.dev/app/'), true);
});

test('branding and support/source values are centralized and neutral', () => {
  assert.equal(siteCopy.includes("productName: 'ExportVitals'"), true);
  assert.equal(siteCopy.includes("publicRepoUrl: 'https://github.com/travis82-arch/exportvitals'"), true);
  assert.equal(siteCopy.includes("supportUrl: 'https://ko-fi.com/tinytoolslab'"), true);
  assert.equal(siteCopy.includes("label: 'Support development'"), true);
  assert.equal(siteCopy.includes("PUBLIC_REPO_FALLBACK_TEXT = 'Repository link unavailable.'"), true);
  assert.equal(siteCopy.includes(String.raw`canonicalBaseUrl: SITE_URL.replace(/\/$/, '')`), true);
  assert.equal(manifest.includes('\"name\": \"ExportVitals\"'), true);
  assert.equal(manifest.includes('\"short_name\": \"Vitals\"'), true);
  assert.equal(homeHtml.includes('Oura Dashboard'), false);
});
