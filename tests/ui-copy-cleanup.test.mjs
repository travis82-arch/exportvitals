import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');

test('user-facing copy avoids derived-from implementation notes', () => {
  assert.equal(source.includes('Derived from daytime heart-rate points'), false);
  assert.equal(source.includes('Derived from sleep-model nightly range'), false);
  assert.equal(source.includes('Derived from available nightly variability proxy'), false);
  assert.equal(source.includes('Preview card uses available data only. Full sleep deep-dive remains in the Sleep tab.'), false);
  assert.equal(source.includes('Selected day:'), false);
  assert.equal(source.includes('Daily view for'), false);
  assert.equal(source.includes('Past 14 days'), false);
  assert.equal(source.includes('Page parity for this tab remains intentionally limited in PR3.'), false);
  assert.equal(source.includes('sleep-estimate-chip'), true);
  assert.equal(source.includes('Key metrics'), false);
  assert.equal(source.includes('OURA DASHBOARD'), false);
});
