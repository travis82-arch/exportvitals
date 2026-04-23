import test from 'node:test';
import assert from 'node:assert/strict';
import { buildActivityHeartRateBreakdown, selectActivityHeartRateSamples } from '../src/domain/activityHeartRate.js';

function buildSamples({ startIso, count, stepSec, bpmStart = 120 }) {
  const startMs = new Date(startIso).getTime();
  return Array.from({ length: count }, (_, idx) => ({
    timestamp: new Date(startMs + idx * stepSec * 1000).toISOString(),
    bpm: bpmStart + (idx % 20)
  }));
}

test('buildActivityHeartRateBreakdown computes peak/avg HR and zone minutes', () => {
  const activity = {
    date: '2026-02-14',
    startTime: '2026-02-14T10:00:00Z',
    endTime: '2026-02-14T10:30:00Z',
    durationSec: 1800
  };
  const heartRateRows = buildSamples({ startIso: activity.startTime, count: 60, stepSec: 30, bpmStart: 112 });
  const result = buildActivityHeartRateBreakdown(activity, heartRateRows);

  assert.equal(result.supported, true);
  assert.equal(result.samples.length, 60);
  assert.ok(result.avgHr > 115 && result.avgHr < 130);
  assert.equal(result.peakHr, 131);
  assert.ok(result.zones.some((zone) => zone.minutes > 0));
  assert.ok(result.coverageRatio > 0.5);
});

test('buildActivityHeartRateBreakdown gracefully returns unsupported for sparse samples', () => {
  const activity = {
    date: '2026-02-14',
    startTime: '2026-02-14T10:00:00Z',
    endTime: '2026-02-14T10:20:00Z',
    durationSec: 1200
  };
  const heartRateRows = [
    { timestamp: '2026-02-14T10:00:00Z', bpm: 118 },
    { timestamp: '2026-02-14T10:14:00Z', bpm: 150 }
  ];

  const result = buildActivityHeartRateBreakdown(activity, heartRateRows);

  assert.equal(result.supported, false);
  assert.match(result.reason, /sparse/i);
  assert.equal(result.samples.length, 2);
  assert.equal(result.peakHr, 150);
});

test('selectActivityHeartRateSamples prefers workout/activity-linked samples when present', () => {
  const activity = {
    id: 'wk-123',
    type: 'Running',
    startTime: '2026-02-14T10:00:00Z',
    endTime: '2026-02-14T10:10:00Z'
  };
  const window = {
    startMs: new Date(activity.startTime).getTime(),
    endMs: new Date(activity.endTime).getTime()
  };
  const samples = [
    { timestamp: '2026-02-14T10:01:00Z', bpm: 120, source: 'daytime' },
    { timestamp: '2026-02-14T10:02:00Z', bpm: 130, source: 'workout', workoutId: 'wk-123' },
    { timestamp: '2026-02-14T10:03:00Z', bpm: 131, source: 'workout', workoutId: 'wk-123' },
    { timestamp: '2026-02-14T10:04:00Z', bpm: 122, source: 'workout', workoutId: 'other' }
  ];

  const result = selectActivityHeartRateSamples(activity, samples, window);
  assert.equal(result.associationMode, 'activity-linked');
  assert.deepEqual(result.samples.map((row) => row.bpm), [130, 131]);
});
