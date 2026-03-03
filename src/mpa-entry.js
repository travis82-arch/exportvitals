import { renderTopNav } from './components/TopNav.js';
import { loadFromLocalCache, importZip, getAvailableDates, getDay, getRange, getBaseline, getStoreSnapshot } from './store/dataStore.js';
import { getLastAvailableDays, loadSelectedDate, persistSelectedDate, resolveInitialSelectedDate } from './state/selectedDate.js';
import { byDateUiMapping } from './mappings/byDateUiMapping.js';
import { sleepUiMapping } from './mappings/sleepUiMapping.js';
import { readinessUiMapping } from './mappings/readinessUiMapping.js';
import { activityUiMapping } from './mappings/activityUiMapping.js';
import { vitalsUiMapping } from './mappings/vitalsUiMapping.js';
import { trendsUiMapping } from './mappings/trendsUiMapping.js';
import { toCsv } from './vitals-core.mjs';

const SETTINGS_KEY = 'ouraDashboardSettingsV2';
const defaults = { baselineWindow: 14, developerMode: false, rememberDerived: false, nightWindowMode: 'auto' };
const page = document.body.dataset.page;

function loadSettings() { try { return { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; } catch { return { ...defaults }; } }
function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
const settings = loadSettings();
renderTopNav(document.getElementById('topNav'), location.pathname, settings.developerMode);
loadFromLocalCache();

const availableDates = getAvailableDates();
let selectedDate = resolveInitialSelectedDate(availableDates, loadSelectedDate());
persistSelectedDate(selectedDate);

const fmt = (n, unit = '') => (n == null ? '<span class="placeholder">Not in export</span>' : `${Number(n).toFixed(1)}${unit}`);

function renderDateStrip() {
  const days = getLastAvailableDays(getAvailableDates(), 7);
  return `<div class="date-strip">${days.map((d) => `<a class="btn ${d === selectedDate ? 'active' : ''}" href="${location.pathname}?date=${d}">${d}</a>`).join('')}</div>`;
}

function mappingTable(rows) {
  return `<table class="simple-table"><thead><tr><th>Page</th><th>Section</th><th>Element</th><th>Source Paths</th><th>Transform</th><th>Fallback</th><th>Notes</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.page}</td><td>${row.section}</td><td>${row.element}</td><td>${row.sourcePaths.join('<br/>')}</td><td>${row.transform}</td><td>${row.fallback}</td><td>${row.notes}</td></tr>`).join('')}</tbody></table>`;
}

function simpleTrendSvg(rows, key) {
  const vals = rows.map((r) => r[key]).filter((v) => v != null);
  if (!vals.length) return '<div class="placeholder">No rows for range</div>';
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const points = rows.map((r, i) => {
    if (r[key] == null) return null;
    const x = (i / Math.max(rows.length - 1, 1)) * 300;
    const y = 80 - ((r[key] - min) / Math.max(max - min, 1)) * 70;
    return `${x},${y}`;
  }).filter(Boolean).join(' ');
  return `<svg viewBox="0 0 300 80" class="trend large"><polyline fill="none" stroke="#8db3ff" stroke-width="2" points="${points}"/></svg>`;
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const dateFromQuery = new URLSearchParams(location.search).get('date');
if (dateFromQuery) {
  selectedDate = dateFromQuery;
  persistSelectedDate(selectedDate);
}
const day = getDay(selectedDate);
const app = document.getElementById('app');

if (page === 'index') {
  app.innerHTML = `<section class="card"><h2>By Date</h2>${renderDateStrip()}<div class="grid vitals-grid">
  <div class="kpi"><div class="kpi-label">Readiness score</div><div class="kpi-value">${fmt(day.dailyReadiness?.score)}</div></div>
  <div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day.dailySleep?.score)}</div></div>
  <div class="kpi"><div class="kpi-label">Activity score</div><div class="kpi-value">${fmt(day.dailyActivity?.score)}</div></div>
  <div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day.derivedNightlyVitals?.rhr_night_bpm, ' bpm')}</div></div>
  <div class="kpi"><div class="kpi-label">Estimated HRV</div><div class="kpi-value">${fmt(day.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div></div>
  <div class="kpi"><div class="kpi-label">SpO2 Night Avg</div><div class="kpi-value">${fmt(day.dailySpo2?.spo2Average, '%')}</div></div>
  <div class="kpi"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(day.dailyReadiness?.temperatureDeviation, ' °C')}</div></div>
  </div></section>`;
} else if (page === 'sleep') {
  app.innerHTML = `<section class="card"><h2>Sleep</h2>${renderDateStrip()}<div class="grid vitals-grid"><div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day.dailySleep?.score)}</div></div><div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day.derivedNightlyVitals?.rhr_night_bpm,' bpm')}</div></div><div class="kpi"><div class="kpi-label">Estimated HRV</div><div class="kpi-value">${fmt(day.derivedNightlyVitals?.hrv_rmssd_proxy_ms,' ms')}</div></div><div class="kpi"><div class="kpi-label">Durations</div><div class="placeholder">Not in export</div></div></div></section>`;
} else if (page === 'readiness') {
  const contributors = day.dailyReadiness?.contributors ? Object.entries(day.dailyReadiness.contributors).map(([k, v]) => `<li>${k}: ${v}</li>`).join('') : '<li class="placeholder">Not in export</li>';
  app.innerHTML = `<section class="card"><h2>Readiness</h2>${renderDateStrip()}<div class="kpi"><div class="kpi-label">Readiness score</div><div class="kpi-value">${fmt(day.dailyReadiness?.score)}</div></div><div class="kpi top-gap"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(day.dailyReadiness?.temperatureDeviation,' °C')}</div></div><h3>Contributors</h3><ul>${contributors}</ul></section>`;
} else if (page === 'activity') {
  app.innerHTML = `<section class="card"><h2>Activity</h2>${renderDateStrip()}<div class="grid vitals-grid"><div class="kpi"><div class="kpi-label">Activity score</div><div class="kpi-value">${fmt(day.dailyActivity?.score)}</div></div><div class="kpi"><div class="kpi-label">Steps</div><div class="kpi-value">${fmt(day.dailyActivity?.steps)}</div></div><div class="kpi"><div class="kpi-label">Calories</div><div class="kpi-value">${fmt(day.dailyActivity?.activeCalories)}</div></div></div></section>`;
} else if (page === 'vitals') {
  const range = getRange(getAvailableDates().at(-settings.baselineWindow) || selectedDate, selectedDate);
  const baseRhr = getBaseline(range.derivedNightlyVitals, 'rhr_night_bpm');
  const baseHrv = getBaseline(range.derivedNightlyVitals, 'hrv_rmssd_proxy_ms');
  app.innerHTML = `<section class="card"><h2>Vitals</h2>${renderDateStrip()}<div class="grid vitals-grid"><div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day.derivedNightlyVitals?.rhr_night_bpm,' bpm')}</div><div class="small muted">Baseline ${fmt(baseRhr)}</div></div><div class="kpi"><div class="kpi-label">Estimated HRV</div><div class="kpi-value">${fmt(day.derivedNightlyVitals?.hrv_rmssd_proxy_ms,' ms')}</div><div class="small muted">Baseline ${fmt(baseHrv)}</div></div><div class="kpi"><div class="kpi-label">SpO2</div><div class="kpi-value">${fmt(day.dailySpo2?.spo2Average,'%')}</div></div><div class="kpi"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(day.dailyReadiness?.temperatureDeviation,' °C')}</div></div></div></section>`;
} else if (page === 'trends') {
  const rangeDays = Number(new URLSearchParams(location.search).get('range') || 7);
  const all = getAvailableDates();
  const end = all.at(-1) || selectedDate;
  const start = all[Math.max(0, all.length - rangeDays)] || end;
  const range = getRange(start, end);
  app.innerHTML = `<section class="card"><h2>Trends</h2><div class="row"><a class="btn" href="?range=7">7</a><a class="btn" href="?range=14">14</a><a class="btn" href="?range=30">30</a><a class="btn" href="?range=90">90</a></div><h3>Readiness</h3>${simpleTrendSvg(range.dailyReadiness,'score')}<h3>Sleep</h3>${simpleTrendSvg(range.dailySleep,'score')}<h3>Activity</h3>${simpleTrendSvg(range.dailyActivity,'score')}<h3>RHR</h3>${simpleTrendSvg(range.derivedNightlyVitals,'rhr_night_bpm')}</section>`;
} else if (page === 'journal') {
  const key = 'ouraJournalEntriesV1';
  const entries = JSON.parse(localStorage.getItem(key) || '[]');
  app.innerHTML = `<section class="card"><h2>Journal / Tags</h2><form id="journalForm" class="row"><input name="date" type="date" required value="${selectedDate}"/><input name="tag" placeholder="tag" required /><input name="note" placeholder="note"/><button class="btn">Add</button></form><ul>${entries.map((e) => `<li>${e.date} · ${e.tag} · ${e.note || ''}</li>`).join('')}</ul></section>`;
  document.getElementById('journalForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    entries.unshift({ date: form.get('date'), tag: form.get('tag'), note: form.get('note') });
    localStorage.setItem(key, JSON.stringify(entries));
    location.reload();
  });
} else if (page === 'data-tools-import') {
  app.innerHTML = `<section class="card"><h2>Import</h2><input id="zip" type="file" accept=".zip" /><pre class="status" id="status">Pick a ZIP export file.</pre></section>`;
  document.getElementById('zip').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    if (!file) return;
    const report = await importZip(file);
    document.getElementById('status').textContent = JSON.stringify(report, null, 2);
  });
} else if (page === 'data-tools-export') {
  const snapshot = getStoreSnapshot();
  app.innerHTML = `<section class="card"><h2>Export</h2><div class="row"><button class="btn" id="jsonExport">normalized_all.json</button><button class="btn" id="csvExport">derived_nightly_vitals.csv</button></div></section>`;
  document.getElementById('jsonExport').addEventListener('click', () => download('normalized_all.json', JSON.stringify(snapshot, null, 2)));
  document.getElementById('csvExport').addEventListener('click', () => download('derived_nightly_vitals.csv', toCsv(snapshot.derivedNightlyVitals)));
} else if (page === 'glossary') {
  app.innerHTML = `<section class="card"><h2>Glossary</h2><p>Deterministic mappings used by each page.</p>${mappingTable(byDateUiMapping)}${mappingTable(sleepUiMapping)}${mappingTable(readinessUiMapping)}${mappingTable(activityUiMapping)}${mappingTable(vitalsUiMapping)}${mappingTable(trendsUiMapping)}</section>`;
} else if (page === 'settings') {
  app.innerHTML = `<section class="card"><h2>Settings</h2><label>Baseline window <input id="baseline" type="number" min="7" value="${settings.baselineWindow}"/></label><label><input id="developer" type="checkbox" ${settings.developerMode ? 'checked' : ''}/> Developer mode</label><label><input id="remember" type="checkbox" ${settings.rememberDerived ? 'checked' : ''}/> Remember last import</label><label>Night window mode <select id="nightWindowMode"><option value="auto">auto</option><option value="sleep-time">sleep-time</option></select></label></section>`;
  document.getElementById('nightWindowMode').value = settings.nightWindowMode;
  app.addEventListener('change', () => {
    settings.baselineWindow = Number(document.getElementById('baseline').value);
    settings.developerMode = document.getElementById('developer').checked;
    settings.rememberDerived = document.getElementById('remember').checked;
    settings.nightWindowMode = document.getElementById('nightWindowMode').value;
    saveSettings(settings);
  });
} else if (page === 'debug') {
  if (!settings.developerMode) {
    app.innerHTML = `<section class="card"><h2>Debug</h2><p class="placeholder">Enable developer mode in Settings.</p></section>`;
  } else {
    const snapshot = getStoreSnapshot();
    const counts = Object.fromEntries(Object.entries(snapshot.datasets).map(([k, rows]) => [k, rows.length]));
    app.innerHTML = `<section class="card"><h2>Debug</h2><pre class="status">${JSON.stringify({ keys: Object.keys(snapshot.datasets), counts, ingestReport: snapshot.ingestReport }, null, 2)}</pre></section>`;
  }
} else if (page === 'my-health') {
  app.innerHTML = `<section class="card"><h2>My Health</h2><p>Use tabs for Trends, Journal, Import/Export, Glossary, Settings, and Debug.</p></section>`;
}
