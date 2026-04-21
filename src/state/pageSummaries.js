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
  const selectedDailyRow = isSingleDay
    ? (stressRows.find((row) => row?.date === range?.end) || null)
    : null;

  const daytimeForSelectedDay = (daytimeRows || []).filter((row) => row?.date === range?.end);
  const stressDaytimeValues = daytimeForSelectedDay
    .map((row) => Number(row?.score))
    .filter((value) => Number.isFinite(value));
  const recoveryDaytimeValues = daytimeForSelectedDay
    .map((row) => Number(row?.recoveryValue))
    .filter((value) => Number.isFinite(value));
  const daytimePeak = stressDaytimeValues.length ? Math.max(...stressDaytimeValues) : null;
  const daytimeAvg = stressDaytimeValues.length ? stressDaytimeValues.reduce((sum, value) => sum + value, 0) / stressDaytimeValues.length : null;
  const daytimePeakByDate = new Map();
  for (const row of daytimeRows || []) {
    const date = row?.date;
    const value = Number(row?.score);
    if (!date || !Number.isFinite(value)) continue;
    daytimePeakByDate.set(date, Math.max(daytimePeakByDate.get(date) ?? Number.NEGATIVE_INFINITY, value));
  }
  const daytimeDailyPeaks = [...daytimePeakByDate.values()].filter((value) => Number.isFinite(value));

  const stressScore = isSingleDay ? (day?.dailyStress?.score ?? selectedDailyRow?.score ?? daytimeAvg) : average(stressRows, 'score');
  const highStress = isSingleDay ? (day?.dailyStress?.high ?? selectedDailyRow?.high) : average(stressRows, 'high');
  const recoveryTime = isSingleDay ? (day?.dailyStress?.recovery ?? selectedDailyRow?.recovery) : average(stressRows, 'recovery');
  const daySummaryCounts = new Map();
  for (const row of stressRows) {
    const key = String(row?.daySummary || '').trim().toLowerCase();
    if (!key) continue;
    daySummaryCounts.set(key, (daySummaryCounts.get(key) || 0) + 1);
  }
  const summaryDistribution = [...daySummaryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([summary, count]) => ({ summary, count }));

  return {
    stressScore,
    highStress,
    recoveryTime,
    daytimePeak: isSingleDay ? daytimePeak : (daytimeDailyPeaks.length ? daytimeDailyPeaks.reduce((sum, value) => sum + value, 0) / daytimeDailyPeaks.length : null),
    daytimeAvg: isSingleDay ? daytimeAvg : average(daytimeRows, 'score'),
    recoveryDaytimeAvg: isSingleDay
      ? (recoveryDaytimeValues.length ? recoveryDaytimeValues.reduce((sum, value) => sum + value, 0) / recoveryDaytimeValues.length : null)
      : average(daytimeRows, 'recoveryValue'),
    overnightProxy: isSingleDay ? day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms : average(vitalsRows, 'hrv_rmssd_proxy_ms'),
    restingHr: isSingleDay ? day?.derivedNightlyVitals?.rhr_night_bpm : average(vitalsRows, 'rhr_night_bpm'),
    daytimePoints: isSingleDay ? Math.max(stressDaytimeValues.length, recoveryDaytimeValues.length) : (daytimeRows || []).length,
    stressDays: isSingleDay ? (selectedDailyRow ? 1 : 0) : stressRows.length,
    daySummary: day?.dailyStress?.daySummary || selectedDailyRow?.daySummary || null,
    summaryDistribution
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
        recoveryValue: Number(row?.recoveryValue),
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

function mean(values = []) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values = [], avg = mean(values)) {
  if (!values.length || !Number.isFinite(avg)) return null;
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function zScore(current, baseMean, baseStd) {
  if (!Number.isFinite(current) || !Number.isFinite(baseMean) || !Number.isFinite(baseStd)) return null;
  if (baseStd < 0.5) return (current - baseMean) / 0.5;
  return (current - baseMean) / baseStd;
}

function uniqueDates(rows = [], key = 'date') {
  return [...new Set((rows || []).map((row) => row?.[key]).filter(Boolean))].sort();
}

function lastWindowValues(rows = [], date, pickValue, baselineDays = 28) {
  return (rows || [])
    .filter((row) => row?.date && row.date < date)
    .slice(-baselineDays)
    .map((row) => Number(pickValue(row)))
    .filter((value) => Number.isFinite(value));
}

const STRAIN_STATES = {
  none: { key: 'no-signs', label: 'No signs', level: 0 },
  minor: { key: 'minor-signs', label: 'Minor signs', level: 1 },
  major: { key: 'major-signs', label: 'Major signs', level: 2 },
  insufficient: { key: 'insufficient-history', label: 'Not enough history yet', level: null }
};

function strainStateFromScore(totalScore, signalCount, evaluableSignals) {
  if (evaluableSignals < 3) return STRAIN_STATES.insufficient;
  if (totalScore >= 5 && signalCount >= 3) return STRAIN_STATES.major;
  if (totalScore >= 2 && signalCount >= 2) return STRAIN_STATES.minor;
  return STRAIN_STATES.none;
}

function buildBaseline(rows = [], date, extractor, baselineDays = 28) {
  const values = lastWindowValues(rows, date, extractor, baselineDays);
  if (values.length < 14) return null;
  const avg = mean(values);
  const std = stdDev(values, avg);
  if (!Number.isFinite(avg) || !Number.isFinite(std)) return null;
  return { avg, std };
}

function evaluateStrainForDate(date, allRows = {}) {
  const signals = [];
  const rows = allRows;
  const dailyReadinessRow = (rows.dailyReadiness || []).find((row) => row?.date === date) || null;
  const dailySleepRow = (rows.dailySleep || []).find((row) => row?.date === date) || null;
  const dailyStressRow = (rows.dailyStress || []).find((row) => row?.date === date) || null;
  const nightlyRow = (rows.derivedNightlyVitals || []).find((row) => row?.date === date) || null;
  const sleepModelRow = (rows.sleepModel || []).find((row) => row?.date === date) || null;

  const defs = [
    { key: 'rhr', label: 'Night resting HR', rows: rows.derivedNightlyVitals, current: Number(nightlyRow?.rhr_night_bpm), extractor: (row) => row?.rhr_night_bpm, direction: 'up' },
    { key: 'hrv', label: 'Night HRV proxy', rows: rows.derivedNightlyVitals, current: Number(nightlyRow?.hrv_rmssd_proxy_ms), extractor: (row) => row?.hrv_rmssd_proxy_ms, direction: 'down' },
    { key: 'resp', label: 'Respiratory rate', rows: rows.sleepModel, current: Number(sleepModelRow?.avgBreath), extractor: (row) => row?.avgBreath, direction: 'up' },
    { key: 'temp', label: 'Temperature deviation', rows: rows.dailyReadiness, current: Math.abs(Number(dailyReadinessRow?.temperatureDeviation)), extractor: (row) => Math.abs(Number(row?.temperatureDeviation)), direction: 'up' },
    { key: 'sleep', label: 'Sleep score', rows: rows.dailySleep, current: Number(dailySleepRow?.score), extractor: (row) => row?.score, direction: 'down' },
    { key: 'readiness', label: 'Readiness score', rows: rows.dailyReadiness, current: Number(dailyReadinessRow?.score), extractor: (row) => row?.score, direction: 'down' },
    { key: 'stressHigh', label: 'High stress time', rows: rows.dailyStress, current: Number(dailyStressRow?.high), extractor: (row) => row?.high, direction: 'up' }
  ];

  let totalScore = 0;
  let signalCount = 0;
  let evaluableSignals = 0;

  for (const def of defs) {
    const baseline = buildBaseline(def.rows || [], date, def.extractor);
    if (!baseline || !Number.isFinite(def.current)) continue;
    evaluableSignals += 1;
    const z = zScore(def.current, baseline.avg, baseline.std);
    if (!Number.isFinite(z)) continue;
    const directional = def.direction === 'down' ? -z : z;
    let weight = 0;
    if (directional >= 1.8) weight = 2;
    else if (directional >= 1.0) weight = 1;
    if (!weight) continue;
    totalScore += weight;
    signalCount += 1;
    signals.push({
      label: def.label,
      current: def.current,
      baseline: baseline.avg,
      z: directional
    });
  }

  const state = strainStateFromScore(totalScore, signalCount, evaluableSignals);
  const drivers = signals.sort((a, b) => b.z - a.z).slice(0, 4);
  return { date, state, drivers, totalScore, signalCount, evaluableSignals };
}

export function strainSummary(range, rangeRows = {}, allRows = {}) {
  const combinedRows = {
    dailyReadiness: allRows.dailyReadiness || rangeRows.dailyReadiness || [],
    dailySleep: allRows.dailySleep || rangeRows.dailySleep || [],
    dailyStress: allRows.dailyStress || rangeRows.dailyStress || [],
    derivedNightlyVitals: allRows.derivedNightlyVitals || rangeRows.derivedNightlyVitals || [],
    sleepModel: allRows.sleepModel || rangeRows.sleepModel || []
  };
  const targetDates = uniqueDates([
    ...(rangeRows.dailyReadiness || []),
    ...(rangeRows.dailySleep || []),
    ...(rangeRows.dailyStress || []),
    ...(rangeRows.derivedNightlyVitals || []),
    ...(rangeRows.sleepModel || [])
  ]);
  if (range?.start && range?.end && !targetDates.length) targetDates.push(range.end);
  const days = targetDates.map((date) => evaluateStrainForDate(date, combinedRows));
  const evaluableDays = days.filter((row) => row.state.level != null);
  const dominant = (() => {
    if (!days.length) return STRAIN_STATES.insufficient;
    if (!evaluableDays.length) return STRAIN_STATES.insufficient;
    const avgLevel = evaluableDays.reduce((sum, row) => sum + row.state.level, 0) / evaluableDays.length;
    if (avgLevel >= 1.5) return STRAIN_STATES.major;
    if (avgLevel >= 0.5) return STRAIN_STATES.minor;
    return STRAIN_STATES.none;
  })();
  const current = range?.isSingleDay
    ? (days.find((row) => row.date === range.end)?.state || STRAIN_STATES.insufficient)
    : dominant;
  const driverSource = range?.isSingleDay
    ? (days.find((row) => row.date === range.end)?.drivers || [])
    : days.flatMap((row) => row.drivers || []).sort((a, b) => b.z - a.z).slice(0, 4);

  return {
    state: current,
    trendStates: days.map((row) => ({ date: row.date, label: row.state.label, level: row.state.level })),
    drivers: driverSource,
    hasMeaningfulSignal: current.level != null && current.level > 0
  };
}
