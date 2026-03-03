import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sniffDelimiter,
  parseContributors,
  parseSpo2Average,
  baselineMedian,
  readJournalEntries,
  saveJournalEntries,
  createDateContext,
  getScopeRange,
  toCsv
} from '../src/vitals-core.mjs';

test('contributors JSON parsing robustness', () => {
  assert.deepEqual(parseContributors('{"deep_sleep":80}'), { deep_sleep: 80 });
  assert.equal(parseContributors('{nope'), null);
  assert.equal(parseContributors(null), null);
  assert.equal(parseContributors('12'), null);
});

test('dailySpo2 JSON average parsing', () => {
  assert.equal(parseSpo2Average('{"average":97.8}', null), 97.8);
  assert.equal(parseSpo2Average('{bad', '95.2'), 95.2);
  assert.equal(parseSpo2Average(null, null), null);
});

test('baseline median supports varying windows', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ date: `2026-01-0${n}`, score: n }));
  assert.equal(baselineMedian(rows, 'score', '2026-01-07', 3), 5);
  assert.equal(baselineMedian(rows, 'score', '2026-01-07', 7), 3.5);
});

test('date range grouping day/week/month', () => {
  const ctx = createDateContext(['2026-02-01', '2026-02-02', '2026-02-10'], '2026-02-01');
  assert.equal(ctx.scope, 'week');
  assert.deepEqual(getScopeRange('day', '2026-02-10'), { start: '2026-02-10', end: '2026-02-10' });
  assert.deepEqual(getScopeRange('week', '2026-02-10'), { start: '2026-02-09', end: '2026-02-15' });
  assert.deepEqual(getScopeRange('month', '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' });
});

test('journal storage roundtrip', () => {
  const memory = { _v: null, getItem() { return this._v; }, setItem(_k, v) { this._v = v; } };
  saveJournalEntries(memory, 'journal', [{ id: '1', tag: 'Alcohol', date: '2026-01-01' }]);
  const loaded = readJournalEntries(memory, 'journal');
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].tag, 'Alcohol');
});

test('delimiter auto-detect prefers semicolon when header sensible', () => {
  const csv = 'day;score;contributors\n2026-02-01;80;"{}"';
  assert.equal(sniffDelimiter(csv).delimiter, ';');
});

test('export CSV includes union of expected columns', () => {
  const csv = toCsv([{ date: '2026-01-01', readinessScore: 80 }, { date: '2026-01-02', sleepScore: 75 }]);
  const header = csv.split('\n')[0];
  assert.equal(header, 'date,readinessScore,sleepScore');
});
