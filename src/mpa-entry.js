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
import { contributorsToBars } from './domain/sleepTransforms.js';
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
    app.innerHTML = `<section class="card"><h2>By Date</h2>${renderDateStrip(selectedDate)}<div class="grid vitals-grid">
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
    const bars = contributorsToBars(day?.dailySleep?.contributors);
    const typicalSleep = getBaseline('sleepScore', settings.baselineWindow, selectedDate);
    app.innerHTML = `<section class="card"><h2>Sleep</h2>${renderDateStrip(selectedDate)}
      <div class="grid vitals-grid">
        <div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day?.dailySleep?.score, '', 0)}</div></div>
        <div class="kpi"><div class="kpi-label">Typical Sleep Score</div><div class="kpi-value">${fmt(typicalSleep, '', 0)}</div><div class="small muted">Median over ${settings.baselineWindow} days</div></div>
      </div>
      <h3>Contributors</h3>
      ${bars
        .map(
          (bar) => `<div class="contributor-row"><div class="small">${titleCase(bar.key)}: ${fmt(bar.value, '', 0)}</div><div class="progress"><span style="width:${Math.max(0, Math.min(100, bar.value || 0))}%"></span></div></div>`
        )
        .join('')}
      <h3>Breathing</h3>
      <div class="grid vitals-grid">
        <div class="kpi"><div class="kpi-label">Blood oxygen avg</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div></div>
        <div class="kpi"><div class="kpi-label">Breathing disturbance index (BDI)</div><div class="kpi-value">${fmt(day?.dailySpo2?.breathingDisturbanceIndex)}</div></div>
      </div>
      <h3>Night heart rate</h3>
      <div class="grid vitals-grid">
        <div class="kpi"><div class="kpi-label">Lowest HR</div><div class="kpi-value">${fmt(day?.hrMin, ' bpm')}</div></div>
        <div class="kpi"><div class="kpi-label">Avg HR</div><div class="kpi-value">${fmt(day?.hrAvg, ' bpm')}</div></div>
      </div>
      ${lineChartSeries(day?.heartRateSeries || [], 'Night window heart rate', ' bpm')}
      <h3>HRV</h3>
      <div class="kpi"><div class="kpi-label">Estimated HRV (RMSSD proxy)</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div></div>
      <h3>Details</h3>
      <div class="grid vitals-grid">
        <div class="kpi"><div class="kpi-label">Sleep stages timeline</div><div>${notAvailable}</div></div>
        <div class="kpi"><div class="kpi-label">Sleep details</div><div>${notAvailable}</div></div>
      </div>
    </section>`;
  } else if (page === 'readiness') {
    const contributors = day?.dailyReadiness?.contributors || {};
    const readinessScore = day?.dailyReadiness?.score ?? null;
    const baseline = getBaseline('temperatureDeviation', settings.baselineWindow, selectedDate);
    const temp = day?.dailyReadiness?.temperatureDeviation;
    const tempDelta = temp != null && baseline != null ? temp - baseline : null;
    const yesterday = dates.indexOf(selectedDate) > 0 ? dates[dates.indexOf(selectedDate) - 1] : null;
    const contributorOrder = [
      { key: 'resting_heart_rate', label: 'Resting heart rate', value: day?.derivedNightlyVitals?.rhr_night_bpm != null ? `${Math.round(day.derivedNightlyVitals.rhr_night_bpm)} bpm` : notAvailable },
      { key: 'hrv_balance', label: 'HRV balance' },
      { key: 'body_temperature', label: 'Body temperature' },
      { key: 'recovery_index', label: 'Recovery index' },
      { key: 'previous_night', label: 'Sleep' },
      { key: 'sleep_balance', label: 'Sleep balance' },
      { key: 'sleep_regularity', label: 'Sleep regularity' },
      { key: 'previous_day_activity', label: 'Previous day activity' },
      { key: 'activity_balance', label: 'Activity balance' }
    ];

    const contributorRows = contributorOrder.map((item) => {
      const score = contributors[item.key];
      const display = item.value || scoreBand(score);
      return `<div class="readiness-contributor-row">
        <div class="readiness-contributor-head">
          <span>${item.label}</span>
          <span>${display} <span class="muted">›</span></span>
        </div>
        <div class="readiness-rail"><span style="width:${Math.max(0, Math.min(100, score || 0))}%"></span></div>
      </div>`;
    }).join('');

    const hrvSeries = toHrvProxySeries(day?.heartRateSeries || []);
    const rhrPrimary = day?.derivedNightlyVitals?.rhr_night_bpm != null ? `${Math.round(day.derivedNightlyVitals.rhr_night_bpm)} bpm` : notAvailable;
    const rhrSecondary = day?.hrAvg != null ? `Average ${Math.round(day.hrAvg)} bpm` : '';
    const hrvPrimary = day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms != null ? `${Math.round(day.derivedNightlyVitals.hrv_rmssd_proxy_ms)} ms` : notAvailable;
    const hrvMax = hrvSeries.length ? Math.max(...hrvSeries.map((point) => point.v)) : null;
    const hrvSecondary = hrvMax != null ? `Max ${Math.round(hrvMax)} ms` : '';
    const metricCards = [
      { label: 'Resting heart rate', value: rhrPrimary },
      { label: 'Heart rate variability', value: hrvPrimary },
      { label: 'Body temperature', value: formatTemperature(temp) },
      { label: 'Respiratory rate', value: notAvailable }
    ];

    const insightTitle = scoreBand(contributors.hrv_balance) === 'Optimal' ? 'HRV Balance' : 'Readiness insight';
    const insightText = `Your readiness contributors suggest how your recovery trend is shaping up. Baseline body temperature is ${fmt(baseline, ' C')} and today's delta is ${fmt(tempDelta, ' C')}.`;

    app.innerHTML = `<section class="readiness-page">
      <section class="readiness-hero">
        <div class="readiness-day-toggle">
          <a class="readiness-day ${yesterday ? '' : 'disabled'}" href="${yesterday ? `${location.pathname}?date=${yesterday}` : '#'}">Yesterday</a>
          <div class="readiness-day active">Today</div>
        </div>
        <div class="readiness-score-row">
          <div class="readiness-score">${fmt(readinessScore, '', 0)}</div>
          <div class="readiness-band">${scoreBand(readinessScore).toUpperCase()}</div>
        </div>
        <h2 class="readiness-insight-title">${insightTitle}</h2>
        <p class="readiness-insight-copy">${insightText}</p>
        <details class="readiness-show-more">
          <summary>Show more</summary>
          <p class="muted">Contributor scores are shown below. Values are pulled from daily readiness contributors and derived nightly vitals for the selected date.</p>
        </details>
      </section>

      <section class="readiness-section">
        <h3>Contributors</h3>
        ${contributorRows}
      </section>

      <section class="readiness-section">
        <h3>Key metrics</h3>
        <div class="readiness-metric-grid">
          ${metricCards.map((card) => `<article class="readiness-metric-card"><div class="readiness-metric-label">${card.label}</div><div class="readiness-metric-value">${card.value}</div></article>`).join('')}
        </div>
      </section>

      <section class="readiness-section">
        <h3>Details</h3>
        ${renderReadinessChart({
          title: 'Lowest heart rate',
          primary: rhrPrimary,
          secondary: rhrSecondary,
          series: (day?.heartRateSeries || []).map((point) => ({ t: point.t, v: point.bpm })),
          unit: 'bpm',
          yMin: 40,
          yMax: 85
        })}
        ${renderReadinessChart({
          title: 'Average HRV',
          primary: hrvPrimary,
          secondary: hrvSecondary,
          series: hrvSeries,
          unit: 'ms',
          yMin: 0,
          yMax: 85
        })}
      </section>
    </section>`;
  } else if (page === 'activity') {
    const index = dates.indexOf(selectedDate);
    const start = dates[Math.max(0, index - 13)] || selectedDate;
    const range = getRange(start, selectedDate).dailyActivity;
    app.innerHTML = `<section class="card"><h2>Activity</h2>${renderDateStrip(selectedDate)}<div class="grid vitals-grid">
      <div class="kpi"><div class="kpi-label">Score</div><div class="kpi-value">${fmt(day?.dailyActivity?.score, '', 0)}</div></div>
      <div class="kpi"><div class="kpi-label">Steps</div><div class="kpi-value">${fmt(day?.dailyActivity?.steps, '', 0)}</div></div>
      <div class="kpi"><div class="kpi-label">Active calories</div><div class="kpi-value">${fmt(day?.dailyActivity?.activeCalories, ' cal', 0)}</div></div>
      <div class="kpi"><div class="kpi-label">14-day averages</div><div class="small muted">Steps ${fmt(avg(range, 'steps'), '', 0)} · Calories ${fmt(avg(range, 'activeCalories'), ' cal', 0)}</div></div>
    </div></section>`;
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
    app.innerHTML = `<section class="card"><h2>Vitals</h2>${renderDateStrip(selectedDate)}<div class="grid vitals-grid">
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
    app.innerHTML = `<section class="card"><h2>Trends</h2><div class="row">${[7, 14, 30, 90].map(makeBtn).join('')}</div><div class="grid vitals-grid">
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
      <div class="row">
        <button class="btn" id="openImport">Import ZIP</button>
        <label for="fallbackImportInput" class="small muted">Fallback input:</label>
        <input id="fallbackImportInput" type="file" accept=".zip,application/zip" />
      </div>
      <div class="status" id="fallbackImportStatus">Idle</div>
      <div id="importSuccessBanner" class="import-banner" hidden></div>
      <pre class="status" id="importReport">${JSON.stringify(snapshot.ingestReport || {}, null, 2)}</pre>
    </section>`;

    document.getElementById('openImport')?.addEventListener('click', () => importController.open());
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
