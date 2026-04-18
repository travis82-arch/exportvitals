import test from 'node:test';
import assert from 'node:assert/strict';
import { activitySummary, heartRateSummary } from '../src/state/pageSummaries.js';

test('activitySummary uses selected-day values in single-day mode', () => {
  const range = { isSingleDay: true };
  const day = {
    dailyActivity: {
      score: 84,
      steps: 10432,
      totalCalories: 2380,
      activeCalories: 620,
      inactivityAlerts: 2,
      mediumActivityTime: 4200,
      highActivityTime: 900
    }
  };
  const result = activitySummary(range, day, { dailyActivity: [], workout: [{}, {}], session: [{}] });
  assert.equal(result.score, 84);
  assert.equal(result.steps, 10432);
  assert.equal(result.totalBurn, 2380);
  assert.equal(result.activitySeconds, 5100);
  assert.equal(result.workoutCount, 2);
  assert.equal(result.sessionCount, 1);
});

test('activitySummary averages range values in multi-day mode', () => {
  const range = { isSingleDay: false };
  const rows = [
    { score: 78, steps: 9000, totalCalories: 2100, activeCalories: 500, inactivityAlerts: 3, mediumActivityTime: 3600, highActivityTime: 900 },
    { score: 82, steps: 11000, totalCalories: 2300, activeCalories: 620, inactivityAlerts: 1, mediumActivityTime: 4200, highActivityTime: 1200 }
  ];
  const result = activitySummary(range, {}, { dailyActivity: rows, workout: [], session: [] });
  assert.equal(result.score, 80);
  assert.equal(result.steps, 10000);
  assert.equal(result.totalBurn, 2200);
  assert.equal(result.activeBurn, 560);
  assert.equal(Math.round(result.activitySeconds), 4950);
});

test('heartRateSummary uses selected-day summaries for single day', () => {
  const range = { isSingleDay: true };
  const day = {
    heartRateWindowSummary: { min: 49, avg: 56.4, max: 73, points: 180 },
    daytimeHeartRateSummary: { min: 58 },
    derivedNightlyVitals: { hrv_rmssd_proxy_ms: 22.3, rhr_night_bpm: 49 }
  };
  const result = heartRateSummary(range, day, {});
  assert.equal(result.overnightAvg, 56.4);
  assert.equal(result.overnightMin, 49);
  assert.equal(result.overnightMax, 73);
  assert.equal(result.daytimeLowest, 58);
  assert.equal(result.points, 180);
});

test('heartRateSummary averages range rows in multi-day mode', () => {
  const range = { isSingleDay: false };
  const result = heartRateSummary(
    range,
    {},
    {
      sleepModel: [
        { avgHeartRate: 58, lowestHeartRate: 50, highestHeartRate: 74 },
        { avgHeartRate: 60, lowestHeartRate: 52, highestHeartRate: 78 }
      ],
      daytimeHeartRate: [{ min: 60 }, { min: 62 }],
      derivedNightlyVitals: [{ hrv_rmssd_proxy_ms: 20, rhr_night_bpm: 50 }, { hrv_rmssd_proxy_ms: 24, rhr_night_bpm: 52 }],
      heartRate: [{ pointCount: 1 }, { pointCount: 1 }, { pointCount: 1 }]
    }
  );
  assert.equal(result.overnightAvg, 59);
  assert.equal(result.overnightMin, 51);
  assert.equal(result.overnightMax, 76);
  assert.equal(result.daytimeLowest, 61);
  assert.equal(result.recoveryProxy, 22);
  assert.equal(result.points, 3);
});
