function average(rows, key) {
  const values = (rows || [])
    .map((row) => Number(row?.[key]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sumRows(rows, key) {
  return (rows || [])
    .map((row) => Number(row?.[key]))
    .filter((value) => Number.isFinite(value))
    .reduce((sum, value) => sum + value, 0);
}

export function activitySummary(range, day, rangeRows = {}) {
  const activityRows = rangeRows.dailyActivity || [];
  const isSingleDay = Boolean(range?.isSingleDay);
  const sourceScore = isSingleDay ? day?.dailyActivity?.score : average(activityRows, 'score');
  const sourceSteps = isSingleDay ? day?.dailyActivity?.steps : average(activityRows, 'steps');
  const sourceTotalBurn = isSingleDay ? day?.dailyActivity?.totalCalories : average(activityRows, 'totalCalories');
  const sourceActiveBurn = isSingleDay ? day?.dailyActivity?.activeCalories : average(activityRows, 'activeCalories');
  const sourceAlerts = isSingleDay ? day?.dailyActivity?.inactivityAlerts : average(activityRows, 'inactivityAlerts');
  const sourceActivitySeconds = isSingleDay
    ? (Number(day?.dailyActivity?.mediumActivityTime) || 0) + (Number(day?.dailyActivity?.highActivityTime) || 0)
    : average(
        activityRows.map((row) => ({
          totalActivitySec: (Number(row?.mediumActivityTime) || 0) + (Number(row?.highActivityTime) || 0)
        })),
        'totalActivitySec'
      );

  return {
    score: sourceScore,
    steps: sourceSteps,
    totalBurn: sourceTotalBurn,
    activeBurn: sourceActiveBurn,
    inactivityAlerts: sourceAlerts,
    activitySeconds: sourceActivitySeconds,
    activityDays: activityRows.length,
    workoutCount: (rangeRows.workout || []).length,
    sessionCount: (rangeRows.session || []).length,
    totalRangeSteps: sumRows(activityRows, 'steps')
  };
}

export function heartRateSummary(range, day, rangeRows = {}) {
  const sleepModelRows = rangeRows.sleepModel || [];
  const vitalsRows = rangeRows.derivedNightlyVitals || [];
  const isSingleDay = Boolean(range?.isSingleDay);
  const overnightAvg = isSingleDay ? day?.heartRateWindowSummary?.avg : average(sleepModelRows, 'avgHeartRate');
  const overnightMin = isSingleDay ? day?.heartRateWindowSummary?.min : average(sleepModelRows, 'lowestHeartRate');
  const overnightMax = isSingleDay ? day?.heartRateWindowSummary?.max : average(sleepModelRows, 'highestHeartRate');
  const daytimeLowest = isSingleDay ? day?.daytimeHeartRateSummary?.min : average(rangeRows.daytimeHeartRate || [], 'min');

  return {
    overnightAvg,
    overnightMin,
    overnightMax,
    daytimeLowest,
    recoveryProxy: isSingleDay ? day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms : average(vitalsRows, 'hrv_rmssd_proxy_ms'),
    restingHr: isSingleDay ? day?.derivedNightlyVitals?.rhr_night_bpm : average(vitalsRows, 'rhr_night_bpm'),
    points: isSingleDay ? day?.heartRateWindowSummary?.points : sumRows(rangeRows.heartRate || [], 'pointCount'),
    nightlyRows: sleepModelRows.length
  };
}

export function stressSummary(range, day, rangeRows = {}) {
  const stressRows = rangeRows.dailyStress || [];
  const daytimeRows = rangeRows.daytimeStress || [];
  const vitalsRows = rangeRows.derivedNightlyVitals || [];
  const isSingleDay = Boolean(range?.isSingleDay);

  const daytimeForSelectedDay = (daytimeRows || []).filter((row) => row?.date === range?.end);
  const daytimeValues = daytimeForSelectedDay
    .map((row) => Number(row?.score))
    .filter((value) => Number.isFinite(value));
  const daytimePeak = daytimeValues.length ? Math.max(...daytimeValues) : null;
  const daytimeAvg = daytimeValues.length ? daytimeValues.reduce((sum, value) => sum + value, 0) / daytimeValues.length : null;
  const daytimePeakByDate = new Map();
  for (const row of daytimeRows || []) {
    const date = row?.date;
    const value = Number(row?.score);
    if (!date || !Number.isFinite(value)) continue;
    daytimePeakByDate.set(date, Math.max(daytimePeakByDate.get(date) ?? Number.NEGATIVE_INFINITY, value));
  }
  const daytimeDailyPeaks = [...daytimePeakByDate.values()].filter((value) => Number.isFinite(value));

  const stressScore = isSingleDay ? (day?.dailyStress?.score ?? daytimeAvg) : average(stressRows, 'score');
  const highStress = isSingleDay ? day?.dailyStress?.high : average(stressRows, 'high');
  const recoveryTime = isSingleDay ? day?.dailyStress?.recovery : average(stressRows, 'recovery');

  return {
    stressScore,
    highStress,
    recoveryTime,
    daytimePeak: isSingleDay ? daytimePeak : (daytimeDailyPeaks.length ? daytimeDailyPeaks.reduce((sum, value) => sum + value, 0) / daytimeDailyPeaks.length : null),
    daytimeAvg: isSingleDay ? daytimeAvg : average(daytimeRows, 'score'),
    overnightProxy: isSingleDay ? day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms : average(vitalsRows, 'hrv_rmssd_proxy_ms'),
    restingHr: isSingleDay ? day?.derivedNightlyVitals?.rhr_night_bpm : average(vitalsRows, 'rhr_night_bpm'),
    daytimePoints: isSingleDay ? daytimeValues.length : (daytimeRows || []).length,
    stressDays: stressRows.length
  };
}

export function stressDailyBreakdownRows(rows = []) {
  const safe = (value) => {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };
  return (rows || [])
    .filter((row) => row?.date)
    .map((row) => ({
      date: row.date,
      stressedMinutes: safe(row?.high),
      engagedMinutes: safe(row?.medium),
      lowMinutes: safe(row?.low),
      restoredMinutes: safe(row?.recovery),
      peakScore: safe(row?.score)
    }));
}

export function stressDayTimelineRows(range, rangeRows = {}) {
  const selectedDate = range?.end || null;
  const rows = (rangeRows?.daytimeStress || []).filter((row) => row?.date === selectedDate);
  if (!rows.length) return [];
  return rows
    .map((row, index) => {
      const tMs = Number.isFinite(new Date(row?.timestamp).getTime())
        ? new Date(row.timestamp).getTime()
        : (selectedDate ? new Date(`${selectedDate}T00:00:00`).getTime() + index * 15 * 60 * 1000 : NaN);
      return {
        tMs,
        score: Number(row?.score),
        category: row?.category ? String(row.category) : null
      };
    })
    .filter((row) => Number.isFinite(row.tMs))
    .sort((a, b) => a.tMs - b.tMs);
}

export function stressCategorySeries(timelineRows = []) {
  const ordered = ['restored', 'relaxed', 'engaged', 'stressed', 'high', 'high stress'];
  const values = [...new Set((timelineRows || []).map((row) => String(row?.category || '').trim().toLowerCase()).filter(Boolean))];
  const categories = [...ordered.filter((name) => values.includes(name)), ...values.filter((name) => !ordered.includes(name))];
  const indexByCategory = new Map(categories.map((name, idx) => [name, idx]));
  const series = (timelineRows || [])
    .map((row) => {
      const key = String(row?.category || '').trim().toLowerCase();
      return {
        tMs: row.tMs,
        v: indexByCategory.has(key) ? indexByCategory.get(key) : null
      };
    })
    .filter((row) => Number.isFinite(row.tMs) && Number.isFinite(row.v));

  return {
    series,
    categories
  };
}
