import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dateControlSource = readFileSync(new URL('../src/components/DateRangeControl.js', import.meta.url), 'utf8');
const entrySource = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');


test('date range control uses compact single-row preset + active date', () => {
  assert.equal(dateControlSource.includes('compact-range-top'), true);
  assert.equal(dateControlSource.includes('range-active-date'), true);
  assert.equal(dateControlSource.includes('selectedPreset === \'custom\''), true);
});

test('global shell removes large intro banner and hero uses centered circle treatment', () => {
  assert.equal(entrySource.includes('Oura dashboard'), false);
  assert.equal(entrySource.includes('hero-value-circle'), true);
});
