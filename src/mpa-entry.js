import { renderTopNav } from './components/TopNav.js';
import { createImportController } from './components/ImportController.jsx';
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
import {
  getLastAvailableDays,
  loadSelectedDate,
  persistSelectedDate,
  resolveInitialSelectedDate
} from './state/selectedDate.js';
import { byDateUiMapping } from './mappings/byDateUiMapping.js';
import { sleepUiMapping } from './mappings/sleepUiMapping.js';
import { readinessUiMapping } from './mappings/readinessUiMapping.js';
import { activityUiMapping } from './mappings/activityUiMapping.js';
import { vitalsUiMapping } from './mappings/vitalsUiMapping.js';
import { trendsUiMapping } from './mappings/trendsUiMapping.js';
import { scoreToLabel, breathingIndexToLabel, contributorsToBars } from './domain/sleepTransforms.js';
import { toCsv } from './vitals-core.mjs';
import { getBuildStamp } from './buildStamp.js';

const SETTINGS_KEY = 'ouraDashboardSettingsV2';
const defaults = { baselineWindow: 14, developerMode: false, rememberDerived: false, nightWindowMode: 'auto', fallbackStart: '21:00', fallbackEnd: '09:00' };
const pageByPath = {
  '/index.html': 'index', '/sleep.html': 'sleep', '/readiness.html': 'readiness', '/activity.html': 'activity', '/vitals.html': 'vitals',
  '/trends.html': 'trends', '/journal.html': 'journal', '/data-tools-import.html': 'data-tools-import', '/data-tools-export.html': 'data-tools-export',
  '/glossary.html': 'glossary', '/settings.html': 'settings', '/debug.html': 'debug', '/my-health.html': 'my-health'
};

const fmt = (n, unit = '') => (n == null ? '<span class="placeholder">Not available in this export</span>' : `${Number(n).toFixed(1)}${unit}`);
const titleCase = (key) => key.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function loadSettings() { try { return { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; } catch { return { ...defaults }; } }
function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
function ensureMount(id, tag = 'div') { let el = document.getElementById(id); if (!el) { el = document.createElement(tag); el.id = id; document.body.appendChild(el); } return el; }
function inferPage() {
  const bodyPage = document.body.dataset.page;
  const inferred = pageByPath[location.pathname] || (location.pathname.split('/').pop()?.replace('.html', '') || 'index');
  if (!bodyPage) return inferred;
  if (pageByPath[location.pathname] && bodyPage !== pageByPath[location.pathname]) return inferred;
  return bodyPage;
}
function renderDateStrip(selectedDate) { return `<div class="date-strip">${getLastAvailableDays(getAvailableDates(), 7).map((d) => `<a class="btn ${d === selectedDate ? 'active' : ''}" href="${location.pathname}?date=${d}">${d}</a>`).join('')}</div>`; }
function showToast(message) { const toast = document.createElement('div'); toast.className = 'toast'; toast.textContent = message; document.body.appendChild(toast); setTimeout(() => toast.remove(), 2600); }
function hrSparkline(hrSeries = []) {
  if (!hrSeries.length) return '<div class="placeholder">Not available in this export</div>';
  const min = Math.min(...hrSeries.map((point) => point.bpm));
  const max = Math.max(...hrSeries.map((point) => point.bpm));
  const points = hrSeries.map((point, index) => `${(index / Math.max(hrSeries.length - 1, 1)) * 320},${100 - ((point.bpm - min) / Math.max(max - min, 1)) * 80}`).join(' ');
  return `<svg class="sparkline" viewBox="0 0 320 100"><polyline fill="none" stroke="#2563eb" stroke-width="2" points="${points}" /></svg>`;
}
function deterministicSleepInsight(score) {
  if (score == null) return 'Import data to unlock nightly sleep insights.';
  if (score >= 85) return 'High sleep score: maintain current wind-down routine.';
  if (score >= 70) return 'Solid sleep score: consistency can improve recovery.';
  return 'Lower sleep score: prioritize regular timing tonight.';
}

function renderFatal(error) {
  const shell = ensureMount('bootShell');
  const message = String(error?.message || error || 'Unknown error');
  const diagnostics = JSON.stringify({ message, stack: error?.stack || 'n/a', build: getBuildStamp(), ua: navigator.userAgent, page: location.href }, null, 2);
  shell.innerHTML = `<section class="fatal-card"><h2>App failed to load</h2><p>${message}</p><div class="fatal-actions"><button class="btn" id="reloadBtn">Reload</button><button class="btn" id="resetReloadBtn">Reset local data + reload</button><button class="btn" id="copyDiagBtn">Copy diagnostics</button></div><pre class="status">${diagnostics}</pre></section>`;
  document.getElementById('reloadBtn')?.addEventListener('click', () => location.href = `${location.pathname}?_r=${Date.now()}`);
  document.getElementById('resetReloadBtn')?.addEventListener('click', () => { localStorage.removeItem('ouraDerivedMetricsV3'); localStorage.removeItem('ouraSelectedDateV1'); location.reload(); });
  document.getElementById('copyDiagBtn')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(diagnostics); showToast('Diagnostics copied'); } catch { showToast('Copy failed'); } });
}

function renderEmptyGuard(app) {
  if (app.innerHTML.trim()) return;
  app.innerHTML = '<section class="card"><h2>Rendering fallback</h2><p>Page rendered empty content. Try reloading or re-importing data.</p></section>';
}

try {
  console.log('mpa-entry boot', location.pathname);
  document.documentElement.dataset.js = '1';
  const topNav = ensureMount('topNav');
  const app = ensureMount('app', 'main');
  const settings = loadSettings();
  let page = inferPage();

  renderTopNav(topNav, location.pathname);
  loadFromLocalCache();

  const availableDates = getAvailableDates();
  let selectedDate = resolveInitialSelectedDate(availableDates, loadSelectedDate());
  const dateFromQuery = new URLSearchParams(location.search).get('date');
  if (dateFromQuery) selectedDate = dateFromQuery;
  persistSelectedDate(selectedDate);

  const importController = createImportController({
    importZip: (file, onProgress) => importZip(file, settings, onProgress),
    onImported(result) {
      if (result?.mostRecentDate) persistSelectedDate(result.mostRecentDate);
      showToast(`Imported ✓ (${result?.dateRange?.days || 0} days)`);
      location.reload();
    },
    onStateChange() {}
  });


  const fileInput = document.getElementById('globalImportInput');
  fileInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    await importController.openWithFile(file);
  });

  const day = selectedDate ? getDay(selectedDate, settings) : null;
  const snapshot = getStoreSnapshot();

  if (getAvailableDates().length) {
    const banner = document.createElement('div');
    const dates = getAvailableDates();
    banner.className = 'import-banner';
    banner.innerHTML = `<span>Data loaded: ${dates[0]} → ${dates.at(-1)} (${dates.length} days)</span><button class="btn secondary" id="changeImportBtn">Change</button>`;
    app.before(banner);
    document.getElementById('changeImportBtn')?.addEventListener('click', () => importController.open());
  }

  if (page === 'sleep') {
    const score = day?.dailySleep?.score;
    const scoreMeta = scoreToLabel(score);
    const breathing = breathingIndexToLabel(day?.dailySpo2?.breathingDisturbanceIndex);
    const contributors = contributorsToBars(day?.dailySleep?.contributors || {});
    const typicalSleep = getBaseline('sleepScore', settings.baselineWindow, selectedDate);
    const metrics = [
      ['Total sleep contributor', day?.dailySleep?.contributors?.total_sleep],
      ['Efficiency contributor', day?.dailySleep?.contributors?.efficiency],
      ['REM contributor', day?.dailySleep?.contributors?.rem_sleep],
      ['Deep contributor', day?.dailySleep?.contributors?.deep_sleep]
    ];

    app.innerHTML = `<section class="card"><div class="row" style="justify-content:space-between"><h2>Sleep</h2><button class="btn" id="sleepImportBtn">Import your Oura ZIP</button></div>${renderDateStrip(selectedDate)}
      <div class="grid vitals-grid"><div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(score)}</div><div class="small muted">${scoreMeta.label} · ${deterministicSleepInsight(score)}</div></div>
      <div class="kpi"><div class="kpi-label">Sleep health (typical score)</div><div class="kpi-value">${fmt(typicalSleep)}</div><div class="small muted">Median over ${settings.baselineWindow} days</div></div></div>
      <h3>Contributors (scores)</h3>
      ${contributors.map((row) => `<div class="contributor-row"><div class="small">${titleCase(row.key)}: ${row.value == null ? '<span class="placeholder">Not available in this export</span>' : `${row.value}/100`}</div><div class="progress"><span style="width:${Math.max(0, Math.min(100, row.value || 0))}%"></span></div></div>`).join('')}
      <div class="metric-grid">
        <div class="kpi"><div class="kpi-label">Blood oxygen (night average)</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div></div>
        <div class="kpi"><div class="kpi-label">Breathing regularity</div><div class="kpi-value">${breathing.label}</div><div class="small muted">${breathing.explainer}</div></div>
        <div class="kpi"><div class="kpi-label">Lowest heart rate</div><div class="kpi-value">${fmt(day?.hrMin, ' bpm')}</div><div class="small muted">Average ${fmt(day?.hrAvg, ' bpm')}</div>${hrSparkline(day?.hrSeries || [])}</div>
        <div class="kpi"><div class="kpi-label">Estimated HRV (RMSSD proxy)</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div><div class="small muted">Estimate from overnight heart rate changes</div></div>
      </div>
      <h3>Details</h3><p class="placeholder">Not available in this export</p>
      <h3>Stage timeline</h3><p class="placeholder">Not available in this export</p>
      <h3>Key metrics</h3><div class="metric-grid">${metrics.map(([label, value]) => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value == null ? '<span class="placeholder">Not available in this export</span>' : `${value}/100`}</div></div>`).join('')}</div>
    </section>`;
    document.getElementById('sleepImportBtn')?.addEventListener('click', () => importController.open());
  } else if (page === 'index') {
    app.innerHTML = `<section class="card"><h2>By Date</h2>${renderDateStrip(selectedDate)}<div class="grid vitals-grid"><div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day?.dailySleep?.score)}</div></div><div class="kpi"><div class="kpi-label">Readiness score</div><div class="kpi-value">${fmt(day?.dailyReadiness?.score)}</div></div></div></section>`;
  } else if (page === 'readiness') {
    app.innerHTML = `<section class="card"><h2>Readiness</h2>${renderDateStrip(selectedDate)}<div class="kpi"><div class="kpi-label">Readiness score</div><div class="kpi-value">${fmt(day?.dailyReadiness?.score)}</div></div></section>`;
  } else if (page === 'activity') {
    app.innerHTML = `<section class="card"><h2>Activity</h2>${renderDateStrip(selectedDate)}<div class="kpi"><div class="kpi-label">Activity score</div><div class="kpi-value">${fmt(day?.dailyActivity?.score)}</div></div></section>`;
  } else if (page === 'vitals') {
    app.innerHTML = `<section class="card"><h2>Vitals</h2>${renderDateStrip(selectedDate)}<div class="grid vitals-grid"><div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.rhr_night_bpm, ' bpm')}</div></div><div class="kpi"><div class="kpi-label">Estimated HRV</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div></div></div></section>`;
  } else if (page === 'trends') {
    const range = getRange(getAvailableDates().at(-14) || selectedDate, selectedDate);
    app.innerHTML = `<section class="card"><h2>Trends</h2><p class="small muted">Rows in range: ${range.dailySleep.length}</p></section>`;
  } else if (page === 'journal') {
    app.innerHTML = `<section class="card"><h2>Journal</h2><p class="small muted">Journal entries are stored locally.</p></section>`;
  } else if (page === 'data-tools-import') {
    app.innerHTML = `<section class="card"><h2>Import</h2><button class="btn" id="openImport">Import ZIP</button><pre class="status">${JSON.stringify(snapshot.ingestReport || {}, null, 2)}</pre></section>`;
    document.getElementById('openImport')?.addEventListener('click', () => importController.open());
  } else if (page === 'data-tools-export') {
    const dates = getAvailableDates();
    const end = dates.at(-1); const start = dates[Math.max(0, dates.length - settings.baselineWindow)] || end;
    const uiData = { range: start && end ? getRange(start, end) : { dailySleep: [], dailyReadiness: [], dailyActivity: [], dailySpo2: [], derivedNightlyVitals: [] }, day: selectedDate ? getDay(selectedDate, settings) : null, dates };
    setUiSnapshot(uiData);
    app.innerHTML = `<section class="card"><h2>Export</h2><button class="btn" id="csvExport">derived_nightly_vitals.csv</button></section>`;
    document.getElementById('csvExport')?.addEventListener('click', () => {
      const blob = new Blob([toCsv(uiData.range.derivedNightlyVitals)], { type: 'text/plain' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'derived_nightly_vitals.csv'; a.click(); URL.revokeObjectURL(a.href);
    });
  } else if (page === 'glossary') {
    const table = (rows) => `<table class="simple-table"><tbody>${rows.map((row) => `<tr><td>${row.page}</td><td>${row.section}</td><td>${row.element}</td></tr>`).join('')}</tbody></table>`;
    app.innerHTML = `<section class="card"><h2>Glossary</h2>${table(byDateUiMapping)}${table(sleepUiMapping)}${table(readinessUiMapping)}${table(activityUiMapping)}${table(vitalsUiMapping)}${table(trendsUiMapping)}</section>`;
  } else if (page === 'settings') {
    app.innerHTML = `<section class="card"><h2>Settings</h2><label>Baseline window <input id="baseline" type="number" min="7" value="${settings.baselineWindow}"/></label></section>`;
    app.addEventListener('change', () => { settings.baselineWindow = Number(document.getElementById('baseline').value); saveSettings(settings); });
  } else if (page === 'debug') {
    app.innerHTML = `<section class="card"><h2>Debug</h2><pre class="status">${JSON.stringify(snapshot.availabilityMatrix || {}, null, 2)}</pre></section>`;
  } else {
    app.innerHTML = '<section class="card"><h2>My Health</h2><p>Use dashboard tabs for details.</p></section>';
  }

  renderEmptyGuard(app);
  window.addEventListener('unhandledrejection', (event) => { setImportError(event.reason || new Error('Unhandled rejection')); });
} catch (error) {
  renderFatal(error);
}
