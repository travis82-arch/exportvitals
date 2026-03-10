import { renderTopNav } from './components/TopNav.js';
import { createImportController } from './components/ImportController.js';
import {
  loadFromLocalCache,
  importZip,
  getAvailableDates,
  getDay,
  getRange,
  getBaseline,
  getStoreSnapshot,
  setUiSnapshot,
  setImportError
} from './store/dataStore.js';
import { getLastAvailableDays, loadSelectedDate, persistSelectedDate, resolveInitialSelectedDate } from './state/selectedDate.js';
import { loadSettings, saveSettings } from './state/settings.js';
import { byDateUiMapping } from './mappings/byDateUiMapping.js';
import { sleepUiMapping } from './mappings/sleepUiMapping.js';
import { readinessUiMapping } from './mappings/readinessUiMapping.js';
import { activityUiMapping } from './mappings/activityUiMapping.js';
import { vitalsUiMapping } from './mappings/vitalsUiMapping.js';
import { trendsUiMapping } from './mappings/trendsUiMapping.js';
import { journalUiMapping } from './mappings/journalUiMapping.js';
import { importUiMapping } from './mappings/importUiMapping.js';
import { exportUiMapping } from './mappings/exportUiMapping.js';
import { settingsUiMapping } from './mappings/settingsUiMapping.js';
import { debugUiMapping } from './mappings/debugUiMapping.js';
import { renderAxisLineChart } from './charts/AxisLineChart.js';
import { renderAxisBarChart } from './charts/AxisBarChart.js';
import { renderSleepStageChart } from './charts/SleepStageChart.js';
import { toCsv } from './vitals-core.mjs';
import { installRuntimeDiagnostics } from './state/runtimeDiagnostics.js';
import { resetLocalData } from './storage/resetLocalData.js';
import { hasPurgedReloadFlag, purgeStaleServiceWorkersAndCaches, setPurgedReloadFlag } from './boot/swPurge.js';

const JOURNAL_KEY = 'ouraJournalEntriesV1';
const page = document.body.dataset.page || 'index';
const notAvailable = '<span class="placeholder">Not available in this export</span>';

const fmt = (value, unit = '', digits = 1) => {
  if (value == null || Number.isNaN(Number(value))) return notAvailable;
  const n = Number(value);
  const precision = Number.isInteger(n) && digits > 0 ? 0 : digits;
  return `${n.toFixed(precision)}${unit}`;
};

const titleCase = (value) => value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const fmtDuration = (seconds) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return notAvailable;
  const total = Math.max(0, Math.round(Number(seconds)));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h} h ${m} m`;
};

const fmtMinutes = (seconds) => {
  if (seconds == null || !Number.isFinite(Number(seconds))) return notAvailable;
  return `${Math.round(Number(seconds) / 60)} min`;
};

const percentOf = (part, total) => (part != null && total ? `${Math.round((Number(part) / Number(total)) * 100)}%` : '—');

const renderDateStrip = (selectedDate) => {
  const days = getLastAvailableDays(getAvailableDates(), 7);
  if (!days.length) return '<div class="small muted">No dates available yet. Import a ZIP first.</div>';
  return `<div class="date-strip">${days.map((d) => `<a class="btn ${d === selectedDate ? 'active' : ''}" href="${location.pathname}?date=${d}">${d}</a>`).join('')}</div>`;
};

const avg = (rows, key) => (rows.length ? rows.reduce((sum, row) => sum + (row[key] ?? 0), 0) / rows.length : null);

function showToast(message, kind = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${kind === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function cacheBustReload() {
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now().toString());
  window.location.replace(`${url.pathname}${url.search}${url.hash}`);
}

function lineChart(rows, key, label, suffix = '') {
  const points = rows
    .map((row, index) => ({ x: index, y: row[key] }))
    .filter((point) => point.y != null && Number.isFinite(Number(point.y)));
  if (!points.length) return `<div class="kpi"><div class="kpi-label">${label}</div><div class="placeholder">No data in selected range</div></div>`;
  const min = Math.min(...points.map((p) => p.y));
  const max = Math.max(...points.map((p) => p.y));
  const poly = points
    .map((p) => `${(p.x / Math.max(points.length - 1, 1)) * 320},${100 - ((p.y - min) / Math.max(max - min, 1)) * 80}`)
    .join(' ');
  return `<div class="kpi"><div class="kpi-label">${label}</div><svg class="chart" viewBox="0 0 320 100"><polyline fill="none" stroke="#60a5fa" stroke-width="2" points="${poly}"/></svg><div class="small muted">Latest ${fmt(points.at(-1).y, suffix)}</div></div>`;
}

function lineChartSeries(series, label, suffix = '') {
  const points = (series || [])
    .map((point, index) => ({ x: index, y: point?.bpm }))
    .filter((point) => point.y != null && Number.isFinite(Number(point.y)));
  if (!points.length) return `<div class="kpi"><div class="kpi-label">${label}</div><div class="placeholder">No overnight heart-rate points in selected window</div></div>`;
  const min = Math.min(...points.map((p) => p.y));
  const max = Math.max(...points.map((p) => p.y));
  const poly = points
    .map((p) => `${(p.x / Math.max(points.length - 1, 1)) * 320},${100 - ((p.y - min) / Math.max(max - min, 1)) * 80}`)
    .join(' ');
  return `<div class="kpi"><div class="kpi-label">${label}</div><svg class="chart" viewBox="0 0 320 100"><polyline fill="none" stroke="#60a5fa" stroke-width="2" points="${poly}"/></svg><div class="small muted">Points ${points.length} · Range ${fmt(min, suffix)} to ${fmt(max, suffix)}</div></div>`;
}

function scoreBand(score) {
  if (score == null) return 'Not available';
  if (score >= 85) return 'Optimal';
  if (score >= 70) return 'Good';
  if (score >= 55) return 'Fair';
  return 'Pay attention';
}

function formatTemperature(value) {
  if (value == null || Number.isNaN(Number(value))) return notAvailable;
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)} C`;
}

function formatTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function toHrvProxySeries(heartRateSeries) {
  const series = (heartRateSeries || []).map((point) => ({
    t: point.t,
    rr: point.bpm ? 60000 / point.bpm : null
  })).filter((point) => point.rr != null);

  const output = [];
  for (let i = 2; i < series.length; i += 1) {
    const d1 = series[i].rr - series[i - 1].rr;
    const d2 = series[i - 1].rr - series[i - 2].rr;
    const rmssd = Math.sqrt((d1 ** 2 + d2 ** 2) / 2);
    output.push({ t: series[i].t, v: rmssd });
  }
  return output;
}

function renderReadinessChart({ title, primary, secondary, series, unit = '', yMin = null, yMax = null }) {
  const values = (series || []).map((point) => point.v).filter((value) => value != null && Number.isFinite(Number(value)));
  const hasSeries = values.length > 1;
  const min = yMin ?? (hasSeries ? Math.min(...values) : 0);
  const max = yMax ?? (hasSeries ? Math.max(...values) : 100);
  const span = Math.max(max - min, 1);
  const points = hasSeries
    ? series
        .map((point, index) => {
          const x = (index / Math.max((series.length || 1) - 1, 1)) * 100;
          const y = 100 - ((point.v - min) / span) * 80 - 10;
          return `${x},${Math.max(8, Math.min(94, y))}`;
        })
        .join(' ')
    : '';

  const firstTime = hasSeries ? formatTime(series[0].t) : '';
  const lastTime = hasSeries ? formatTime(series.at(-1).t) : '';

  return `<section class="readiness-detail-card">
    <div class="readiness-detail-header">
      <div class="readiness-detail-title">${title}</div>
      <button type="button" class="readiness-pill">Why the gaps?</button>
    </div>
    <div class="readiness-detail-value">${primary}</div>
    <div class="readiness-detail-sub">${secondary || ''}</div>
    ${hasSeries ? `<svg class="readiness-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
      <line x1="0" y1="25" x2="100" y2="25"></line>
      <line x1="0" y1="50" x2="100" y2="50"></line>
      <line x1="0" y1="75" x2="100" y2="75"></line>
      <polyline points="${points}"></polyline>
    </svg>` : `<div class="placeholder readiness-chart-empty">Not enough overnight points for chart.</div>`}
    <div class="readiness-chart-labels">
      <span>${firstTime}</span>
      <span>${lastTime}</span>
    </div>
  </section>`;
}

function loadJournalEntries(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.getItem) return [];
  try {
    const parsed = JSON.parse(storage.getItem(JOURNAL_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveJournalEntries(entries, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.setItem) return;
  storage.setItem(JOURNAL_KEY, JSON.stringify(entries));
}

function renderJournalList(entries) {
  if (!entries.length) return '<div class="placeholder">No journal entries yet.</div>';
  return `<div class="journal-list">${entries
    .map(
      (entry) => `<article class="card"><div class="row split-row"><strong>${entry.date || 'n/a'}</strong><span class="small muted">${entry.createdAt || ''}</span></div><div class="small"><strong>Tag:</strong> ${entry.tag || 'none'}</div><div class="small"><strong>Note:</strong> ${entry.note || 'none'}</div></article>`
    )
    .join('')}</div>`;
}

function rangeSummary(ingestReport) {
  const range = ingestReport?.dateRange || {};
  return `Data loaded: ${range.start || 'n/a'} -> ${range.end || 'n/a'} (${range.days || 0} days)`;
}

installRuntimeDiagnostics({ showPanel: false });

async function bootstrap() {
  try {
    const purgeSummary = await purgeStaleServiceWorkersAndCaches();
    const purgedAnything = (purgeSummary.unregisteredCount || 0) > 0 || (purgeSummary.deletedCaches || []).length > 0;

    if (purgedAnything && !hasPurgedReloadFlag()) {
      setPurgedReloadFlag();
      showToast('Cleared old app cache. Reloading...');
      setTimeout(() => cacheBustReload(), 350);
      throw new Error('Reloading after stale cache purge');
    }

  renderTopNav(document.getElementById('topNav'), location.pathname);
  loadFromLocalCache();

  const settings = loadSettings();
  const dates = getAvailableDates();
  const preferred = new URLSearchParams(location.search).get('date') || loadSelectedDate() || null;
  const selectedDate = resolveInitialSelectedDate(dates, preferred);
  if (selectedDate) persistSelectedDate(selectedDate);
  const day = selectedDate ? getDay(selectedDate, settings) : null;
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing #app mount node');

  const importController = createImportController({
    importZip: (file, onProgress) => importZip(file, settings, onProgress),
    onImported: () => location.reload(),
    onStateChange: () => {}
  });

  const globalInput = document.getElementById('globalImportInput');
  globalInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await importController.openWithFile(file);
  });

  if (page === 'index') {
    app.innerHTML = `<section class="card"><h2>By Date</h2>${renderDateStrip(selectedDate)}<div class="grid compact">
      <div class="kpi"><div class="kpi-label">Readiness score</div><div class="kpi-value">${fmt(day?.dailyReadiness?.score, '', 0)}</div></div>
      <div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day?.dailySleep?.score, '', 0)}</div></div>
      <div class="kpi"><div class="kpi-label">Activity score</div><div class="kpi-value">${fmt(day?.dailyActivity?.score, '', 0)}</div></div>
      <div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.rhr_night_bpm, ' bpm')}</div></div>
      <div class="kpi"><div class="kpi-label">Estimated HRV (RMSSD proxy)</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div></div>
      <div class="kpi"><div class="kpi-label">SpO2 Night Avg</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div></div>
      <div class="kpi"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(day?.dailyReadiness?.temperatureDeviation, ' C')}</div></div>
      <div class="kpi"><div class="kpi-label">Quick insight</div><div class="small muted">Window ${day?.heartRateWindowSummary?.modeUsed || 'n/a'} · HR points ${day?.heartRateWindowSummary?.points ?? 0}</div></div>
    </div></section>`;
  } else if (page === 'sleep') {
    const sm = day?.sleepModel;
    const timingScore = day?.dailySleep?.contributors?.timing;
    const restfulnessScore = day?.dailySleep?.contributors?.restfulness;
    const timingLabel = scoreBand(timingScore);
    const restfulnessLabel = scoreBand(restfulnessScore);
    const contributorRows = [
      ['Total sleep', fmtDuration(sm?.totalSleepSec)],
      ['Efficiency', sm?.efficiencyPct != null ? `${Math.round(sm.efficiencyPct)}%` : notAvailable],
      ['Restfulness', restfulnessScore != null ? `${restfulnessLabel} (${Math.round(restfulnessScore)})` : 'Not available yet'],
      ['REM sleep', sm?.remSec != null ? `${fmtDuration(sm.remSec)} (${percentOf(sm.remSec, sm?.totalSleepSec)})` : notAvailable],
      ['Deep sleep', sm?.deepSec != null ? `${fmtDuration(sm.deepSec)} (${percentOf(sm.deepSec, sm?.totalSleepSec)})` : notAvailable],
      ['Latency', fmtMinutes(sm?.latencySec)],
      ['Timing', timingScore != null ? `${timingLabel} (${Math.round(timingScore)})` : 'Not available yet']
    ];
    const range14 = selectedDate ? getRange(dates[Math.max(0, dates.indexOf(selectedDate) - 13)] || selectedDate, selectedDate) : { sleepModel: [] };
    const sleepRows14 = (range14.sleepModel || []).filter((r) => r?.totalSleepSec != null);
    const debtSec = Math.max(0, 8 * 3600 * 14 - sleepRows14.reduce((sum, row) => sum + Number(row.totalSleepSec || 0), 0));
    const debtPct = Math.min(100, Math.round((debtSec / (8 * 3600 * 14)) * 100));
    const bdi = day?.dailySpo2?.breathingDisturbanceIndex;
    const bdiLabel = bdi == null ? 'Not available yet' : (bdi <= 5 ? 'Regular breathing' : bdi <= 15 ? 'Some disturbances' : 'Frequent disturbances');
    const hrSeries = day?.sleepHrSeries || [];
    const hrHasNulls = hrSeries.some((p) => p?.v == null);
    const hrvSeries = day?.sleepHrvSeries || [];

    app.innerHTML = `<section class="card"><h2>Sleep</h2>${renderDateStrip(selectedDate)}
      <div class="grid compact">
        <div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day?.dailySleep?.score, '', 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Timing</div><div class="kpi-value">${timingScore != null ? Math.round(timingScore) : notAvailable}</div><div class="small muted">${timingLabel}</div><div class="small muted">Show more</div></div>
      </div>
      <h3>Sleep contributors</h3>
      ${contributorRows.map(([label, value]) => `<div class="contributor-row"><div class="small">${label}: ${value}</div></div>`).join('')}
      <h3>Key metrics</h3>
      <div class="grid compact">
        <div class="kpi"><div class="kpi-label">TOTAL SLEEP TIME</div><div class="kpi-value">${fmtDuration(sm?.totalSleepSec)}</div></div>
        <div class="kpi"><div class="kpi-label">TIME IN BED</div><div class="kpi-value">${fmtDuration(sm?.timeInBedSec)}</div></div>
        <div class="kpi"><div class="kpi-label">SLEEP EFFICIENCY</div><div class="kpi-value">${sm?.efficiencyPct != null ? `${Math.round(sm.efficiencyPct)}%` : notAvailable}</div></div>
        <div class="kpi"><div class="kpi-label">RESTING HEART RATE</div><div class="kpi-value">${sm?.lowestHeartRate != null ? `${Math.round(sm.lowestHeartRate)} bpm` : notAvailable}</div></div>
      </div>
      <h3>Estimated sleep debt</h3>
      <div class="kpi"><div class="small muted">None</div><div class="progress"><span style="width:${debtPct}%"></span></div><div class="small muted">High · ${fmtDuration(debtSec)}</div></div>
      <h3>Details</h3>
      <div class="grid compact">
        <div class="kpi"><div class="kpi-label">TIME ASLEEP</div><div class="kpi-value">${fmtDuration(sm?.totalSleepSec)}</div></div>
        <div class="kpi"><div class="kpi-label">Total duration</div><div class="kpi-value">${fmtDuration(sm?.timeInBedSec)}</div></div>
      </div>
      ${renderSleepStageChart({ stages: day?.sleepStages || [] })}
      ${renderAxisBarChart({ title: 'Movement', series: (day?.sleepMovement || []).map((p) => ({ tMs: p.tMs, v: p.v })), yTicks: [0,1,2,3,4], yLabelFormatter: (v) => String(v), height: 160 })}
      <div class="grid compact">
        <div class="kpi"><div class="kpi-label">Awake</div><div class="kpi-value">${fmtDuration(sm?.awakeSec)}</div><div class="small muted">${percentOf(sm?.awakeSec, sm?.timeInBedSec)}</div></div>
        <div class="kpi"><div class="kpi-label">REM</div><div class="kpi-value">${fmtDuration(sm?.remSec)}</div><div class="small muted">${percentOf(sm?.remSec, sm?.totalSleepSec)}</div></div>
        <div class="kpi"><div class="kpi-label">Light</div><div class="kpi-value">${fmtDuration(sm?.lightSec)}</div><div class="small muted">${percentOf(sm?.lightSec, sm?.totalSleepSec)}</div></div>
        <div class="kpi"><div class="kpi-label">Deep</div><div class="kpi-value">${fmtDuration(sm?.deepSec)}</div><div class="small muted">${percentOf(sm?.deepSec, sm?.totalSleepSec)}</div></div>
      </div>
      <h3>Breathing</h3>
      <div class="grid compact">
        <div class="kpi"><div class="kpi-label">Average blood oxygen</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div></div>
        <div class="kpi"><div class="kpi-label">Breathing regularity</div><div class="kpi-value">${bdiLabel}</div><div class="small muted">BDI ${fmt(bdi)}</div></div>
      </div>
      <h3>Lowest heart rate</h3>
      <div class="grid compact">
        <div class="kpi"><div class="kpi-label">Lowest</div><div class="kpi-value">${sm?.lowestHeartRate != null ? `${Math.round(sm.lowestHeartRate)} bpm` : notAvailable}</div></div>
        <div class="kpi"><div class="kpi-label">Average</div><div class="kpi-value">${sm?.avgHeartRate != null ? `${Math.round(sm.avgHeartRate)} bpm` : notAvailable}</div></div>
      </div>
      ${renderAxisLineChart({ title: 'Heart rate', series: hrSeries, yUnit: 'bpm', yDomainConfig: { minRange: 12, padPct: 0.08 }, height: 170 })}
      <h3>Average HRV</h3>
      <div class="grid compact"><div class="kpi"><div class="kpi-label">Average</div><div class="kpi-value">${sm?.avgHrv != null ? `${Math.round(sm.avgHrv)} ms` : notAvailable}</div></div></div>
      ${renderAxisLineChart({ title: 'HRV', series: hrvSeries, yUnit: 'ms', yDomainConfig: { minRange: 40, padPct: 0.12 }, height: 160 })}
      ${hrHasNulls ? '<div class="small muted">Why the gaps? Missing values are preserved from source series.</div>' : ''}
    </section>`;
  } else if (page === 'readiness') {
    const contributors = day?.dailyReadiness?.contributors || {};
    const readinessScore = day?.dailyReadiness?.score ?? null;
    const temp = day?.dailyReadiness?.temperatureDeviation;
    const contributorOrder = [
      { key: 'resting_heart_rate', label: 'Resting heart rate' },
      { key: 'hrv_balance', label: 'HRV balance' },
      { key: 'body_temperature', label: 'Body temperature' },
      { key: 'recovery_index', label: 'Recovery index' },
      { key: 'previous_night', label: 'Previous night' },
      { key: 'sleep_balance', label: 'Sleep balance' },
      { key: 'sleep_regularity', label: 'Sleep regularity' },
      { key: 'previous_day_activity', label: 'Previous day activity' },
      { key: 'activity_balance', label: 'Activity balance' }
    ];
    const contributorRows = contributorOrder.map((item) => {
      const score = contributors[item.key];
      const display = score == null ? 'Not available yet' : `${scoreBand(score)} (${Math.round(score)})`;
      return `<div class="readiness-contributor-row">
        <div class="readiness-contributor-head"><span>${item.label}</span><span>${display}</span></div>
        <div class="readiness-rail"><span style="width:${Math.max(0, Math.min(100, score || 0))}%"></span></div>
      </div>`;
    }).join('');

    const hrSeries = day?.sleepHrSeries || [];
    const hrvSeries = day?.sleepHrvSeries || [];
    app.innerHTML = `<section class="readiness-page">
      <section class="readiness-hero">
        <div class="readiness-score-row"><div class="readiness-score">${fmt(readinessScore, '', 0)}</div><div class="readiness-band">${scoreBand(readinessScore).toUpperCase()}</div></div>
      </section>
      <section class="readiness-section"><h3>Contributors</h3>${contributorRows}</section>
      <section class="readiness-section"><h3>Key metrics</h3><div class="readiness-metric-grid">
        <article class="readiness-metric-card"><div class="readiness-metric-label">RESTING HEART RATE</div><div class="readiness-metric-value">${day?.sleepModel?.lowestHeartRate != null ? `${Math.round(day.sleepModel.lowestHeartRate)} bpm` : notAvailable}</div></article>
        <article class="readiness-metric-card"><div class="readiness-metric-label">HRV</div><div class="readiness-metric-value">${day?.sleepModel?.avgHrv != null ? `${Math.round(day.sleepModel.avgHrv)} ms` : notAvailable}</div></article>
        <article class="readiness-metric-card"><div class="readiness-metric-label">BODY TEMPERATURE</div><div class="readiness-metric-value">${formatTemperature(temp)}</div></article>
        <article class="readiness-metric-card"><div class="readiness-metric-label">RESPIRATORY RATE</div><div class="readiness-metric-value">${day?.sleepModel?.avgBreath != null ? `${Number(day.sleepModel.avgBreath).toFixed(1)} /min` : notAvailable}</div></article>
      </div></section>
      <section class="readiness-section"><h3>Details</h3>
        ${renderAxisLineChart({ title: 'Lowest heart rate', series: hrSeries, yUnit: 'bpm', yDomainConfig: { minRange: 12, padPct: 0.08 }, height: 150 })}
        ${renderAxisLineChart({ title: 'Average HRV', series: hrvSeries, yUnit: 'ms', yDomainConfig: { minRange: 40, padPct: 0.12 }, height: 150 })}
      </section>
    </section>`;
  } else if (page === 'activity') {
    const a = day?.dailyActivity || {};
    const contributors = a?.contributors || {};
    const label = (score) => score == null ? 'Not available yet' : scoreBand(score);
    const movementSeries = (day?.activityClassSeries || []).map((p) => ({ tMs: p.tMs, v: p.level }));
    const index = dates.indexOf(selectedDate);
    const start = dates[Math.max(0, index - 6)] || selectedDate;
    const weekRows = getRange(start, selectedDate).dailyActivity || [];
    const weekBars = weekRows.map((r, i) => ({ tMs: new Date(`${r.date}T12:00:00`).getTime() + i, v: ((r.mediumActivityTime || 0) + (r.highActivityTime || 0)) / 60 }));
    const zone = {
      z0: (a.sedentaryTime || 0) / 60,
      z1: (a.lowActivityTime || 0) / 60,
      z2: (a.mediumActivityTime || 0) / 60,
      z3: (a.highActivityTime || 0) / 60,
      z4: 0,
      z5: 0
    };
    app.innerHTML = `<section class="card"><h2>Activity</h2>${renderDateStrip(selectedDate)}
      <div class="grid compact">
        <div class="kpi"><div class="kpi-label">Activity score</div><div class="kpi-value">${fmt(a.score, '', 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Goal progress</div><div class="kpi-value">${a.totalCalories != null && a.targetCalories ? `${Math.round((a.totalCalories / a.targetCalories) * 100)}%` : notAvailable}</div><div class="small muted">${fmt(a.totalCalories, ' cal', 0)} / ${fmt(a.targetCalories, ' cal', 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Total burn</div><div class="kpi-value">${fmt(a.totalCalories, ' cal', 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Activity time</div><div class="kpi-value">${fmtDuration((a.mediumActivityTime || 0) + (a.highActivityTime || 0))}</div></div>
        <div class="kpi"><div class="kpi-label">Steps</div><div class="kpi-value">${fmt(a.steps, '', 0)}</div></div>
      </div>
      <h3>Contributors</h3>
      <div class="grid compact">
        <div class="kpi"><div class="kpi-label">Stay active</div><div class="small muted">${fmtDuration(a.sedentaryTime)} inactivity</div><div class="small muted">${label(contributors.stay_active)}</div></div>
        <div class="kpi"><div class="kpi-label">Move every hour</div><div class="small muted">${fmt(a.inactivityAlerts, '', 0)} alerts</div><div class="small muted">${label(contributors.move_every_hour)}</div></div>
        <div class="kpi"><div class="kpi-label">Meet daily goals</div><div class="small muted">${a.metersToTarget != null ? `${Math.round(a.metersToTarget)} m to target` : 'Progress from calories'}</div><div class="small muted">${label(contributors.meet_daily_targets || contributors.meet_daily_goals)}</div></div>
        <div class="kpi"><div class="kpi-label">Training frequency</div><div class="small muted">${label(contributors.training_frequency)}</div></div>
        <div class="kpi"><div class="kpi-label">Training volume</div><div class="small muted">${label(contributors.training_volume)}</div></div>
        <div class="kpi"><div class="kpi-label">Recovery time</div><div class="small muted">${label(contributors.recovery_time)}</div></div>
      </div>
      ${renderAxisBarChart({ title: 'Daily movement (5 min bins)', series: movementSeries, yTicks: [0, 1, 2, 3, 4], yLabelFormatter: (v) => ['None','Low','Medium','High',''].at(v) || String(v), height: 180 })}
      ${renderAxisBarChart({ title: 'This week activity time (min)', series: weekBars, yDomainConfig: { minRange: 30, padPct: 0.1 }, height: 150 })}
      <section class="kpi"><div class="kpi-label">Weekly zone minutes</div>
        ${Object.entries(zone).map(([k,v]) => `<div class="row split-row"><span class="small">${k.toUpperCase()}</span><span class="small muted">${Math.round(v)} min</span></div><div class="progress"><span style="width:${Math.min(100, (v / Math.max(...Object.values(zone), 1)) * 100)}%"></span></div>`).join('')}
      </section>
    </section>`;
  } else if (page === 'vitals') {
    const baseline = {
      rhr: getBaseline('rhr_night_bpm', settings.baselineWindow, selectedDate),
      hrv: getBaseline('hrv_rmssd_proxy_ms', settings.baselineWindow, selectedDate),
      spo2: getBaseline('spo2Average', settings.baselineWindow, selectedDate)
    };
    const rhr = day?.derivedNightlyVitals?.rhr_night_bpm;
    const hrv = day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms;
    const rhrDelta = rhr != null && baseline.rhr != null ? rhr - baseline.rhr : null;
    const hrvDelta = hrv != null && baseline.hrv != null ? hrv - baseline.hrv : null;
    app.innerHTML = `<section class="card"><h2>Vitals</h2>${renderDateStrip(selectedDate)}<div class="grid compact">
      <div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(rhr, ' bpm')}</div><div class="small muted">Baseline ${fmt(baseline.rhr, ' bpm')} · Delta ${fmt(rhrDelta, ' bpm')}</div></div>
      <div class="kpi"><div class="kpi-label">HRV proxy</div><div class="kpi-value">${fmt(hrv, ' ms')}</div><div class="small muted">Baseline ${fmt(baseline.hrv, ' ms')} · Delta ${fmt(hrvDelta, ' ms')}</div></div>
      <div class="kpi"><div class="kpi-label">SpO2</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div><div class="small muted">Baseline ${fmt(baseline.spo2, '%')}</div></div>
      <div class="kpi"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(day?.dailyReadiness?.temperatureDeviation, ' C')}</div></div>
    </div></section>`;
  } else if (page === 'trends') {
    const windowDays = Number(new URLSearchParams(location.search).get('window') || '14');
    const index = dates.indexOf(selectedDate);
    const start = dates[Math.max(0, index - (windowDays - 1))] || selectedDate;
    const range = getRange(start, selectedDate);
    const makeBtn = (n) => `<a class="btn ${windowDays === n ? 'active' : ''}" href="${location.pathname}?window=${n}&date=${selectedDate}">${n}d</a>`;
    app.innerHTML = `<section class="card"><h2>Trends</h2><div class="row">${[7, 14, 30, 90].map(makeBtn).join('')}</div><div class="grid compact">
      ${lineChart(range.dailyReadiness, 'score', 'Readiness score')}
      ${lineChart(range.dailySleep, 'score', 'Sleep score')}
      ${lineChart(range.dailyActivity, 'score', 'Activity score')}
      ${lineChart(range.derivedNightlyVitals, 'rhr_night_bpm', 'RHR', ' bpm')}
      ${lineChart(range.derivedNightlyVitals, 'hrv_rmssd_proxy_ms', 'HRV', ' ms')}
      ${lineChart(range.dailySpo2, 'spo2Average', 'SpO2', '%')}
      ${lineChart(range.dailyReadiness, 'temperatureDeviation', 'Temp deviation', ' C')}
    </div></section>`;
  } else if (page === 'journal') {
    const entries = loadJournalEntries()
      .slice()
      .sort((a, b) => `${b.date || ''}${b.createdAt || ''}`.localeCompare(`${a.date || ''}${a.createdAt || ''}`));
    app.innerHTML = `<section class="card"><h2>Journal</h2>
      <form id="journalForm" class="grid">
        <label class="field"><span>Date</span><input type="date" name="date" value="${selectedDate || new Date().toISOString().slice(0, 10)}" required /></label>
        <label class="field"><span>Tag</span><input type="text" name="tag" placeholder="e.g. caffeine, late meal" /></label>
        <label class="field"><span>Note</span><textarea name="note" rows="3" placeholder="What happened today?"></textarea></label>
        <div class="row"><button class="btn" type="submit">Save entry</button></div>
      </form>
    </section>
    <section class="card"><h3>Entries</h3>${renderJournalList(entries)}</section>`;

    document.getElementById('journalForm')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const nextEntries = loadJournalEntries();
      nextEntries.push({
        id: crypto.randomUUID(),
        date: String(formData.get('date') || ''),
        tag: String(formData.get('tag') || '').trim(),
        note: String(formData.get('note') || '').trim(),
        createdAt: new Date().toISOString()
      });
      saveJournalEntries(nextEntries);
      location.reload();
    });
  } else if (page === 'data-tools-import') {
    const snapshot = getStoreSnapshot();
    app.innerHTML = `<section class="card"><h2>Import</h2>
      <div class="row"><button class="btn" id="chooseZip">Choose ZIP</button></div>
      <div class="status" id="fallbackImportStatus">Idle</div>
      <div id="importSuccessBanner" class="import-banner" hidden></div>
      <details class="card">
        <summary>Troubleshooting</summary>
        <div class="row top-gap">
          <label for="fallbackImportInput" class="small muted">Fallback input:</label>
          <input id="fallbackImportInput" type="file" accept=".zip,application/zip" />
        </div>
      </details>
      <pre class="status" id="importReport">${JSON.stringify(snapshot.ingestReport || {}, null, 2)}</pre>
    </section>`;

    document.getElementById('chooseZip')?.addEventListener('click', () => {
      document.getElementById('globalImportInput')?.click();
    });
    document.getElementById('fallbackImportInput')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      const status = document.getElementById('fallbackImportStatus');
      const report = document.getElementById('importReport');
      const banner = document.getElementById('importSuccessBanner');
      status.textContent = `Reading ${file.name}...`;

      try {
        const result = await importZip(file, settings, (progress) => {
          status.textContent = `${progress.phase} (${progress.percent}%)`;
        });
        const summary = rangeSummary(result);
        status.textContent = `Import done. ${summary}`;
        if (report) report.textContent = JSON.stringify(result || {}, null, 2);
        if (banner) {
          banner.hidden = false;
          banner.textContent = summary;
        }
        showToast('Import complete. Reloading...');
        setTimeout(() => window.location.reload(), 900);
      } catch (error) {
        const message = error?.message || String(error);
        status.textContent = `Import failed: ${message}`;
        if (report) report.textContent = JSON.stringify({ error: message, stack: error?.stack || null }, null, 2);
        showToast(`Import failed: ${message}`, 'error');
      }
    });
  } else if (page === 'data-tools-export') {
    const snapshot = getStoreSnapshot();
    setUiSnapshot({
      generatedAt: new Date().toISOString(),
      selectedDate,
      data: snapshot.datasets,
      derivedNightlyVitals: snapshot.derivedNightlyVitals,
      ingestReport: snapshot.ingestReport
    });
    app.innerHTML = `<section class="card"><h2>Export</h2><div class="row"><button class="btn" id="csvExport">derived_nightly_vitals.csv</button><button class="btn" id="jsonExport">normalized_all.json</button></div></section>`;

    document.getElementById('csvExport')?.addEventListener('click', () => {
      const blob = new Blob([toCsv(snapshot.derivedNightlyVitals || [])], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'derived_nightly_vitals.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    document.getElementById('jsonExport')?.addEventListener('click', () => {
      const data = {
        metadata: { generatedAt: new Date().toISOString(), selectedDate },
        uiSnapshot: snapshot.uiSnapshot,
        ingestReport: snapshot.ingestReport,
        datasets: snapshot.datasets,
        derivedNightlyVitals: snapshot.derivedNightlyVitals
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'normalized_all.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });
  } else if (page === 'glossary') {
    const rows = [
      ...byDateUiMapping,
      ...sleepUiMapping,
      ...readinessUiMapping,
      ...activityUiMapping,
      ...vitalsUiMapping,
      ...trendsUiMapping,
      ...journalUiMapping,
      ...importUiMapping,
      ...exportUiMapping,
      ...settingsUiMapping,
      ...debugUiMapping
    ];
    app.innerHTML = `<section class="card"><h2>Glossary</h2><table class="simple-table"><thead><tr><th>Page</th><th>UI element</th><th>Source paths</th><th>Transform</th><th>Fallback</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.page} / ${row.section}</td><td>${row.element}</td><td>${(row.sourcePaths || []).join('<br/>')}</td><td>${row.transform || ''}</td><td>${row.fallback || ''}</td></tr>`).join('')}</tbody></table></section>`;
  } else if (page === 'settings') {
    const snapshot = getStoreSnapshot();
    app.innerHTML = `<section class="card"><h2>Settings</h2>
      <form id="settingsForm" class="grid">
        <label class="field"><span>Baseline window (days)</span><input type="number" min="3" max="90" name="baselineWindow" value="${settings.baselineWindow}" /></label>
        <label class="field"><span>Night window mode</span><select name="nightWindowMode"><option value="auto" ${settings.nightWindowMode === 'auto' ? 'selected' : ''}>auto</option><option value="sleep-time" ${settings.nightWindowMode === 'sleep-time' ? 'selected' : ''}>sleep-time</option><option value="settings" ${settings.nightWindowMode === 'settings' ? 'selected' : ''}>settings</option></select></label>
        <label class="field"><span>Fallback start</span><input type="time" name="fallbackStart" value="${settings.fallbackStart}" /></label>
        <label class="field"><span>Fallback end</span><input type="time" name="fallbackEnd" value="${settings.fallbackEnd}" /></label>
        <label class="field checkbox-row"><span>Developer mode</span><input type="checkbox" name="developerMode" ${settings.developerMode ? 'checked' : ''} /></label>
      </form>
      <div id="settingsStatus" class="small muted">Saved settings are applied instantly.</div>
      <div class="row"><button class="btn" id="clearAppCacheBtn" type="button">Clear app cache</button></div>
    </section>
    <section class="card"><h3>Availability matrix</h3><pre class="status">${JSON.stringify(snapshot.availabilityMatrix || {}, null, 2)}</pre></section>`;

    const form = document.getElementById('settingsForm');
    const status = document.getElementById('settingsStatus');
    const persist = () => {
      const data = new FormData(form);
      const baselineWindowRaw = Number(data.get('baselineWindow'));
      const baselineWindow = Number.isFinite(baselineWindowRaw) ? baselineWindowRaw : settings.baselineWindow;
      const next = {
        baselineWindow: Math.max(3, Math.min(90, baselineWindow)),
        nightWindowMode: String(data.get('nightWindowMode') || settings.nightWindowMode),
        fallbackStart: String(data.get('fallbackStart') || settings.fallbackStart),
        fallbackEnd: String(data.get('fallbackEnd') || settings.fallbackEnd),
        developerMode: form.elements.namedItem('developerMode')?.checked || false
      };
      Object.assign(settings, saveSettings(next));
      status.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
    };
    form?.addEventListener('input', persist);
    form?.addEventListener('change', persist);

    document.getElementById('clearAppCacheBtn')?.addEventListener('click', async () => {
      await purgeStaleServiceWorkersAndCaches();
      resetLocalData();
      cacheBustReload();
    });
  } else if (page === 'debug') {
    const snapshot = getStoreSnapshot();
    const datasetCounts = Object.fromEntries(Object.entries(snapshot.datasets || {}).map(([name, rows]) => [name, rows.length]));
    const diagnostics = window.__ouraDiag || {};
    app.innerHTML = `<section class="card"><h2>Debug</h2>
      <h3>Dataset row counts</h3><pre class="status">${JSON.stringify({ ...datasetCounts, derivedNightlyVitals: (snapshot.derivedNightlyVitals || []).length }, null, 2)}</pre>
      <h3>ingestReport</h3><pre class="status">${JSON.stringify(snapshot.ingestReport || {}, null, 2)}</pre>
      <h3>Availability matrix</h3><pre class="status">${JSON.stringify(snapshot.availabilityMatrix || {}, null, 2)}</pre>
      <h3>Runtime diagnostics</h3>
      <pre class="status">${JSON.stringify(
        {
          overlayProbe: diagnostics.overlayProbe || null,
          lastErrors: (diagnostics.errors || []).slice(-5),
          lastRejections: (diagnostics.rejections || []).slice(-5),
          lastClicks: (diagnostics.clicks || []).slice(-10)
        },
        null,
        2
      )}</pre>
    </section>`;
  } else {
    app.innerHTML = `<section class="card"><h2>${titleCase(page)}</h2><p class="muted">Content available in dashboard tabs.</p></section>`;
  }

    document.documentElement.dataset.js = '1';
    window.addEventListener('unhandledrejection', (event) => setImportError(event.reason || new Error('Unhandled rejection')));
  } catch (error) {
    if (String(error?.message || '') === 'Reloading after stale cache purge') {
      // intentional early exit
    } else {
      setImportError(error, { page });
      const app = document.getElementById('app');
      if (app) {
        app.innerHTML = `<section class="fatal-card"><h2>App failed to load</h2><pre class="status">${String(error?.stack || error)}</pre></section>`;
      }
    }
  }
}

bootstrap();
