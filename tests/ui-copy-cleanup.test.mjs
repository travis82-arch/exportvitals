import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/mpa-entry.js', import.meta.url), 'utf8');

test('user-facing copy avoids derived-from implementation notes', () => {
  assert.equal(source.includes('Derived from daytime heart-rate points'), false);
  assert.equal(source.includes('Derived from sleep-model nightly range'), false);
  assert.equal(source.includes('Derived from available nightly variability proxy'), false);
});
