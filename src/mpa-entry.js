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
import { toCsv } from './vitals-core.mjs';

const SETTINGS_KEY = 'ouraDashboardSettingsV2';
const defaults = {
  baselineWindow: 14,
  developerMode: false,
  rememberDerived: false,
  nightWindowMode: 'auto',
  fallbackStart: '21:00',
  fallbackEnd: '09:00'
};

const page = document.body.dataset.page;

function loadSettings() {
  try {
    return { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) };
  } catch {
    return { ...defaults };
  }
}
function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
const settings = loadSettings();

renderTopNav(document.getElementById('topNav'), location.pathname, settings.developerMode);
loadFromLocalCache();

const availableDates = getAvailableDates();
let selectedDate = resolveInitialSelectedDate(availableDates, loadSelectedDate());
persistSelectedDate(selectedDate);

const fmt = (n, unit = '') =>
  n == null ? '<span class="placeholder">Not in this export</span>' : `${Number(n).toFixed(1)}${unit}`;
const emoji = (v) => (v ? '✓' : '✗');

function renderDateStrip() {
  const days = getLastAvailableDays(getAvailableDates(), 7);
  return `<div class="date-strip">${days
    .map(
      (d) =>
        `<a class="btn ${d === selectedDate ? 'active' : ''}" href="${location.pathname}?date=${d}">${d}</a>`
    )
    .join('')}</div>`;
}

function mappingTable(rows) {
  return `<table class="simple-table"><thead><tr><th>Page</th><th>Section</th><th>Element</th><th>Source Paths</th><th>Transform</th><th>Fallback</th><th>Notes</th></tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr><td>${row.page}</td><td>${row.section}</td><td>${row.element}</td><td>${row.sourcePaths.join(
          '<br/>'
        )}</td><td>${row.transform}</td><td>${row.fallback}</td><td>${row.notes}</td></tr>`
    )
    .join('')}</tbody></table>`;
}

function simpleTrendSvg(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  if (!vals.length) return '<div class="placeholder">No rows in this range.</div>';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const points = rows
    .map((r, i) => {
      if (r[key] == null) return null;
      const x = (i / Math.max(rows.length - 1, 1)) * 300;
      const y = 80 - ((r[key] - min) / Math.max(max - min, 1)) * 70;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');
  return `<svg viewBox="0 0 300 80" class="trend large"><polyline fill="none" stroke="#8db3ff" stroke-width="2" points="${points}"/></svg>`;
}

function shortHash(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  return `h${Math.abs(hash)}`;
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Needed by Export page */
function currentSnapshot() {
  const dates = getAvailableDates();
  const end = dates.at(-1);
  const start = dates[Math.max(0, dates.length - settings.baselineWindow)] || end;
  const range =
    start && end
      ? getRange(start, end)
      : { dailySleep: [], dailyReadiness: [], dailyActivity: [], dailySpo2: [], derivedNightlyVitals: [] };
  return { range, day: selectedDate ? getDay(selectedDate, settings) : null, dates };
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

const app = document.getElementById('app');

const importController = createImportController({
  importZip: (file, onProgress) => importZip(file, settings, onProgress),
  onImported(result) {
    if (result?.mostRecentDate) {
      selectedDate = result.mostRecentDate;
      persistSelectedDate(selectedDate);
    }
    showToast(`Imported Oura ZIP ✓ (${result?.dateRange?.days || 0} days)`);
    location.reload();
  },
  onStateChange() {}
});

function renderDataBanner() {
  const dates = getAvailableDates();
  if (!dates.length) return;
  const banner = document.createElement('div');
  banner.className = 'import-banner';
  banner.innerHTML = `<span>Data loaded: ${dates[0]} → ${dates.at(-1)} (${dates.length} days)</span><button class="btn secondary" id="changeImportBtn">Change</button>`;
  app.before(banner);
  document.getElementById('changeImportBtn')?.addEventListener('click', () => importController.open());
}

// hook top-right icon/button if TopNav provides it
document.getElementById('globalImportBtn')?.addEventListener('click', () => importController.open());

const dateFromQuery = new URLSearchParams(location.search).get('date');
if (dateFromQuery) {
  selectedDate = dateFromQuery;
  persistSelectedDate(selectedDate);
}

const day = selectedDate ? getDay(selectedDate, settings) : null;
const snapshot = getStoreSnapshot();

if (page === 'index') {
  app.innerHTML = `<section class="card"><h2>By Date</h2>${renderDateStrip()}<div class="grid vitals-grid">
  <div class="kpi"><div class="kpi-label">Readiness score</div><div class="kpi-value">${fmt(day?.dailyReadiness?.score)}</div></div>
  <div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day?.dailySleep?.score)}</div></div>
  <div class="kpi"><div class="kpi-label">Activity score</div><div class="kpi-value">${fmt(day?.dailyActivity?.score)}</div></div>
  <div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.rhr_night_bpm, ' bpm')}</div></div>
  <div class="kpi"><div class="kpi-label">Estimated HRV</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div></div>
  <div class="kpi"><div class="kpi-label">SpO2 Night Avg</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div></div>
  <div class="kpi"><div class="kpi-label">Quick insight</div><div class="small muted">Night window: ${day?.heartRateWindowSummary?.modeUsed || 'n/a'}. HR points: ${day?.heartRateWindowSummary?.points ?? 0}</div></div>
  </div></section>`;
} else if (page === 'sleep') {
  const contributors = day?.dailySleep?.contributors
    ? Object.entries(day.dailySleep.contributors)
        .map(([k, v]) => `<li>${k}: ${v}</li>`)
        .join('')
    : '<li class="placeholder">Not in this export</li>';
  app.innerHTML = `<section class="card"><h2>Sleep</h2>${renderDateStrip()}<div class="grid vitals-grid">
  <div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day?.dailySleep?.score)}</div></div>
  <div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.rhr_night_bpm, ' bpm')}</div></div>
  <div class="kpi"><div class="kpi-label">HRV proxy</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div></div>
  <div class="kpi"><div class="kpi-label">SpO2</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div></div>
  <div class="kpi"><div class="kpi-label">Breathing regularity (BDI)</div><div class="kpi-value">${fmt(
    day?.dailySpo2?.breathingDisturbanceIndex
  )}</div></div>
  </div><h3>Contributors</h3><ul>${contributors}</ul><h3>Overnight HR trend</h3>${simpleTrendSvg(
    getRange(selectedDate, selectedDate).derivedNightlyVitals,
    'rhr_night_bpm'
  )}<p class="small muted">Sleep duration/stages are not present in these CSV exports.</p></section>`;
} else if (page === 'readiness') {
  const contributors = day?.dailyReadiness?.contributors
    ? Object.entries(day.dailyReadiness.contributors)
        .map(([k, v]) => `<li>${k}: ${v}</li>`)
        .join('')
    : '<li class="placeholder">Not in this export</li>';
  const baseTemp = getBaseline('temperatureDeviation', settings.baselineWindow, selectedDate);
  app.innerHTML = `<section class="card"><h2>Readiness</h2>${renderDateStrip()}<div class="kpi"><div class="kpi-label">Readiness score</div><div class="kpi-value">${fmt(
    day?.dailyReadiness?.score
  )}</div></div><div class="kpi top-gap"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(
    day?.dailyReadiness?.temperatureDeviation,
    ' °C'
  )}</div><div class="small muted">Baseline ${fmt(baseTemp, ' °C')}</div></div><h3>Contributors</h3><ul>${contributors}</ul></section>`;
} else if (page === 'activity') {
  const range = getRange(getAvailableDates().at(-14) || selectedDate, selectedDate);
  const stepsAvg = range.dailyActivity.length
    ? range.dailyActivity.reduce((s, r) => s + (r.steps || 0), 0) / range.dailyActivity.length
    : null;
  const calsAvg = range.dailyActivity.length
    ? range.dailyActivity.reduce((s, r) => s + (r.activeCalories || 0), 0) / range.dailyActivity.length
    : null;
  app.innerHTML = `<section class="card"><h2>Activity</h2>${renderDateStrip()}<div class="grid vitals-grid"><div class="kpi"><div class="kpi-label">Activity score</div><div class="kpi-value">${fmt(
    day?.dailyActivity?.score
  )}</div></div><div class="kpi"><div class="kpi-label">Steps</div><div class="kpi-value">${fmt(
    day?.dailyActivity?.steps
  )}</div></div><div class="kpi"><div class="kpi-label">Active calories</div><div class="kpi-value">${fmt(
    day?.dailyActivity?.activeCalories
  )}</div></div><div class="kpi"><div class="kpi-label">14d avg steps</div><div class="kpi-value">${fmt(
    stepsAvg
  )}</div></div><div class="kpi"><div class="kpi-label">14d avg cals</div><div class="kpi-value">${fmt(
    calsAvg
  )}</div></div></div></section>`;
} else if (page === 'vitals') {
  const baseRhr = getBaseline('rhr_night_bpm', settings.baselineWindow, selectedDate);
  const baseHrv = getBaseline('hrv_rmssd_proxy_ms', settings.baselineWindow, selectedDate);
  const baseSpo2 = getBaseline('spo2Average', settings.baselineWindow, selectedDate);
  app.innerHTML = `<section class="card"><h2>Vitals</h2>${renderDateStrip()}<div class="grid vitals-grid"><div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(
    day?.derivedNightlyVitals?.rhr_night_bpm,
    ' bpm'
  )}</div><div class="small muted">Baseline ${fmt(baseRhr)} · Δ ${fmt(
    (day?.derivedNightlyVitals?.rhr_night_bpm ?? null) - (baseRhr ?? 0)
  )}</div></div><div class="kpi"><div class="kpi-label">Estimated HRV</div><div class="kpi-value">${fmt(
    day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms,
    ' ms'
  )}</div><div class="small muted">Baseline ${fmt(baseHrv)} · Δ ${fmt(
    (day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms ?? null) - (baseHrv ?? 0)
  )}</div></div><div class="kpi"><div class="kpi-label">SpO2</div><div class="kpi-value">${fmt(
    day?.dailySpo2?.spo2Average,
    '%'
  )}</div><div class="small muted">Baseline ${fmt(baseSpo2, '%')}</div></div><div class="kpi"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(
    day?.dailyReadiness?.temperatureDeviation,
    ' °C'
  )}</div></div></div></section>`;
} else if (page === 'trends') {
  const rangeDays = Number(new URLSearchParams(location.search).get('range') || 7);
  const all = getAvailableDates();
  const end = all.at(-1) || selectedDate;
  const start = all[Math.max(0, all.length - rangeDays)] || end;
  const range = getRange(start, end);
  app.innerHTML = `<section class="card"><h2>Trends</h2><div class="row"><a class="btn" href="?range=7">7</a><a class="btn" href="?range=14">14</a><a class="btn" href="?range=30">30</a><a class="btn" href="?range=90">90</a></div><h3>Readiness</h3>${simpleTrendSvg(
    range.dailyReadiness,
    'score'
  )}<h3>Sleep</h3>${simpleTrendSvg(range.dailySleep, 'score')}<h3>Activity</h3>${simpleTrendSvg(
    range.dailyActivity,
    'score'
  )}<h3>RHR</h3>${simpleTrendSvg(range.derivedNightlyVitals, 'rhr_night_bpm')}<h3>HRV</h3>${simpleTrendSvg(
    range.derivedNightlyVitals,
    'hrv_rmssd_proxy_ms'
  )}<h3>SpO2</h3>${simpleTrendSvg(range.dailySpo2, 'spo2Average')}<h3>Temp deviation</h3>${simpleTrendSvg(
    range.dailyReadiness,
    'temperatureDeviation'
  )}</section>`;
} else if (page === 'journal') {
  const key = 'ouraJournalEntriesV1';
  const entries = JSON.parse(localStorage.getItem(key) || '[]');
  app.innerHTML = `<section class="card"><h2>Journal / Tags</h2><form id="journalForm" class="row"><input name="date" type="date" required value="${selectedDate}"/><input name="tag" placeholder="tag" required /><input name="note" placeholder="note"/><button class="btn">Add</button></form><ul>${entries
    .map((e) => `<li>${e.date} · ${e.tag} · ${e.note || ''}</li>`)
    .join('')}</ul></section>`;
  document.getElementById('journalForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    entries.unshift({ date: form.get('date'), tag: form.get('tag'), note: form.get('note') });
    localStorage.setItem(key, JSON.stringify(entries));
    location.reload();
  });
} else if (page === 'data-tools-import') {
  app.innerHTML = `<section class="card"><h2>Import</h2><div class="row"><button class="btn" id="openImport">Import ZIP</button><button class="btn secondary" id="clearBtn">Forget data</button></div><pre class="status" id="status">${JSON.stringify(
    snapshot.ingestReport || {},
    null,
    2
  )}</pre></section>`;

  document.getElementById('openImport').addEventListener('click', () => importController.open());
  document.getElementById('clearBtn').addEventListener('click', () => {
    // target only app keys; don’t nuke everything
    localStorage.removeItem('ouraDerivedMetricsV3');
    localStorage.removeItem('ouraSelectedDateV1');
    location.reload();
  });
} else if (page === 'data-tools-export') {
  const uiData = currentSnapshot();
  const metadata = {
    exportedAt: new Date().toISOString(),
    digest: shortHash(JSON.stringify(uiData)),
    selectedDate,
    baselineWindow: settings.baselineWindow
  };
  setUiSnapshot(uiData);
  app.innerHTML = `<section class="card"><h2>Export</h2><div class="row"><button class="btn" id="jsonExport">normalized_all.json</button><button class="btn" id="csvExport">derived_nightly_vitals.csv</button></div><p class="small muted">Exports include metadata digest ${metadata.digest} at ${metadata.exportedAt}.</p></section>`;
  document.getElementById('jsonExport').addEventListener('click', () =>
    download('normalized_all.json', JSON.stringify({ metadata, uiData }, null, 2))
  );
  document.getElementById('csvExport').addEventListener('click', () =>
    download('derived_nightly_vitals.csv', toCsv(uiData.range.derivedNightlyVitals))
  );
} else if (page === 'glossary') {
  app.innerHTML = `<section class="card"><h2>Glossary</h2><p>Deterministic mappings used by each page.</p>${mappingTable(
    byDateUiMapping
  )}${mappingTable(sleepUiMapping)}${mappingTable(readinessUiMapping)}${mappingTable(
    activityUiMapping
  )}${mappingTable(vitalsUiMapping)}${mappingTable(trendsUiMapping)}</section>`;
} else if (page === 'settings') {
  const coverage = snapshot.availabilityMatrix || {};
  const coverageText = ['dailySleep', 'dailyReadiness', 'dailyActivity', 'dailySpo2', 'heartRate', 'sleepTime']
    .map((k) => `${k}:${emoji(coverage[k])}`)
    .join(' · ');
  app.innerHTML = `<section class="card"><h2>Settings</h2><p class="small muted">Data coverage: ${
    coverageText || 'Import data to compute coverage'
  }</p><label>Baseline window <input id="baseline" type="number" min="7" value="${
    settings.baselineWindow
  }"/></label><label><input id="developer" type="checkbox" ${
    settings.developerMode ? 'checked' : ''
  }/> Developer mode</label><label><input id="remember" type="checkbox" ${
    settings.rememberDerived ? 'checked' : ''
  }/> Remember last import</label><label>Night window mode <select id="nightWindowMode"><option value="auto">auto</option><option value="sleep-time">sleep-time</option><option value="settings">settings fallback only</option></select></label><label>Fallback start <input id="fallbackStart" type="time" value="${
    settings.fallbackStart
  }" /></label><label>Fallback end <input id="fallbackEnd" type="time" value="${
    settings.fallbackEnd
  }" /></label></section>`;
  document.getElementById('nightWindowMode').value = settings.nightWindowMode;
  app.addEventListener('change', () => {
    settings.baselineWindow = Number(document.getElementById('baseline').value);
    settings.developerMode = document.getElementById('developer').checked;
    settings.rememberDerived = document.getElementById('remember').checked;
    settings.nightWindowMode = document.getElementById('nightWindowMode').value;
    settings.fallbackStart = document.getElementById('fallbackStart').value;
    settings.fallbackEnd = document.getElementById('fallbackEnd').value;
    saveSettings(settings);
  });
} else if (page === 'debug') {
  if (!settings.developerMode) {
    app.innerHTML = `<section class="card"><h2>Debug</h2><p class="placeholder">Enable developer mode in Settings.</p></section>`;
  } else {
    const counts = Object.fromEntries(Object.entries(snapshot.datasets).map(([k, rows]) => [k, rows.length]));
    const debugInfo = {
      keys: Object.keys(snapshot.datasets),
      counts,
      ingestReport: snapshot.ingestReport,
      availabilityMatrix: snapshot.availabilityMatrix,
      selectedDate,
      nightWindowModeUsed: day?.heartRateWindowSummary?.modeUsed || null
    };
    app.innerHTML = `<section class="card"><h2>Debug</h2><pre class="status">${JSON.stringify(
      debugInfo,
      null,
      2
    )}</pre></section>`;
  }
} else if (page === 'my-health') {
  app.innerHTML =
    '<section class="card"><h2>My Health</h2><p>Use tabs for Trends, Journal, Import/Export, Glossary, Settings, and Debug.</p></section>';
}

renderDataBanner();
window.addEventListener('unhandledrejection', (event) => {
  setImportError(event.reason || new Error('Unhandled rejection'));
});