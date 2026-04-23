import test from 'node:test';
import assert from 'node:assert/strict';
import { compactRangeLabel, resolveSelectedRange } from '../src/state/selectedRange.js';

test('resolveSelectedRange preserves valid custom single day and range', () => {
  const dates = ['2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04'];

  const single = resolveSelectedRange(dates, { preset: 'custom', start: '2026-04-03', end: '2026-04-03' });
  assert.equal(single.preset, 'custom');
  assert.equal(single.start, '2026-04-03');
  assert.equal(single.end, '2026-04-03');
  assert.equal(single.isSingleDay, true);

  const range = resolveSelectedRange(dates, { preset: 'custom', start: '2026-04-04', end: '2026-04-02' });
  assert.equal(range.preset, 'custom');
  assert.equal(range.start, '2026-04-02');
  assert.equal(range.end, '2026-04-04');
  assert.equal(range.isSingleDay, false);
});

test('resolveSelectedRange falls back to latest-day when stored custom window is unavailable', () => {
  const dates = ['2026-05-09', '2026-05-10'];
  const resolved = resolveSelectedRange(dates, { preset: 'custom', start: '2026-04-01', end: '2026-04-03' });
  assert.equal(resolved.preset, 'custom');
  assert.equal(resolved.start, '2026-05-10');
  assert.equal(resolved.end, '2026-05-10');
});

test('compactRangeLabel keeps custom labels short', () => {
  const singleLabel = compactRangeLabel({ preset: 'custom', start: '2026-06-01', end: '2026-06-01' });
  const rangeLabel = compactRangeLabel({ preset: 'custom', start: '2026-06-01', end: '2026-06-07' });
  assert.equal(singleLabel.startsWith('Custom ·'), true);
  assert.equal(rangeLabel.startsWith('Custom ·'), true);
});
