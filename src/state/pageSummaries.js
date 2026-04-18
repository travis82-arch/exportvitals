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
