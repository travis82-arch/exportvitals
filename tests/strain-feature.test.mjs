import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navManifest } from '../src/nav/navManifest.js';
import { strainSummary } from '../src/state/pageSummaries.js';

const entrySource = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');

test('menu destinations include Strain and Debug, without Settings/Insights', () => {
  const labels = navManifest.map((item) => item.label);
  assert.equal(labels.includes('Strain'), true);
  assert.equal(labels.includes('Debug'), true);
  assert.equal(labels.includes('Insights'), false);
  assert.equal(labels.includes('Settings'), false);
  assert.equal(navManifest.some((item) => item.href === '/strain'), true);
  assert.equal(navManifest.some((item) => item.href === '/debug'), true);
});

test('strain page renderer is wired in app entry', () => {
  assert.equal(entrySource.includes('function renderStrainPage('), true);
  assert.equal(entrySource.includes("if (page === 'strain')"), true);
  assert.equal(entrySource.includes('Biometrics'), true);
  assert.equal(entrySource.includes('Strain states by day'), true);
  assert.equal(entrySource.includes('not a diagnosis'), true);
  assert.equal(entrySource.includes('byDateInsights'), false);
});

test('strain selector returns allowed state labels with sufficient history', () => {
  const makeDate = (offset) => {
    const dt = new Date(Date.UTC(2026, 0, 1 + offset));
    return dt.toISOString().slice(0, 10);
  };
  const makeRows = (mapper) => Array.from({ length: 40 }, (_, i) => mapper(i + 1));
  const dailyReadiness = makeRows((d) => ({ date: makeDate(d), score: d === 40 ? 58 : 82, temperatureDeviation: d === 40 ? 0.45 : 0.05 }));
  const dailySleep = makeRows((d) => ({ date: makeDate(d), score: d === 40 ? 61 : 84 }));
  const dailyStress = makeRows((d) => ({ date: makeDate(d), high: d === 40 ? 155 : 48, recovery: d === 40 ? 20 : 68 }));
  const sleepModel = makeRows((d) => ({ date: makeDate(d), avgBreath: d === 40 ? 16.1 : 13.5 }));
  const derivedNightlyVitals = makeRows((d) => ({ date: makeDate(d), rhr_night_bpm: d === 40 ? 58 : 49, hrv_rmssd_proxy_ms: d === 40 ? 17 : 31 }));

  const rangeRows = {
    dailyReadiness: dailyReadiness.slice(-7),
    dailySleep: dailySleep.slice(-7),
    dailyStress: dailyStress.slice(-7),
    sleepModel: sleepModel.slice(-7),
    derivedNightlyVitals: derivedNightlyVitals.slice(-7)
  };

  const summary = strainSummary({ isSingleDay: true, end: makeDate(40) }, rangeRows, {
    dailyReadiness,
    dailySleep,
    dailyStress,
    sleepModel,
    derivedNightlyVitals
  });

  assert.equal(['No signs', 'Minor signs', 'Major signs', 'Not enough history yet'].includes(summary.state.label), true);
  assert.equal(Array.isArray(summary.trendStates), true);
});

test('strain selector can return insufficient-history state when baseline is too short', () => {
  const shortRows = [
    { date: '2026-03-01', score: 80, temperatureDeviation: 0.1 },
    { date: '2026-03-02', score: 79, temperatureDeviation: 0.0 }
  ];
  const summary = strainSummary(
    { isSingleDay: true, end: '2026-03-02' },
    { dailyReadiness: shortRows, dailySleep: [], dailyStress: [], sleepModel: [], derivedNightlyVitals: [] },
    { dailyReadiness: shortRows, dailySleep: [], dailyStress: [], sleepModel: [], derivedNightlyVitals: [] }
  );
  assert.equal(summary.state.label, 'Not enough history yet');
});
