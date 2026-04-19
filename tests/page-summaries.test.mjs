import test from 'node:test';
import assert from 'node:assert/strict';
import { activitySummary, heartRateSummary, stressSummary, stressDailyBreakdownRows, stressDayTimelineRows, stressCategorySeries } from '../src/state/pageSummaries.js';

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

test('stressSummary uses real selected-day stress and daytime rows', () => {
  const range = { isSingleDay: true, end: '2026-08-21' };
  const day = {
    dailyStress: { score: 71, high: 110, recovery: 48, daySummary: 'normal' },
    derivedNightlyVitals: { hrv_rmssd_proxy_ms: 24.4, rhr_night_bpm: 51 }
  };
  const rangeRows = {
    dailyStress: [{ date: '2026-08-21', score: 71, high: 110, recovery: 48, daySummary: 'normal' }],
    daytimeStress: [
      { date: '2026-08-21', timestamp: '2026-08-21T09:00:00Z', score: 33, recoveryValue: 40 },
      { date: '2026-08-21', timestamp: '2026-08-21T15:00:00Z', score: 89, recoveryValue: 35 }
    ],
    derivedNightlyVitals: [{ date: '2026-08-21', hrv_rmssd_proxy_ms: 24.4, rhr_night_bpm: 51 }]
  };
  const result = stressSummary(range, day, rangeRows);
  assert.equal(result.stressScore, 71);
  assert.equal(result.highStress, 110);
  assert.equal(result.recoveryTime, 48);
  assert.equal(result.daytimePeak, 89);
  assert.equal(result.recoveryDaytimeAvg, 37.5);
  assert.equal(result.daytimePoints, 2);
  assert.equal(result.overnightProxy, 24.4);
  assert.equal(result.daySummary, 'normal');
});

test('stressSummary averages multi-day stress rows in range mode', () => {
  const range = { isSingleDay: false };
  const result = stressSummary(range, {}, {
    dailyStress: [
      { date: '2026-08-20', score: 65, high: 95, recovery: 60, daySummary: 'normal' },
      { date: '2026-08-21', score: 75, high: 125, recovery: 42, daySummary: 'normal' }
    ],
    daytimeStress: [{ date: '2026-08-20', score: 52, recoveryValue: 40 }, { date: '2026-08-21', score: 68, recoveryValue: 32 }],
    derivedNightlyVitals: [{ hrv_rmssd_proxy_ms: 20, rhr_night_bpm: 53 }, { hrv_rmssd_proxy_ms: 28, rhr_night_bpm: 49 }]
  });
  assert.equal(result.stressScore, 70);
  assert.equal(result.highStress, 110);
  assert.equal(result.recoveryTime, 51);
  assert.equal(result.daytimePeak, 60);
  assert.equal(result.restingHr, 51);
  assert.equal(result.recoveryDaytimeAvg, 36);
  assert.deepEqual(result.summaryDistribution, [{ summary: 'normal', count: 2 }]);
});

test('stressSummary falls back to daytime average when single-day daily score is missing', () => {
  const range = { isSingleDay: true, end: '2026-08-21' };
  const result = stressSummary(range, { dailyStress: { score: null } }, {
    dailyStress: [],
    daytimeStress: [
      { date: '2026-08-21', score: 30 },
      { date: '2026-08-21', score: 60 }
    ],
    derivedNightlyVitals: []
  });
  assert.equal(result.stressScore, 45);
  assert.equal(result.daytimePeak, 60);
});

test('stressSummary uses selected dailyStress row when selected-day object is incomplete', () => {
  const range = { isSingleDay: true, end: '2026-08-21' };
  const result = stressSummary(range, { dailyStress: { score: null } }, {
    dailyStress: [{ date: '2026-08-21', score: 68, high: 124, recovery: 41, daySummary: 'stressed' }],
    daytimeStress: [{ date: '2026-08-21', score: 50 }],
    derivedNightlyVitals: []
  });
  assert.equal(result.stressScore, 68);
  assert.equal(result.highStress, 124);
  assert.equal(result.recoveryTime, 41);
  assert.equal(result.daySummary, 'stressed');
  assert.equal(result.stressDays, 1);
});

test('stressSummary uses per-day daytime peaks in multi-day mode', () => {
  const range = { isSingleDay: false };
  const result = stressSummary(range, {}, {
    dailyStress: [{ date: '2026-08-20', score: 70 }],
    daytimeStress: [
      { date: '2026-08-20', score: 20 },
      { date: '2026-08-20', score: 80 },
      { date: '2026-08-21', score: 40 },
      { date: '2026-08-21', score: 60 }
    ],
    derivedNightlyVitals: []
  });
  assert.equal(result.daytimePeak, 70);
});

test('stress timeline/category helpers support categorical daytime rows', () => {
  const range = { end: '2026-08-21' };
  const timeline = stressDayTimelineRows(range, {
    daytimeStress: [
      { date: '2026-08-21', timestamp: '2026-08-21T08:00:00Z', category: 'Restored', recoveryValue: 55 },
      { date: '2026-08-21', timestamp: '2026-08-21T10:00:00Z', category: 'Engaged', score: 42 },
      { date: '2026-08-21', timestamp: '2026-08-21T12:00:00Z', category: 'Stress', score: 81 }
    ]
  });
  assert.equal(timeline.length, 3);
  assert.equal(timeline[0].recoveryValue, 55);
  const categorySeries = stressCategorySeries(timeline);
  assert.equal(categorySeries.series.length, 3);
  assert.deepEqual(categorySeries.categories, ['restored', 'engaged', 'stress']);
});

test('stressDailyBreakdownRows normalizes minute fields and keeps nulls explicit', () => {
  const rows = stressDailyBreakdownRows([{ date: '2026-08-21', high: 123, medium: null, low: 18, recovery: 42, score: 71 }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stressedMinutes, 123);
  assert.equal(rows[0].engagedMinutes, null);
  assert.equal(rows[0].restoredMinutes, 42);
  assert.equal(rows[0].peakScore, 71);
});
