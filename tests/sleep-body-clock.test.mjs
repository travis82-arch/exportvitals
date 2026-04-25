import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBodyClockOffset, selectPrimaryLongSleepByDay } from '../src/domain/sleepRecoveryModel.js';

function row({ date, type = 'long_sleep', start, end, totalSleepSec = 8 * 60 * 60, timeInBedSec = 8.5 * 60 * 60 }) {
  return {
    date,
    type,
    bedtimeStart: start,
    bedtimeEnd: end,
    totalSleepSec,
    timeInBedSec
  };
}

function buildBaselineRows(startDate = '2026-01-01', days = 20, startClock = '23:00:00', endClock = '07:00:00') {
  const rows = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    const nightDate = new Date(start.getTime() + i * 86400000);
    const wakeDate = new Date(nightDate.getTime() + 86400000);
    const date = nightDate.toISOString().slice(0, 10);
    rows.push(row({
      date,
      start: `${date}T${startClock}-05:00`,
      end: `${wakeDate.toISOString().slice(0, 10)}T${endClock}-05:00`
    }));
  }
  return rows;
}

test('primary sleep selection keeps only long_sleep, min duration, and longest per day', () => {
  const rows = [
    row({ date: '2026-02-01', start: '2026-02-01T22:10:00-05:00', end: '2026-02-02T03:10:00-05:00', totalSleepSec: 5 * 3600 }),
    row({ date: '2026-02-01', start: '2026-02-01T23:00:00-05:00', end: '2026-02-02T07:30:00-05:00', totalSleepSec: 8.5 * 3600 }),
    row({ date: '2026-02-01', type: 'nap', start: '2026-02-01T14:00:00-05:00', end: '2026-02-01T15:00:00-05:00', totalSleepSec: 3600 }),
    row({ date: '2026-02-02', start: '2026-02-02T23:30:00-05:00', end: '2026-02-03T01:30:00-05:00', totalSleepSec: 2 * 3600 })
  ];

  const primary = selectPrimaryLongSleepByDay(rows);
  assert.equal(primary.length, 1);
  assert.equal(primary[0].date, '2026-02-01');
  assert.equal(primary[0].totalSleepDurationSec, 8.5 * 3600);
});

test('midpoint calculation correctly handles overnight windows', () => {
  const rows = buildBaselineRows('2026-03-01', 14, '23:30:00', '07:30:00');
  const result = computeBodyClockOffset({
    selectedDate: '2026-03-14',
    rangeStartDate: '2026-03-14',
    rangeEndDate: '2026-03-14',
    sleepModelRows: rows
  });

  assert.equal(result.display.available, true);
  assert.equal(result.display.baselineMidpointClockMinutes, 510);
  assert.equal(result.display.selectedMidpointClockMinutes, 510);
});

test('range comparison reports earlier, later, and aligned direction', () => {
  const base = buildBaselineRows('2026-01-01', 20, '23:00:00', '07:00:00');
  const rows = [
    ...base,
    row({ date: '2026-01-21', start: '2026-01-21T22:20:00-05:00', end: '2026-01-22T06:20:00-05:00' }),
    row({ date: '2026-01-22', start: '2026-01-22T23:50:00-05:00', end: '2026-01-23T07:50:00-05:00' }),
    row({ date: '2026-01-23', start: '2026-01-23T00:30:00-05:00', end: '2026-01-23T08:30:00-05:00' })
  ];

  const earlier = computeBodyClockOffset({
    selectedDate: '2026-01-21',
    rangeStartDate: '2026-01-21',
    rangeEndDate: '2026-01-21',
    sleepModelRows: rows
  });
  assert.equal(earlier.display.offsetMinutes, -40);
  assert.match(earlier.display.narrative, /40 min earlier/);

  const aligned = computeBodyClockOffset({
    selectedDate: '2026-01-20',
    rangeStartDate: '2026-01-20',
    rangeEndDate: '2026-01-20',
    sleepModelRows: rows
  });
  assert.equal(aligned.display.offsetMinutes, 0);
  assert.match(aligned.display.narrative, /closely aligned/);

  const laterRange = computeBodyClockOffset({
    selectedDate: '2026-01-23',
    rangeStartDate: '2026-01-22',
    rangeEndDate: '2026-01-23',
    sleepModelRows: rows
  });
  assert.ok(laterRange.display.offsetMinutes > 30);
  assert.match(laterRange.display.narrative, /averaged .* later/);
});

test('fallback behavior returns clear message when insufficient primary long sleeps', () => {
  const rows = buildBaselineRows('2026-04-01', 10, '23:00:00', '07:00:00');
  const result = computeBodyClockOffset({
    selectedDate: '2026-04-10',
    rangeStartDate: '2026-04-10',
    rangeEndDate: '2026-04-10',
    sleepModelRows: rows
  });

  assert.equal(result.display.available, false);
  assert.match(result.display.emptyStateMessage, /More sleep history is needed/);
});

test('estimated chronotype label follows midpoint band mapping', () => {
  const rows = buildBaselineRows('2026-05-01', 14, '22:00:00', '06:00:00');
  const result = computeBodyClockOffset({
    selectedDate: '2026-05-14',
    rangeStartDate: '2026-05-14',
    rangeEndDate: '2026-05-14',
    sleepModelRows: rows
  });

  assert.equal(result.display.available, true);
  assert.equal(result.display.estimatedChronotype, 'Late evening');
});
