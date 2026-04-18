import { renderTopNav } from './components/TopNav.js';
import { renderDateRangeControl } from './components/DateRangeControl.js';
import {
  hydrateFromPersistence,
  getAvailableDates,
  getDay,
  getRange,
  getStoreSnapshot,
  subscribeToStore,
  parseSeriesJson,
  seriesToPoints,
  decodeStages
} from './store/dataStore.js';
import { loadSettings } from './state/settings.js';
import { loadSelectedRange, persistSelectedRange, resolveSelectedRange, summarizeRange } from './state/selectedRange.js';
import { runSettingsUploadImport } from './state/importFlow.js';
import { installRuntimeDiagnostics } from './state/runtimeDiagnostics.js';
import { shouldRenderDateRangeForPage, shouldRenderIntroBanner } from './state/pageConfig.js';
import { hasPurgedReloadFlag, purgeStaleServiceWorkersAndCaches, setPurgedReloadFlag } from './boot/swPurge.js';
import { renderAxisLineChart } from './charts/AxisLineChart.js';
import { renderAxisBarChart } from './charts/AxisBarChart.js';
import { renderSleepStageChart } from './charts/SleepStageChart.js';
import { activitySummary, heartRateSummary, stressSummary, stressDailyBreakdownRows, stressDayTimelineRows, stressCategorySeries } from './state/pageSummaries.js';

const page = document.body.dataset.page || 'index';
const settings = loadSettings();

const PAGE_META = {
  index: {
    title: 'Home',
    subtitle: 'Daily and multi-day snapshot across Readiness, Sleep, Activity, Heart Rate, and Stress.'
  },
  readiness: { title: 'Readiness', subtitle: 'Recovery readiness summary for the selected period.' },
  sleep: { title: 'Sleep', subtitle: 'Sleep quality and overnight recovery signals.' },
  activity: { title: 'Activity', subtitle: 'Movement load and consistency across the selected period.' },
  'heart-rate': { title: 'Heart Rate', subtitle: 'Overnight heart rate and variability trends.' },
  stress: { title: 'Stress', subtitle: 'Daily stress and recovery balance across the selected period.' },
  settings: { title: 'Settings', subtitle: 'Upload, My Health overview, and debug tools.' }
};

const DOMAIN_ORDER = ['readiness', 'sleep', 'activity', 'heart-rate', 'stress'];

const SCORE_FIELDS = {
  readiness: ['dailyReadiness', 'score'],
  sleep: ['dailySleep', 'score'],
  activity: ['dailyActivity', 'score']
};

const CONTRIBUTOR_LABELS = {
  readiness: {
    resting_heart_rate: 'Resting heart rate',
    hrv_balance: 'HRV balance',
    body_temperature: 'Body temperature',
    recovery_index: 'Recovery index',
    sleep: 'Sleep',
    previous_night: 'Sleep',
    sleep_balance: 'Sleep balance',
    sleep_regularity: 'Sleep regularity',
    previous_day_activity: 'Previous day activity',
    activity_balance: 'Activity balance'
  },
  sleep: {
    total_sleep: 'Total sleep',
    efficiency: 'Efficiency',
    restfulness: 'Restfulness',
    rem_sleep: 'REM sleep',
    deep_sleep: 'Deep sleep',
    latency: 'Latency',
    timing: 'Timing'
  }
};

function average(rows, key) {
  const values = (rows || []).map((row) => row?.[key]).filter((value) => Number.isFinite(Number(value))).map(Number);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fmt(value, digits = 0, suffix = '') {
  if (!Number.isFinite(Number(value))) return '<span class="placeholder">No data</span>';
  return `${Number(value).toFixed(digits)}${suffix}`;
}

function emptyRangeRows() {
  return {
    dailySleep: [],
    dailyReadiness: [],
    dailyActivity: [],
    dailyStress: [],
    daytimeStress: [],
    derivedNightlyVitals: [],
    sleepModel: [],
    dailySpo2: [],
    workout: [],
    session: [],
    heartRate: [],
    daytimeHeartRate: []
  };
}

function fmtDurationSeconds(sec, compact = false) {
  if (!Number.isFinite(Number(sec))) return '<span class="placeholder">Unavailable</span>';
  const totalMin = Math.round(Number(sec) / 60);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  if (compact) return `${hours}h ${minutes}m`;
  if (!hours) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

function fmtSigned(value, digits = 1, suffix = '') {
  if (!Number.isFinite(Number(value))) return '<span class="placeholder">Unavailable</span>';
  const num = Number(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(digits)}${suffix}`;
}

function fmtMinutes(value) {
  if (!Number.isFinite(Number(value))) return '<span class="placeholder">Unavailable</span>';
  return `${Math.round(Number(value))} min`;
}

function scoreStatus(score, domain = 'default') {
  if (!Number.isFinite(Number(score))) return 'Unavailable';
  const value = Number(score);
  const thresholds = domain === 'sleep'
    ? [85, 70, 60]
    : [85, 70, 60];
  if (value >= thresholds[0]) return 'Optimal';
  if (value >= thresholds[1]) return 'Good';
  if (value >= thresholds[2]) return 'Fair';
  return 'Pay attention';
}

function hideBootShell() {
  const bootShell = document.getElementById('bootShell');
  if (bootShell) bootShell.style.display = 'none';
}

function metricDomainSummary(domain, range, day, rangeRows) {
  if (domain === 'heart-rate') {
    const value = range.isSingleDay ? day?.heartRateWindowSummary?.avg : average(rangeRows.derivedNightlyVitals, 'rhr_night_bpm');
    return {
      domain,
      title: 'Heart Rate',
      value: fmt(value, 1, ' bpm'),
      sub: range.isSingleDay ? 'Overnight avg' : 'Average resting HR'
    };
  }

  if (domain === 'stress') {
    const summary = stressSummary(range, day, rangeRows);
    return {
      domain,
      title: 'Stress',
      value: fmt(summary.stressScore),
      sub: range.isSingleDay ? 'Daily stress score' : 'Average stress score'
    };
  }

  const [dataset, key] = SCORE_FIELDS[domain] || [];
  const source = dataset ? rangeRows[dataset] : [];
  const value = range.isSingleDay ? day?.[dataset]?.[key] : average(source, key);

  return {
    domain,
    title: PAGE_META[domain]?.title || domain,
    value: fmt(value),
    sub: range.isSingleDay ? 'Current' : 'Average'
  };
}

function renderHeroCard({ eyebrow = '', title = '', value = '', status = '', detail = '', extra = '' }) {
  return `
    <section class="card hero-card">
      <div class="hero-top">
        <p class="eyebrow">${eyebrow}</p>
        <span class="status-pill">${status}</span>
      </div>
      <h2>${title}</h2>
      <div class="hero-value">${value}</div>
      <p class="muted">${detail}</p>
      ${extra ? `<div class="hero-extra">${extra}</div>` : ''}
    </section>
  `;
}

function renderMetricGrid(items) {
  return `<div class="metric-grid">${items
    .map(
      (item) => `<article class="metric-card"><div class="metric-label">${item.label}</div><div class="metric-value">${item.value}</div>${item.note ? `<div class="metric-note">${item.note}</div>` : ''}</article>`
    )
    .join('')}</div>`;
}

function renderContributorRows(rows) {
  if (!rows.length) return '<div class="placeholder">No contributor data available for this range.</div>';
  return `<div class="contributor-list">${rows
    .map((row) => {
      const raw = Number(row.score);
      const pct = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
      const valueText = row.valueText || (Number.isFinite(raw) ? `${Math.round(raw)}` : '<span class="placeholder">Unavailable</span>');
      return `<div class="contributor-row">
        <div class="row split-row"><span>${row.label}</span><strong>${valueText}</strong></div>
        <div class="small muted">${row.note || ''}</div>
        <div class="progress"><span style="width:${pct}%"></span></div>
      </div>`;
    })
    .join('')}</div>`;
}

function summarizeContributors(rows, labels = {}) {
  const totals = new Map();
  const counts = new Map();

  for (const row of rows || []) {
    const obj = row?.contributors;
    if (!obj || typeof obj !== 'object') continue;
    Object.entries(obj).forEach(([key, raw]) => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return;
      totals.set(key, (totals.get(key) || 0) + value);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  }

  return [...totals.entries()]
    .map(([key, total]) => {
      const avg = total / (counts.get(key) || 1);
      return {
        key,
        label: labels[key] || key,
        score: avg,
        valueText: `${Math.round(avg)}`,
        note: scoreStatus(avg)
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildDailyLine(rows, field) {
  return (rows || [])
    .filter((row) => row?.date && Number.isFinite(Number(row?.[field])))
    .map((row) => ({ tMs: new Date(`${row.date}T12:00:00`).getTime(), v: Number(row[field]) }))
    .filter((point) => Number.isFinite(point.tMs));
}

function renderDualStressDailyChart({ title, stressSeries = [], recoverySeries = [] }) {
  const stressByTime = new Map((stressSeries || []).filter((p) => Number.isFinite(p?.tMs) && Number.isFinite(Number(p?.v))).map((p) => [p.tMs, Number(p.v)]));
  const recoveryByTime = new Map((recoverySeries || []).filter((p) => Number.isFinite(p?.tMs) && Number.isFinite(Number(p?.v))).map((p) => [p.tMs, Number(p.v)]));
  const allTimes = [...new Set([...stressByTime.keys(), ...recoveryByTime.keys()])].sort((a, b) => a - b);
  if (!allTimes.length) return '<div class="placeholder">No daily stress trend is available for this range.</div>';
  const allValues = [...stressByTime.values(), ...recoveryByTime.values()].filter((v) => Number.isFinite(v));
  if (!allValues.length) return '<div class="placeholder">No daily stress trend is available for this range.</div>';

  const m = { l: 34, r: 8, t: 12, b: 20 };
  const w = 360;
  const h = 120;
  const plotW = w - m.l - m.r;
  const plotH = h - m.t - m.b;
  const xPos = (t) => m.l + ((t - allTimes[0]) / Math.max(allTimes.at(-1) - allTimes[0], 1)) * plotW;
  const yMax = Math.max(...allValues);
  const yPos = (v) => m.t + (1 - Number(v) / Math.max(yMax, 1)) * plotH;
  const barW = Math.max(4, plotW / Math.max(allTimes.length, 1) * 0.42);
  const dateLabel = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });

  const stressLinePoints = allTimes
    .filter((t) => stressByTime.has(t))
    .map((t) => `${xPos(t)},${yPos(stressByTime.get(t))}`)
    .join(' ');

  return `<section class="chart-card"><div class="kpi-label">${title}</div>
    <svg class="axis-chart" viewBox="0 0 ${w} ${h}" style="height:190px">
      <line x1="${m.l}" y1="${h - m.b}" x2="${w - m.r}" y2="${h - m.b}" class="axis-line"></line>
      <line x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${h - m.b}" class="axis-line"></line>
      ${allTimes
        .map((t) => {
          const rv = recoveryByTime.get(t);
          if (!Number.isFinite(rv)) return '';
          const x = xPos(t) - barW / 2;
          const y = yPos(rv);
          return `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1, h - m.b - y)}" fill="var(--chart-bar)"></rect>`;
        })
        .join('')}
      ${stressLinePoints ? `<polyline fill="none" stroke="var(--accent-2)" stroke-width="1.8" points="${stressLinePoints}"></polyline>` : ''}
      ${allTimes
        .filter((t) => stressByTime.has(t))
        .map((t) => `<circle cx="${xPos(t)}" cy="${yPos(stressByTime.get(t))}" r="1.8" fill="var(--accent-2)"></circle>`)
        .join('')}
      <text x="${m.l}" y="${h - 6}" class="tick">${dateLabel(allTimes[0])}</text>
      <text x="${m.l + plotW / 2}" y="${h - 6}" text-anchor="middle" class="tick">${dateLabel(allTimes[Math.floor(allTimes.length / 2)])}</text>
      <text x="${w - m.r}" y="${h - 6}" text-anchor="end" class="tick">${dateLabel(allTimes.at(-1))}</text>
    </svg>
    <div class="small muted">Line: high stress minutes · Bars: restored minutes.</div>
  </section>`;
}

function buildDailyActivitySeconds(rows) {
  return (rows || [])
    .filter((row) => row?.date)
    .map((row) => {
      const totalSec = (Number(row?.lowActivityTime) || 0) + (Number(row?.mediumActivityTime) || 0) + (Number(row?.highActivityTime) || 0);
      return { tMs: new Date(`${row.date}T12:00:00`).getTime(), v: Math.round(totalSec / 60) };
    })
    .filter((point) => Number.isFinite(point.tMs));
}

function aggregateActivities(day, rangeRows, limit = 18) {
  const raw = day?.activities?.length
    ? day.activities
    : [...(rangeRows.workout || []), ...(rangeRows.session || [])];
  return raw
    .map((item) => ({
      ...item,
      sortMs: new Date(item.startTime || `${item.date}T00:00:00`).getTime()
    }))
    .sort((a, b) => b.sortMs - a.sortMs)
    .slice(0, limit);
}

function renderActivitiesList(activities, isSingleDay) {
  if (!activities.length) return '<div class="placeholder">No activity sessions are available for the selected range.</div>';
  return `<div class="activity-list">${activities
    .map((activity) => `<article class="activity-item">
      <div class="row split-row">
        <strong>${activity.type || 'Activity'}</strong>
        <span class="small muted">${activity.source || 'dataset'}</span>
      </div>
      <div class="small muted">
        ${activity.startTime ? new Date(activity.startTime).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : activity.date}
        ${isSingleDay ? '' : ` · ${activity.date}`}
      </div>
      <div class="row">
        <span class="small">Duration: ${Number.isFinite(Number(activity.durationSec)) ? fmtDurationSeconds(activity.durationSec, true) : '<span class="placeholder">Unavailable</span>'}</span>
        <span class="small">Calories: ${Number.isFinite(Number(activity.calories)) ? `${Math.round(Number(activity.calories))} cal` : '<span class="placeholder">Unavailable</span>'}</span>
        <span class="small">Avg HR: ${Number.isFinite(Number(activity.avgHr)) ? `${Math.round(Number(activity.avgHr))} bpm` : '<span class="placeholder">Unavailable</span>'}</span>
      </div>
    </article>`)
    .join('')}</div>`;
}

function contributorFromRange(rangeRows, singleRow, keys, { label, formatter = (value) => `${Math.round(value)}`, note = '' }) {
  if (singleRow && rangeRows?.isSingleDay) {
    for (const key of keys) {
      const val = Number(singleRow?.contributors?.[key]);
      if (Number.isFinite(val)) return { label, score: val, valueText: formatter(val), note: note || scoreStatus(val) };
    }
    return { label, score: null, valueText: '<span class="placeholder">Unavailable</span>', note: 'Not present in this export' };
  }
  let sum = 0;
  let count = 0;
  for (const row of rangeRows?.rows || []) {
    for (const key of keys) {
      const val = Number(row?.contributors?.[key]);
      if (Number.isFinite(val)) {
        sum += val;
        count += 1;
        break;
      }
    }
  }
  if (!count) return { label, score: null, valueText: '<span class="placeholder">Unavailable</span>', note: 'Not present in this export' };
  const avg = sum / count;
  return { label, score: avg, valueText: formatter(avg), note: note || `Average ${scoreStatus(avg)}` };
}

function renderReadinessPage(range, day, rangeRows) {
  const dayReadiness = day?.dailyReadiness;
  const score = range.isSingleDay ? dayReadiness?.score : average(rangeRows.dailyReadiness, 'score');
  const avgLowestHr = range.isSingleDay ? day?.sleepModel?.lowestHeartRate : average(rangeRows.sleepModel, 'lowestHeartRate');
  const avgHrv = range.isSingleDay ? day?.sleepModel?.avgHrv : average(rangeRows.sleepModel, 'avgHrv');
  const avgBreath = range.isSingleDay ? day?.sleepModel?.avgBreath : average(rangeRows.sleepModel, 'avgBreath');
  const avgTempDeviation = range.isSingleDay ? dayReadiness?.temperatureDeviation : average(rangeRows.dailyReadiness, 'temperatureDeviation');

  const insightHeadline = Number.isFinite(score) ? `${scoreStatus(score)} readiness` : 'Readiness unavailable';

  const insightBody = range.isSingleDay
    ? `Lowest HR ${fmt(avgLowestHr, 1, ' bpm')}, average HRV ${fmt(avgHrv, 1, ' ms')}, respiratory rate ${fmt(avgBreath, 1, ' /min')}.`
    : `Average resting HR ${fmt(avgLowestHr, 1, ' bpm')}, average HRV ${fmt(avgHrv, 1, ' ms')}, temperature deviation ${fmtSigned(avgTempDeviation, 2, '°C')}.`;

  const contributorRows = range.isSingleDay
    ? summarizeContributors([dayReadiness], CONTRIBUTOR_LABELS.readiness)
    : summarizeContributors(rangeRows.dailyReadiness, CONTRIBUTOR_LABELS.readiness);

  const mappedContributors = [
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['resting_heart_rate'], { label: 'Resting heart rate' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['hrv_balance'], { label: 'HRV balance' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['body_temperature'], { label: 'Body temperature' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['recovery_index'], { label: 'Recovery index' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['sleep', 'previous_night'], { label: 'Sleep' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['sleep_balance'], { label: 'Sleep balance' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['sleep_regularity'], { label: 'Sleep regularity' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['previous_day_activity'], { label: 'Previous day activity' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyReadiness }, dayReadiness, ['activity_balance'], { label: 'Activity balance' })
  ];

  const hrSeries = range.isSingleDay
    ? seriesToPoints(parseSeriesJson(day?.sleepModel?.hrJson))
    : buildDailyLine(rangeRows.sleepModel, 'lowestHeartRate');
  const hrvSeries = range.isSingleDay
    ? seriesToPoints(parseSeriesJson(day?.sleepModel?.hrvJson))
    : buildDailyLine(rangeRows.sleepModel, 'avgHrv');

  const readinessBaseline = average((rangeRows.dailyReadiness || []).slice(-14), 'score');

  return `
    ${renderHeroCard({
      eyebrow: 'Readiness',
      title: range.isSingleDay ? 'Readiness score' : 'Average Readiness',
      value: fmt(score),
      status: scoreStatus(score),
      detail: insightHeadline,
      extra: `<p class="muted">${insightBody}</p>`
    })}

    <section class="card section-card">
      <div class="section-head">
        <h3>Contributors</h3>
      </div>
      ${renderContributorRows(mappedContributors.filter((row) => row))}
      ${contributorRows.length ? `<p class="small muted">Top observed contributor scores: ${contributorRows.slice(0, 3).map((item) => `${item.label} ${Math.round(item.score)}`).join(' · ')}</p>` : ''}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Key metrics</h3></div>
      ${renderMetricGrid([
        { label: 'Resting heart rate', value: fmt(avgLowestHr, 1, ' bpm'), note: range.isSingleDay ? 'Lowest overnight heart rate' : 'Average nightly lowest heart rate' },
        { label: 'Heart rate variability', value: fmt(avgHrv, 1, ' ms'), note: range.isSingleDay ? 'Average overnight HRV' : 'Average HRV across range' },
        { label: 'Body temperature', value: fmtSigned(avgTempDeviation, 2, '°C'), note: 'Temperature deviation from baseline' },
        { label: 'Respiratory rate', value: fmt(avgBreath, 1, ' /min'), note: 'Average breathing rate during sleep' }
      ])}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Details</h3></div>
      ${renderMetricGrid([
        { label: range.isSingleDay ? 'Lowest heart rate' : 'Average lowest heart rate', value: fmt(avgLowestHr, 1, ' bpm'), note: range.isSingleDay ? 'Night minimum from sleep model' : 'Range average from nightly minima' },
        { label: range.isSingleDay ? 'Average HRV' : 'Average daily HRV', value: fmt(avgHrv, 1, ' ms'), note: range.isSingleDay ? 'Night average' : 'Range average' }
      ])}
      ${renderAxisLineChart({ title: range.isSingleDay ? 'Lowest heart rate overnight' : 'Daily lowest heart rate trend', series: hrSeries, yUnit: 'bpm', yDomainConfig: { minPadding: 3, maxPadding: 3 } })}
      ${renderAxisLineChart({ title: range.isSingleDay ? 'Average HRV overnight' : 'Daily average HRV trend', series: hrvSeries, yUnit: 'ms', yDomainConfig: { minPadding: 4, maxPadding: 4 } })}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Readiness context</h3></div>
      ${renderMetricGrid([
        { label: 'Current window', value: summarizeRange(range), note: range.isSingleDay ? 'Single-day detail mode' : 'Range aggregation mode' },
        { label: 'Average readiness (14d)', value: fmt(readinessBaseline), note: 'Calculated from available readiness rows in range' },
        { label: 'Data points', value: fmt((rangeRows.dailyReadiness || []).length, 0), note: 'Readiness days in selected window' },
        { label: 'Nightly vitals points', value: fmt((rangeRows.sleepModel || []).length, 0), note: 'Sleep model nights supporting detail metrics' }
      ])}
    </section>
  `;
}

function sleepContributorRows(range, day, rangeRows) {
  const rows = [];
  const dayContrib = day?.dailySleep?.contributors || {};
  const avgContrib = summarizeContributors(rangeRows.dailySleep, CONTRIBUTOR_LABELS.sleep);
  const byKey = Object.fromEntries(avgContrib.map((item) => [item.key, item]));
  const source = range.isSingleDay ? dayContrib : byKey;

  const contributorSpec = [
    { key: 'total_sleep', label: 'Total sleep' },
    { key: 'efficiency', label: 'Efficiency' },
    { key: 'restfulness', label: 'Restfulness' },
    { key: 'rem_sleep', label: 'REM sleep' },
    { key: 'deep_sleep', label: 'Deep sleep' },
    { key: 'latency', label: 'Latency' },
    { key: 'timing', label: 'Timing' }
  ];

  for (const item of contributorSpec) {
    if (range.isSingleDay) {
      const val = Number(source[item.key]);
      rows.push(Number.isFinite(val)
        ? { label: item.label, score: val, valueText: `${Math.round(val)}`, note: scoreStatus(val, 'sleep') }
        : { label: item.label, score: null, valueText: '<span class="placeholder">Unavailable</span>', note: 'Not present in this export' });
    } else {
      const avg = source[item.key]?.score;
      rows.push(Number.isFinite(avg)
        ? { label: item.label, score: avg, valueText: `${Math.round(avg)}`, note: `Average ${scoreStatus(avg, 'sleep')}` }
        : { label: item.label, score: null, valueText: '<span class="placeholder">Unavailable</span>', note: 'Not present in this export' });
    }
  }

  const totalSleepValue = range.isSingleDay ? day?.sleepModel?.totalSleepSec : average(rangeRows.sleepModel, 'totalSleepSec');
  rows[0] = {
    ...rows[0],
    valueText: fmtDurationSeconds(totalSleepValue, true),
    note: range.isSingleDay ? 'Sleep model duration' : 'Average sleep model duration'
  };
  const efficiencyValue = range.isSingleDay ? day?.sleepModel?.efficiencyPct : average(rangeRows.sleepModel, 'efficiencyPct');
  rows[1] = {
    ...rows[1],
    valueText: fmt(efficiencyValue, 0, '%'),
    note: range.isSingleDay ? 'Night sleep efficiency' : 'Average sleep efficiency'
  };
  const latencyValue = range.isSingleDay ? day?.sleepModel?.latencySec : average(rangeRows.sleepModel, 'latencySec');
  rows[5] = {
    ...rows[5],
    valueText: Number.isFinite(Number(latencyValue)) ? `${Math.round(Number(latencyValue) / 60)} min` : '<span class="placeholder">Unavailable</span>',
    note: range.isSingleDay ? 'Time to fall asleep' : 'Average sleep latency'
  };

  return rows;
}

function renderSleepPage(range, day, rangeRows) {
  const daySleep = day?.dailySleep;
  const score = range.isSingleDay ? daySleep?.score : average(rangeRows.dailySleep, 'score');
  const totalSleepSec = range.isSingleDay ? day?.sleepModel?.totalSleepSec : average(rangeRows.sleepModel, 'totalSleepSec');
  const efficiency = range.isSingleDay ? day?.sleepModel?.efficiencyPct : average(rangeRows.sleepModel, 'efficiencyPct');
  const timeInBed = range.isSingleDay ? day?.sleepModel?.timeInBedSec : average(rangeRows.sleepModel, 'timeInBedSec');
  const restingHr = range.isSingleDay ? day?.sleepModel?.lowestHeartRate : average(rangeRows.sleepModel, 'lowestHeartRate');
  const spo2 = range.isSingleDay ? day?.dailySpo2?.spo2Average : average(rangeRows.dailySpo2, 'spo2Average');
  const bdi = range.isSingleDay ? day?.dailySpo2?.breathingDisturbanceIndex : average(rangeRows.dailySpo2, 'breathingDisturbanceIndex');

  const heroDetail = `Total sleep ${fmtDurationSeconds(totalSleepSec, true)} · efficiency ${fmt(efficiency, 0, '%')}.`;

  const sleepContributors = sleepContributorRows(range, day, rangeRows);

  const stageSegments = range.isSingleDay ? decodeStages(day?.sleepModel) : [];
  const movementSeries = range.isSingleDay ? (day?.sleepMovement || []) : [];
  const hrSeries = range.isSingleDay
    ? seriesToPoints(parseSeriesJson(day?.sleepModel?.hrJson))
    : buildDailyLine(rangeRows.sleepModel, 'lowestHeartRate');
  const spo2Series = buildDailyLine(rangeRows.dailySpo2, 'spo2Average');
  const totalSleepTrend = buildDailyLine(rangeRows.sleepModel, 'totalSleepSec').map((point) => ({ ...point, v: Math.round(point.v / 60) }));
  const efficiencyTrend = buildDailyLine(rangeRows.sleepModel, 'efficiencyPct');

  const stageTotal = range.isSingleDay ? (day?.sleepModel?.totalSleepSec || 0) : average(rangeRows.sleepModel, 'totalSleepSec');
  const deepSec = range.isSingleDay ? day?.sleepModel?.deepSec : average(rangeRows.sleepModel, 'deepSec');
  const remSec = range.isSingleDay ? day?.sleepModel?.remSec : average(rangeRows.sleepModel, 'remSec');
  const lightSec = range.isSingleDay ? day?.sleepModel?.lightSec : average(rangeRows.sleepModel, 'lightSec');

  const bodyClockCard = '';

  return `
    ${renderHeroCard({
      eyebrow: 'Sleep',
      title: range.isSingleDay ? 'Sleep score' : 'Average Sleep Score',
      value: fmt(score),
      status: scoreStatus(score, 'sleep'),
      detail: heroDetail
    })}

    <section class="card section-card">
      <div class="section-head"><h3>Contributors</h3></div>
      ${renderContributorRows(sleepContributors)}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Key metrics</h3></div>
      ${renderMetricGrid([
        { label: 'Total sleep time', value: fmtDurationSeconds(totalSleepSec, true), note: 'Sleep model duration' },
        { label: 'Time in bed', value: fmtDurationSeconds(timeInBed, true), note: 'Bedtime interval from sleep model' },
        { label: 'Sleep efficiency', value: fmt(efficiency, 0, '%'), note: range.isSingleDay ? 'Selected night' : 'Range average' },
        { label: 'Resting heart rate', value: fmt(restingHr, 1, ' bpm'), note: range.isSingleDay ? 'Lowest overnight heart rate' : 'Average nightly lowest HR' }
      ])}
    </section>

    ${bodyClockCard}

    <section class="card section-card">
      <div class="section-head"><h3>Sleep details</h3></div>

      ${range.isSingleDay
        ? `${renderSleepStageChart({ title: 'Sleep stage timeline', stages: stageSegments })}
           ${renderAxisBarChart({ title: 'Movement timeline', series: movementSeries, yTicks: [0, 1, 2, 3, 4], yLabelFormatter: (value) => `${value}` })}
           ${renderAxisLineChart({ title: 'Overnight heart rate', series: hrSeries, yUnit: 'bpm', yDomainConfig: { minPadding: 3, maxPadding: 3 } })}`
        : `${renderAxisLineChart({ title: 'Daily total sleep trend', series: totalSleepTrend, yUnit: 'min', yDomainConfig: { minPadding: 12, maxPadding: 12 } })}
           ${renderAxisLineChart({ title: 'Daily sleep efficiency trend', series: efficiencyTrend, yUnit: '%', yDomainConfig: { minPadding: 2, maxPadding: 2 } })}
           ${renderAxisLineChart({ title: 'Daily lowest heart rate trend', series: hrSeries, yUnit: 'bpm', yDomainConfig: { minPadding: 3, maxPadding: 3 } })}`}

      ${renderMetricGrid([
        { label: 'Stage breakdown · Deep', value: fmtDurationSeconds(deepSec, true), note: Number.isFinite(stageTotal) && Number.isFinite(deepSec) ? `${Math.round((deepSec / Math.max(stageTotal, 1)) * 100)}% of total sleep` : 'Unavailable' },
        { label: 'Stage breakdown · REM', value: fmtDurationSeconds(remSec, true), note: Number.isFinite(stageTotal) && Number.isFinite(remSec) ? `${Math.round((remSec / Math.max(stageTotal, 1)) * 100)}% of total sleep` : 'Unavailable' },
        { label: 'Stage breakdown · Light', value: fmtDurationSeconds(lightSec, true), note: Number.isFinite(stageTotal) && Number.isFinite(lightSec) ? `${Math.round((lightSec / Math.max(stageTotal, 1)) * 100)}% of total sleep` : 'Unavailable' },
        { label: 'Average blood oxygen', value: fmt(spo2, 1, '%'), note: range.isSingleDay ? 'Night average SpO₂' : 'Range average SpO₂' },
        { label: 'Breathing regularity', value: fmt(bdi, 1), note: 'Breathing disturbance index (lower is steadier)' },
        { label: 'Lowest heart rate', value: fmt(restingHr, 1, ' bpm'), note: range.isSingleDay ? 'Selected night minimum' : 'Range average nightly minimum' },
        { label: 'Average HRV', value: fmt(range.isSingleDay ? day?.sleepModel?.avgHrv : average(rangeRows.sleepModel, 'avgHrv'), 1, ' ms'), note: 'From sleep model where available' },
        { label: 'SpO₂ trend support', value: fmt((rangeRows.dailySpo2 || []).length, 0), note: spo2Series.length ? 'Trend data available in selected range' : 'No SpO₂ trend data in selected range' }
      ])}

      ${!range.isSingleDay ? renderAxisLineChart({ title: 'Daily SpO₂ average trend', series: spo2Series, yUnit: '%', yDomainConfig: { minPadding: 0.5, maxPadding: 0.5 } }) : ''}
    </section>
  `;
}

function renderActivityPage(range, day, rangeRows) {
  const summary = activitySummary(range, day, rangeRows);
  const selected = day?.dailyActivity;
  const goalProgress = range.isSingleDay
    ? (Number(selected?.targetCalories) > 0 ? (Number(selected?.totalCalories) / Number(selected?.targetCalories)) * 100 : null)
    : average((rangeRows.dailyActivity || []).map((row) => ({
      progress: Number(row?.targetCalories) > 0 ? (Number(row.totalCalories) / Number(row.targetCalories)) * 100 : null
    })), 'progress');
  const activities = aggregateActivities(day, rangeRows);
  const movementSeries = range.isSingleDay
    ? (day?.activityClassSeries || []).map((point) => ({ tMs: point.tMs, v: point.level }))
    : buildDailyActivitySeconds(rangeRows.dailyActivity);
  const stepsTrend = buildDailyLine(rangeRows.dailyActivity, 'steps');

  const contributorRows = [
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyActivity }, selected, ['stay_active'], { label: 'Stay active' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyActivity }, selected, ['move_every_hour'], { label: 'Move every hour' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyActivity }, selected, ['meet_daily_targets', 'meet_daily_goals'], { label: 'Meet daily goals' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyActivity }, selected, ['training_frequency'], { label: 'Training frequency' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyActivity }, selected, ['training_volume'], { label: 'Training volume' }),
    contributorFromRange({ isSingleDay: range.isSingleDay, rows: rangeRows.dailyActivity }, selected, ['recovery_time'], { label: 'Recovery time' })
  ];

  const zoneRows = range.isSingleDay
    ? [{
        label: 'Sedentary',
        value: fmtMinutes((Number(selected?.sedentaryTime) || 0) / 60),
        note: 'Low-movement minutes from daily activity'
      }, {
        label: 'Low activity',
        value: fmtMinutes((Number(selected?.lowActivityTime) || 0) / 60),
        note: 'Estimated low intensity movement'
      }, {
        label: 'Medium activity',
        value: fmtMinutes((Number(selected?.mediumActivityTime) || 0) / 60),
        note: 'Moderate intensity minutes'
      }, {
        label: 'High activity',
        value: fmtMinutes((Number(selected?.highActivityTime) || 0) / 60),
        note: 'High intensity minutes'
      }]
    : [{
        label: 'Average sedentary',
        value: fmtMinutes(average(rangeRows.dailyActivity, 'sedentaryTime') / 60),
        note: 'Average per day in selected range'
      }, {
        label: 'Average low activity',
        value: fmtMinutes(average(rangeRows.dailyActivity, 'lowActivityTime') / 60),
        note: 'Average per day in selected range'
      }, {
        label: 'Average medium activity',
        value: fmtMinutes(average(rangeRows.dailyActivity, 'mediumActivityTime') / 60),
        note: 'Average per day in selected range'
      }, {
        label: 'Average high activity',
        value: fmtMinutes(average(rangeRows.dailyActivity, 'highActivityTime') / 60),
        note: 'Average per day in selected range'
      }];

  const zoneSupport = (rangeRows.dailyActivity || []).some((row) => Number(row?.lowActivityTime) || Number(row?.mediumActivityTime) || Number(row?.highActivityTime));

  return `
    ${renderHeroCard({
      eyebrow: 'Activity',
      title: range.isSingleDay ? 'Activity score' : 'Average Activity',
      value: fmt(summary.score),
      status: scoreStatus(summary.score),
      detail: range.isSingleDay
        ? `${fmt(summary.steps, 0)} steps · ${fmt(summary.totalBurn, 0, ' cal')} total burn.`
        : `${fmt(summary.steps, 0)} steps/day · ${fmt(summary.totalBurn, 0, ' cal')} total burn/day.`
    })}

    <section class="card section-card">
      <div class="section-head"><h3>Contributors</h3></div>
      ${renderContributorRows(contributorRows)}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Key metrics</h3></div>
      ${renderMetricGrid([
        { label: range.isSingleDay ? 'Goal progress' : 'Average goal progress', value: fmt(goalProgress, 0, '%'), note: 'Total burn ÷ target calories' },
        { label: range.isSingleDay ? 'Total burn' : 'Average total burn', value: fmt(summary.totalBurn, 0, ' cal'), note: 'Daily total calories' },
        { label: range.isSingleDay ? 'Activity time' : 'Average activity time', value: fmtDurationSeconds(summary.activitySeconds, true), note: 'Medium + high activity duration' },
        { label: range.isSingleDay ? 'Steps' : 'Average steps', value: fmt(summary.steps, 0), note: 'Daily step count' }
      ])}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Activities</h3></div>
      ${renderActivitiesList(activities, range.isSingleDay)}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Daily movement</h3></div>
      ${range.isSingleDay
        ? renderAxisBarChart({ title: 'Intraday movement intensity', series: movementSeries, yTicks: [0, 1, 2, 3], yLabelFormatter: (value) => ['Rest', 'Low', 'Med', 'High'][value] || String(value) })
        : renderAxisLineChart({ title: 'Daily activity minutes trend', series: movementSeries, yUnit: 'min', yDomainConfig: { minPadding: 10, maxPadding: 10 } })}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>${range.isSingleDay ? 'This week' : 'Range summary'}</h3></div>
      ${renderMetricGrid([
        { label: 'Workout entries', value: fmt(summary.workoutCount, 0), note: 'Rows from workout.csv' },
        { label: 'Session entries', value: fmt(summary.sessionCount, 0), note: 'Rows from session.csv' },
        { label: 'Total range steps', value: fmt(summary.totalRangeSteps, 0), note: 'Sum across selected daily activity rows' },
        { label: 'Inactivity alerts', value: fmt(summary.inactivityAlerts, 1), note: range.isSingleDay ? 'Selected day' : 'Average per day' }
      ])}
      ${renderAxisLineChart({ title: 'Daily steps trend', series: stepsTrend, yUnit: 'steps', yDomainConfig: { minPadding: 250, maxPadding: 250 } })}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Weekly zone minutes</h3></div>
      ${zoneSupport
        ? renderMetricGrid(zoneRows)
        : '<div class="placeholder">Zone minutes unavailable.</div>'}
    </section>
  `;
}

function renderPreviewCard({ title, subtitle, metrics, footer }) {
  return `
    <section class="card section-card">
      <div class="section-head">
        <h3>${title}</h3>
        ${subtitle ? `<p class="muted">${subtitle}</p>` : ''}
      </div>
      ${renderMetricGrid(metrics)}
      ${footer ? `<p class="small muted">${footer}</p>` : ''}
    </section>
  `;
}

function renderHome(range, day, rangeRows) {
  const summaries = DOMAIN_ORDER.map((domain) => metricDomainSummary(domain, range, day, rangeRows));
  const activity = activitySummary(range, day, rangeRows);
  const heart = heartRateSummary(range, day, rangeRows);
  const readiness = summaries.find((item) => item.domain === 'readiness');
  const heroDetail = range.isSingleDay ? 'Latest daily snapshot.' : 'Multi-day averages.';

  const sleepRows = rangeRows.dailySleep || [];
  const vitalsRows = rangeRows.derivedNightlyVitals || [];

  return `
    <section class="summary-strip">
      ${summaries
        .map(
          (item) => `<article class="chip-card"><div class="chip-title">${item.title}</div><div class="chip-value">${item.value}</div><div class="chip-note">${item.sub}</div></article>`
        )
        .join('')}
    </section>

    ${renderHeroCard({
      eyebrow: 'Home hero',
      title: 'Readiness-led daily summary',
      value: readiness?.value || '<span class="placeholder">No readiness data</span>',
      status: '',
      detail: heroDetail,
      extra: ''
    })}

    ${renderPreviewCard({
      title: 'Sleep preview',
      subtitle: '',
      metrics: [
        { label: 'Sleep score', value: fmt(range.isSingleDay ? day?.dailySleep?.score : average(sleepRows, 'score')) },
        { label: 'Efficiency', value: fmt(average(rangeRows.sleepModel, 'efficiencyPct'), 0, '%'), note: 'From Sleep Model when available' },
        { label: 'Avg HR', value: fmt(average(rangeRows.sleepModel, 'avgHeartRate'), 1, ' bpm') },
        { label: 'Avg HRV', value: fmt(average(rangeRows.sleepModel, 'avgHrv'), 1, ' ms') }
      ],
      footer: ''
    })}

    ${renderPreviewCard({
      title: 'Activity preview',
      subtitle: '',
      metrics: [
        { label: 'Activity score', value: fmt(activity.score) },
        { label: 'Steps', value: fmt(activity.steps, 0) },
        { label: 'Active calories', value: fmt(activity.activeBurn, 0, ' cal') },
        { label: 'Inactivity alerts', value: fmt(activity.inactivityAlerts, 1) }
      ],
      footer: ''
    })}

    ${renderPreviewCard({
      title: 'Stress preview',
      subtitle: '',
      metrics: [
        { label: 'Stress score', value: fmt(range.isSingleDay ? day?.dailyStress?.score : average(rangeRows.dailyStress, 'score')) },
        { label: 'High stress', value: fmtMinutes(range.isSingleDay ? day?.dailyStress?.high : average(rangeRows.dailyStress, 'high')) },
        { label: 'Restored', value: fmtMinutes(range.isSingleDay ? day?.dailyStress?.recovery : average(rangeRows.dailyStress, 'recovery')) },
        { label: 'Daytime points', value: fmt((rangeRows.daytimeStress || []).length, 0) }
      ],
      footer: ''
    })}

    ${renderPreviewCard({
      title: 'Heart Rate preview',
      subtitle: '',
      metrics: [
        { label: 'Overnight avg', value: fmt(heart.overnightAvg, 1, ' bpm') },
        { label: 'Min overnight', value: fmt(heart.overnightMin, 1, ' bpm') },
        { label: 'Max overnight', value: fmt(heart.overnightMax, 1, ' bpm') },
        { label: 'Points', value: fmt(heart.points, 0) }
      ],
      footer: ''
    })}
  `;
}

function renderDomainPage(pageKey, range, day, rangeRows) {
  const [datasetKey, scoreKey] = SCORE_FIELDS[pageKey] || [];
  const title = PAGE_META[pageKey]?.title || pageKey;
  const dataRows = datasetKey ? rangeRows[datasetKey] || [] : [];
  const dayValue = datasetKey ? day?.[datasetKey]?.[scoreKey] : null;
  const rangeValue = datasetKey ? average(dataRows, scoreKey) : null;

  return `
    ${renderHeroCard({
      eyebrow: `${title} hero`,
      title: `${title} summary`,
      value: fmt(range.isSingleDay ? dayValue : rangeValue),
      status: '',
      detail: range.isSingleDay ? 'Current day summary.' : 'Selected range summary.'
    })}

    <section class="card section-card">
      <div class="section-head">
        <h3>Key metrics</h3>
        <p class="muted">Page parity for this tab remains intentionally limited in PR3.</p>
      </div>
      ${renderMetricGrid([
        { label: 'Score', value: fmt(range.isSingleDay ? dayValue : rangeValue) },
        { label: 'Window', value: summarizeRange(range) }
      ])}
    </section>
  `;
}

function renderHeartRatePage(range, day, rangeRows) {
  const summary = heartRateSummary(range, day, rangeRows);
  const hrSeries = range.isSingleDay
    ? (day?.heartRateSeries || []).map((row) => ({ tMs: row.t, v: row.bpm }))
    : buildDailyLine(rangeRows.sleepModel, 'lowestHeartRate');
  const overnightAvgTrend = buildDailyLine(rangeRows.sleepModel, 'avgHeartRate');
  const daytimeTrend = buildDailyLine(rangeRows.daytimeHeartRate, 'min');
  const sleepRange = range.isSingleDay
    ? (Number.isFinite(summary.overnightMin) && Number.isFinite(summary.overnightMax) ? `${Math.round(summary.overnightMin)}-${Math.round(summary.overnightMax)} bpm` : '<span class="placeholder">Unavailable</span>')
    : (Number.isFinite(average(rangeRows.sleepModel, 'lowestHeartRate')) && Number.isFinite(average(rangeRows.sleepModel, 'highestHeartRate'))
        ? `${Math.round(average(rangeRows.sleepModel, 'lowestHeartRate'))}-${Math.round(average(rangeRows.sleepModel, 'highestHeartRate'))} bpm`
        : '<span class="placeholder">Unavailable</span>');
  const activityRange = range.isSingleDay
    ? (Number.isFinite(day?.daytimeHeartRateSummary?.min) && Number.isFinite(day?.daytimeHeartRateSummary?.max) ? `${Math.round(day.daytimeHeartRateSummary.min)}-${Math.round(day.daytimeHeartRateSummary.max)} bpm` : '<span class="placeholder">Unavailable</span>')
    : (Number.isFinite(average(rangeRows.daytimeHeartRate, 'min')) && Number.isFinite(average(rangeRows.daytimeHeartRate, 'max'))
        ? `${Math.round(average(rangeRows.daytimeHeartRate, 'min'))}-${Math.round(average(rangeRows.daytimeHeartRate, 'max'))} bpm`
        : '<span class="placeholder">Unavailable</span>');

  return `
    ${renderHeroCard({
      eyebrow: 'Heart Rate',
      title: range.isSingleDay ? 'Overnight average HR' : 'Average Overnight HR',
      value: fmt(summary.overnightAvg, 1, ' bpm'),
      status: '',
      detail: range.isSingleDay
        ? `Overnight heart-rate summary with ${fmt(summary.points, 0)} points.`
        : 'Average heart-rate metrics for the selected range.'
    })}

    <section class="card section-card">
      <div class="section-head"><h3>Key metrics</h3></div>
      ${renderMetricGrid([
        { label: range.isSingleDay ? 'Overnight avg HR' : 'Average overnight HR', value: fmt(summary.overnightAvg, 1, ' bpm') },
        { label: range.isSingleDay ? 'Overnight lowest HR' : 'Average overnight lowest', value: fmt(summary.overnightMin, 1, ' bpm') },
        { label: range.isSingleDay ? 'Overnight max HR' : 'Average overnight max', value: fmt(summary.overnightMax, 1, ' bpm') },
        { label: range.isSingleDay ? 'Daytime lowest' : 'Average daytime lowest', value: fmt(summary.daytimeLowest, 1, ' bpm') },
        { label: 'Sleeping range', value: sleepRange },
        { label: 'Activity range', value: activityRange },
        { label: 'Recovery proxy', value: fmt(summary.recoveryProxy, 1, ' ms') },
        { label: 'Data coverage', value: fmt(summary.points, 0) }
      ])}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>${range.isSingleDay ? 'Overnight trace' : 'Daily heart-rate trends'}</h3></div>
      ${renderAxisLineChart({ title: range.isSingleDay ? 'Overnight heart rate trace' : 'Daily lowest HR trend', series: hrSeries, yUnit: 'bpm', yDomainConfig: { minPadding: 3, maxPadding: 3 } })}
      ${!range.isSingleDay ? renderAxisLineChart({ title: 'Daily overnight average HR trend', series: overnightAvgTrend, yUnit: 'bpm', yDomainConfig: { minPadding: 3, maxPadding: 3 } }) : ''}
      ${!range.isSingleDay ? renderAxisLineChart({ title: 'Daily daytime lowest HR trend', series: daytimeTrend, yUnit: 'bpm', yDomainConfig: { minPadding: 3, maxPadding: 3 } }) : ''}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Context</h3></div>
      ${renderMetricGrid([
        { label: 'Overnight summary', value: range.isSingleDay ? `Min ${fmt(summary.overnightMin, 1)} · Avg ${fmt(summary.overnightAvg, 1)} · Max ${fmt(summary.overnightMax, 1)}` : `Avg min ${fmt(summary.overnightMin, 1)} · Avg ${fmt(summary.overnightAvg, 1)}`, note: 'Night-window heart-rate context' },
        { label: 'Daytime lowest avg', value: fmt(summary.daytimeLowest, 1, ' bpm'), note: 'Based on daytime samples only' },
        { label: 'Nightly rows', value: fmt(summary.nightlyRows, 0), note: 'Sleep-model rows in selected range' },
        { label: 'Restorative overlap', value: '<span class="placeholder">See Stress tab</span>', note: 'Stress + recovery context' }
      ])}
    </section>
  `;
}

function renderStressPage(range, day, rangeRows) {
  const summary = stressSummary(range, day, rangeRows);
  const dayTimeline = stressDayTimelineRows(range, rangeRows);
  const dayScoreSeries = dayTimeline.filter((row) => Number.isFinite(row.score)).map((row) => ({ tMs: row.tMs, v: row.score }));
  const dayRecoverySeries = dayTimeline.filter((row) => Number.isFinite(row.recoveryValue)).map((row) => ({ tMs: row.tMs, v: row.recoveryValue }));
  const dayCategory = stressCategorySeries(dayTimeline);
  const hasDailyBreakdown = (rangeRows.dailyStress || []).some((row) => Number.isFinite(Number(row?.high)) || Number.isFinite(Number(row?.recovery)));
  const dailyBreakdownRows = stressDailyBreakdownRows(rangeRows.dailyStress || []);
  const highStressTrend = dailyBreakdownRows
    .filter((row) => row.date && Number.isFinite(row.stressedMinutes))
    .map((row) => ({
      tMs: new Date(`${row.date}T12:00:00`).getTime(),
      v: row.stressedMinutes
    }))
    .filter((point) => Number.isFinite(point.tMs) && Number.isFinite(point.v));
  const restoredTrend = dailyBreakdownRows
    .filter((row) => row.date && Number.isFinite(row.restoredMinutes))
    .map((row) => ({
      tMs: new Date(`${row.date}T12:00:00`).getTime(),
      v: row.restoredMinutes
    }))
    .filter((point) => Number.isFinite(point.tMs) && Number.isFinite(point.v));
  const stressValue = range.isSingleDay ? summary.highStress : summary.highStress;
  const heroCopy = range.isSingleDay
    ? `${summary.daySummary ? `${summary.daySummary} · ` : ''}high stress ${fmtMinutes(summary.highStress)} · restored ${fmtMinutes(summary.recoveryTime)}.`
    : `Avg high stress ${fmtMinutes(summary.highStress)} · restored ${fmtMinutes(summary.recoveryTime)}.`;
  const hasStressData = Number.isFinite(summary.highStress) || dayScoreSeries.length || dayRecoverySeries.length || dayCategory.series.length;
  const dominantSummary = summary.summaryDistribution?.[0];

  return `
    ${renderHeroCard({
      eyebrow: 'Stress',
      title: range.isSingleDay ? 'High stress' : 'Average high stress',
      value: fmtMinutes(stressValue),
      status: '',
      detail: heroCopy,
      extra: !range.isSingleDay ? renderDualStressDailyChart({ title: 'Selected range trend', stressSeries: highStressTrend, recoverySeries: restoredTrend }) : ''
    })}

    <section class="card section-card">
      <div class="section-head"><h3>Key metrics</h3></div>
      ${renderMetricGrid([
        { label: range.isSingleDay ? 'High stress' : 'Avg high stress', value: fmtMinutes(summary.highStress) },
        { label: range.isSingleDay ? 'Restored' : 'Avg restored', value: fmtMinutes(summary.recoveryTime) },
        { label: range.isSingleDay ? 'Day summary' : 'Top summary', value: range.isSingleDay ? (summary.daySummary || '<span class="placeholder">Unavailable</span>') : (dominantSummary ? `${dominantSummary.summary} (${dominantSummary.count})` : '<span class="placeholder">Unavailable</span>') },
        { label: range.isSingleDay ? 'Peak stress value' : 'Avg daytime stress value', value: fmt(summary.daytimePeak, 1) },
        { label: range.isSingleDay ? 'Recovery value avg' : 'Avg recovery value', value: fmt(summary.recoveryDaytimeAvg, 1) },
        { label: 'Days with stress data', value: fmt(summary.stressDays, 0) },
        { label: 'Daytime points', value: fmt(summary.daytimePoints, 0) }
      ])}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>${range.isSingleDay ? 'Daytime stress timeline' : 'Stress trends'}</h3></div>
      ${!hasStressData
        ? '<div class="placeholder">Stress data is unavailable for this selection.</div>'
        : (range.isSingleDay
        ? `${dayScoreSeries.length ? renderAxisLineChart({
              title: 'Daytime stress values',
              series: dayScoreSeries,
              yUnit: '',
              yDomainConfig: { min: 0, max: 100, minPadding: 0, maxPadding: 0 }
            }) : ''}
           ${dayRecoverySeries.length ? renderAxisLineChart({
              title: 'Daytime recovery values',
              series: dayRecoverySeries,
              yUnit: '',
              yDomainConfig: { min: 0, max: 100, minPadding: 0, maxPadding: 0 }
            }) : ''}
           ${!dayScoreSeries.length && !dayRecoverySeries.length && dayCategory.series.length
              ? renderAxisBarChart({
                  title: 'Daytime stress states',
                  series: dayCategory.series,
                  yTicks: dayCategory.categories.map((_, idx) => idx),
                  yLabelFormatter: (value) => dayCategory.categories[value] || '',
                  height: 180
                })
              : ''}
           ${!dayScoreSeries.length && !dayRecoverySeries.length && !dayCategory.series.length ? '<div class="placeholder">No daytime stress trace is available for this day.</div>' : ''}`
        : renderDualStressDailyChart({ title: 'Daily high stress + restored trend', stressSeries: highStressTrend, recoverySeries: restoredTrend }))}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>${range.isSingleDay ? 'Recent context' : 'Range summary'}</h3></div>
      ${hasDailyBreakdown
        ? renderMetricGrid([
            { label: range.isSingleDay ? 'Recent high stress avg' : 'High stress avg', value: fmtMinutes(average((rangeRows.dailyStress || []).slice(-7), 'high')) },
            { label: range.isSingleDay ? 'Recent restored avg' : 'Restored avg', value: fmtMinutes(average((rangeRows.dailyStress || []).slice(-7), 'recovery')) },
            { label: 'Tracked days', value: fmt((rangeRows.dailyStress || []).length, 0) },
            { label: 'Daytime points', value: fmt((rangeRows.daytimeStress || []).length, 0) }
          ])
        : '<div class="placeholder">Daily stress breakdown fields are unavailable in this export.</div>'}
    </section>
  `;
}

function buildPageWarnings(range, day, rangeRows) {
  const warnings = [];
  if (!range?.start || !range?.end) warnings.push('No valid selected range is active.');
  if (page === 'index') {
    if (!Number.isFinite(Number(range.isSingleDay ? day?.dailyReadiness?.score : average(rangeRows.dailyReadiness, 'score')))) {
      warnings.push('Home readiness summary is unavailable for the selected range.');
    }
    if (!Number.isFinite(Number(range.isSingleDay ? day?.dailySleep?.score : average(rangeRows.dailySleep, 'score')))) {
      warnings.push('Home sleep summary is unavailable for the selected range.');
    }
  }
  if (page === 'readiness' && !Number.isFinite(Number(range.isSingleDay ? day?.dailyReadiness?.score : average(rangeRows.dailyReadiness, 'score')))) {
    warnings.push('Readiness score unavailable for selected range.');
  }
  if (page === 'sleep' && !Number.isFinite(Number(range.isSingleDay ? day?.dailySleep?.score : average(rangeRows.dailySleep, 'score')))) {
    warnings.push('Sleep score unavailable for selected range.');
  }
  return warnings;
}

function diagnosticsText(range, day, rangeRows) {
  const snapshot = getStoreSnapshot();
  const availableDates = getAvailableDates();
  const latestAvailableDate = availableDates.at(-1) || null;
  const rowCounts = snapshot.ingestReport?.rowCounts || {};
  const loadedDatasetKeys = Object.entries(rowCounts)
    .filter(([_, count]) => Number(count) > 0)
    .map(([key]) => key);
  const pageWarnings = buildPageWarnings(range, day, rangeRows);

  const summaryBlock = [
    `selectedPreset: ${range?.preset || 'latest-day'}`,
    `selectedStart: ${range?.start || 'null'}`,
    `selectedEnd: ${range?.end || 'null'}`,
    `latestAvailableDate: ${latestAvailableDate || 'null'}`,
    `availableDateSpan: ${(availableDates[0] || 'null')} -> ${(latestAvailableDate || 'null')} (${availableDates.length} days)`,
    `lastImportStatus: ${snapshot.importState?.status || 'idle'}`,
    `lastImportSuccessAt: ${snapshot.importState?.lastSuccessAt || 'null'}`,
    `lastImportError: ${snapshot.importState?.lastError?.message || 'none'}`,
    `storageBackend: ${snapshot.storageState?.backend || 'unknown'}`,
    `largeStorePersisted: ${snapshot.storageState?.largeState?.ok ? 'true' : 'false'}`,
    `largeStoreReadable: ${snapshot.storageState?.largeState?.readable ? 'true' : 'false'}`,
    `selectedRangeValid: ${range?.disabled ? 'false' : 'true'}`
  ].join('\n');

  return JSON.stringify(
    {
      summaryBlock,
      loadedDatasetKeys,
      selectedPreset: range?.preset || 'latest-day',
      selectedStart: range?.start || null,
      selectedEnd: range?.end || null,
      latestAvailableDate,
      availableDateSpan: { start: availableDates[0] || null, end: latestAvailableDate, days: availableDates.length },
      parsedFiles: snapshot.ingestReport?.parsedFiles || [],
      rowCounts,
      ingestReport: snapshot.ingestReport || {},
      availabilityMatrix: snapshot.availabilityMatrix || {},
      selectedRange: range,
      pageWarnings,
      lastImportStatus: snapshot.importState?.status || 'idle',
      lastImportSuccessAt: snapshot.importState?.lastSuccessAt || null,
      lastImportSuccess: snapshot.importState?.lastResult || null,
      lastImportError: snapshot.importState?.lastError || null,
      storage: snapshot.storageState || {}
    },
    null,
    2
  );
}

function renderSettingsPage(range, day, rangeRows, rerender) {
  const content = document.getElementById('pageContent');
  if (!content) return;

  content.innerHTML = `
    <section class="card section-card">
      <div class="section-head">
        <h3>Upload</h3>
        <p class="muted">Upload one Oura ZIP file. New uploads replace the cached dataset.</p>
      </div>
      <input id="settingsUploadInput" type="file" accept=".zip,application/zip">
      <div id="uploadStatus" class="small muted top-gap"></div>
    </section>

    <section class="card section-card">
      <div class="section-head">
        <h3>My Health</h3>
        <p class="muted">Long-term overview shells using available data with graceful placeholders.</p>
      </div>
      ${renderMetricGrid([
        { label: 'Long-term overview', value: summarizeRange(range), note: 'Selected analysis window' },
        { label: 'Sleep Health', value: fmt(average(rangeRows.dailySleep, 'score')), note: 'Range avg score' },
        { label: 'Stress Management', value: fmt(average(rangeRows.derivedNightlyVitals, 'hrv_rmssd_proxy_ms'), 1, ' ms'), note: 'Derived proxy' },
        { label: 'Heart Health', value: fmt(average(rangeRows.derivedNightlyVitals, 'rhr_night_bpm'), 1, ' bpm'), note: 'Overnight resting HR' },
        { label: 'Habits and routines', value: '<span class="placeholder">More coming in PR3+</span>', note: 'Section shell in place' }
      ])}
    </section>

    <section class="card section-card">
      <div class="row split-row"><h3>Debug</h3><button id="copyDebugBtn" class="btn secondary" type="button">Copy</button></div>
      <textarea id="debugText" class="debug-text" readonly>${diagnosticsText(range, day, rangeRows)}</textarea>
    </section>
  `;

  const status = content.querySelector('#uploadStatus');
  const uploadInput = content.querySelector('#settingsUploadInput');
  uploadInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    status.textContent = 'Importing...';
    try {
      const next = await runSettingsUploadImport({
        file,
        settings,
        onProgress: (progress) => {
          const importLabel = progress.status === 'loading' ? 'loading' : progress.status;
          status.textContent = `${importLabel}: ${progress.phase} (${progress.percent}%)`;
        }
      });
      status.textContent = `Imported ✓ Loaded ${next.start ? `${next.start} → ${next.end}` : 'no date range'}.`;
      rerender(next);
    } catch (error) {
      status.textContent = `Import failed: ${error?.message || String(error)}`;
      const debugText = content.querySelector('#debugText');
      if (debugText) debugText.value = diagnosticsText(range, day, rangeRows);
    }
  });

  const snapshot = getStoreSnapshot();
  if (snapshot.importState?.status === 'loading') {
    status.textContent = `loading: ${snapshot.importState.phase || 'Reading ZIP'} (${snapshot.importState.percent || 0}%)`;
  } else if (snapshot.importState?.status === 'error' && snapshot.importState?.lastError?.message) {
    status.textContent = `Import failed: ${snapshot.importState.lastError.message}`;
  } else if (snapshot.importState?.status === 'success' && snapshot.ingestReport?.dateRange?.end) {
    status.textContent = `Imported ✓ Loaded ${snapshot.ingestReport.dateRange.start} → ${snapshot.ingestReport.dateRange.end}.`;
  }

  content.querySelector('#copyDebugBtn')?.addEventListener('click', async () => {
    const debugText = content.querySelector('#debugText');
    await navigator.clipboard.writeText(debugText?.value || '');
  });
}

function renderPageShell(app, title, subtitle) {
  const showBanner = shouldRenderIntroBanner(page);
  app.innerHTML = `
    <section class="page-header ${showBanner ? 'card' : ''}">
      <div>
        ${showBanner ? '<p class="eyebrow">Oura dashboard</p>' : ''}
        <h1>${title}</h1>
        ${subtitle ? `<p class="muted">${subtitle}</p>` : ''}
      </div>
    </section>
    <section id="dateRangeMount"></section>
    <section id="pageContent" class="page-stack"></section>
  `;
}

function mountDateRangeControl(availableDates, range, rerender) {
  const mount = document.getElementById('dateRangeMount');
  if (!mount) return;
  renderDateRangeControl(mount, {
    range,
    availableDates,
    onChange: (partial) => {
      const preferred = { ...range, ...partial };
      const next = resolveSelectedRange(availableDates, preferred);
      persistSelectedRange({ preset: next.preset, start: next.start, end: next.end });
      rerender(next);
    }
  });
}

function renderPageContent(range, day, rangeRows, rerender) {
  const content = document.getElementById('pageContent');
  if (!content) return;

  if (page === 'index') {
    content.innerHTML = renderHome(range, day, rangeRows);
    return;
  }

  if (page === 'settings') {
    renderSettingsPage(range, day, rangeRows, rerender);
    return;
  }

  if (page === 'heart-rate') {
    content.innerHTML = renderHeartRatePage(range, day, rangeRows);
    return;
  }

  if (page === 'stress') {
    content.innerHTML = renderStressPage(range, day, rangeRows);
    return;
  }

  if (page === 'readiness') {
    content.innerHTML = renderReadinessPage(range, day, rangeRows);
    return;
  }

  if (page === 'sleep') {
    content.innerHTML = renderSleepPage(range, day, rangeRows);
    return;
  }

  if (page === 'activity') {
    content.innerHTML = renderActivityPage(range, day, rangeRows);
    return;
  }

  content.innerHTML = renderDomainPage(page, range, day, rangeRows);
}

async function bootstrap() {
  installRuntimeDiagnostics({ showPanel: false });
  renderTopNav(document.getElementById('topNav'), location.pathname);

  const purgeSummary = await purgeStaleServiceWorkersAndCaches();
  const purged = (purgeSummary.unregisteredCount || 0) > 0 || (purgeSummary.deletedCaches || []).length > 0;
  if (purged && !hasPurgedReloadFlag()) {
    setPurgedReloadFlag();
    window.location.reload();
    return;
  }

  await hydrateFromPersistence();
  const availableDates = getAvailableDates();
  const persisted = loadSelectedRange();
  const initialRange = resolveSelectedRange(availableDates, persisted);
  persistSelectedRange({ preset: initialRange.preset, start: initialRange.start, end: initialRange.end });

  const app = document.getElementById('app');
  if (!app) throw new Error('Missing app mount node');

  const meta = PAGE_META[page] || PAGE_META.index;
  renderPageShell(app, meta.title, meta.subtitle);

  const rerender = (range) => {
    const currentDates = getAvailableDates();
    const resolved = resolveSelectedRange(currentDates, range);
    persistSelectedRange({ preset: resolved.preset, start: resolved.start, end: resolved.end });
    const rangeRows = resolved.start && resolved.end
      ? getRange(resolved.start, resolved.end)
      : emptyRangeRows();
    const day = resolved.end ? getDay(resolved.end, settings) : null;
    if (!shouldRenderDateRangeForPage(page)) {
      const mount = document.getElementById('dateRangeMount');
      if (mount) mount.innerHTML = '';
    } else {
      mountDateRangeControl(currentDates, resolved, rerender);
    }
    renderPageContent(resolved, day, rangeRows, rerender);
  };

  rerender(initialRange);
  subscribeToStore(() => {
    const persistedRange = loadSelectedRange();
    rerender(persistedRange);
  });
  hideBootShell();
}

bootstrap().catch((error) => {
  setImportError(error, { source: 'bootstrap' });
  console.error(error);
  hideBootShell();
});
