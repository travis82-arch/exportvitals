import test from 'node:test';
import assert from 'node:assert/strict';
import { sniffDelimiter, safeJsonParse, baselineMedian, metricDelta } from '../src/vitals-core.mjs';

test('delimiter auto-detect prefers semicolon when header sensible', () => {
  const csv = 'day;score;contributors\n2026-02-01;80;"{}"';
  assert.equal(sniffDelimiter(csv).delimiter, ';');
});

test('json-in-cell parser returns structured error without throwing', () => {
  const bad = safeJsonParse('{nope');
  assert.equal(bad.parsed, null);
  assert.ok(bad.error);
});

test('baseline median and temp delta near-zero suppresses percent', () => {
  const rows = [
    { date: '2026-01-01', temp: 0.1 },
    { date: '2026-01-02', temp: 0.2 },
    { date: '2026-01-03', temp: -0.1 }
  ];
  const baseline = baselineMedian(rows, 'temp', '2026-01-03', 14);
  assert.ok(Math.abs(baseline - 0.15) < 1e-9);
  const delta = metricDelta('temp', -0.1, baseline);
  assert.equal(delta.percent, null);
});
