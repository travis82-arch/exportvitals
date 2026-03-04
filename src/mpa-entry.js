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
import { byDateUiMapping } from './mappings/byDateUiMapping.js';
import { sleepUiMapping } from './mappings/sleepUiMapping.js';
import { readinessUiMapping } from './mappings/readinessUiMapping.js';
import { activityUiMapping } from './mappings/activityUiMapping.js';
import { vitalsUiMapping } from './mappings/vitalsUiMapping.js';
import { trendsUiMapping } from './mappings/trendsUiMapping.js';
import { contributorsToBars } from './domain/sleepTransforms.js';
import { toCsv } from './vitals-core.mjs';
import { installRuntimeDiagnostics } from './state/runtimeDiagnostics.js';

const defaults = { baselineWindow: 14, nightWindowMode: 'auto', fallbackStart: '21:00', fallbackEnd: '09:00' };
const fmt = (n, u = '') => (n == null ? '<span class="placeholder">Not available in this export</span>' : `${Number(n).toFixed(1)}${u}`);
const titleCase = (v) => v.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const page = (document.body.dataset.page || 'index');

const renderDateStrip = (selectedDate) => `<div class="date-strip">${getLastAvailableDays(getAvailableDates(), 7).map((d) => `<a class="btn ${d === selectedDate ? 'active' : ''}" href="${location.pathname}?date=${d}">${d}</a>`).join('')}</div>`;
const avg = (rows, key) => rows.length ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) / rows.length : null;
function showToast(message, kind = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${kind === 'error' ? 'error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2600);
}

function lineChart(rows, key, label, suffix = '') {
  const points = rows.map((r, i) => ({ x: i, y: r[key] })).filter((r) => r.y != null);
  if (!points.length) return `<div class="kpi"><div class="kpi-label">${label}</div><div class="placeholder">No data in selected range</div></div>`;
  const min = Math.min(...points.map((p) => p.y));
  const max = Math.max(...points.map((p) => p.y));
  const poly = points.map((p) => `${(p.x / Math.max(points.length - 1, 1)) * 320},${100 - ((p.y - min) / Math.max(max - min, 1)) * 80}`).join(' ');
  return `<div class="kpi"><div class="kpi-label">${label}</div><svg class="chart" viewBox="0 0 320 100"><polyline fill="none" stroke="#60a5fa" stroke-width="2" points="${poly}"/></svg><div class="small muted">Latest ${fmt(points.at(-1).y, suffix)}</div></div>`;
}

installRuntimeDiagnostics();

try {
  console.log('mpa-entry boot', location.pathname);
  renderTopNav(document.getElementById('topNav'), location.pathname);
  loadFromLocalCache();

  const settings = defaults;
  const dates = getAvailableDates();
  const preferred = new URLSearchParams(location.search).get('date') || loadSelectedDate() || null;
  const selectedDate = resolveInitialSelectedDate(dates, preferred);
  if (selectedDate) persistSelectedDate(selectedDate);
  const day = selectedDate ? getDay(selectedDate, settings) : null;
  const app = document.getElementById('app');

  const importController = createImportController({
    importZip: (file, onProgress) => importZip(file, settings, onProgress),
    onImported: () => location.reload(),
    onStateChange: () => {}
  });

  const globalInput = document.getElementById('globalImportInput');
  globalInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await importController.openWithFile(file);
  });

  if (page === 'index') {
    app.innerHTML = `<section class="card"><h2>By Date</h2>${renderDateStrip(selectedDate)}<div class="grid vitals-grid">
      <div class="kpi"><div class="kpi-label">Readiness score</div><div class="kpi-value">${fmt(day?.dailyReadiness?.score)}</div></div>
      <div class="kpi"><div class="kpi-label">Sleep score</div><div class="kpi-value">${fmt(day?.dailySleep?.score)}</div></div>
      <div class="kpi"><div class="kpi-label">Activity score</div><div class="kpi-value">${fmt(day?.dailyActivity?.score)}</div></div>
      <div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.rhr_night_bpm, ' bpm')}</div></div>
      <div class="kpi"><div class="kpi-label">Estimated HRV</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div></div>
      <div class="kpi"><div class="kpi-label">SpO2 Night Avg</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div></div>
      <div class="kpi"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(day?.dailyReadiness?.temperatureDeviation, '°C')}</div></div>
      <div class="kpi"><div class="kpi-label">Quick insight</div><div class="small muted">Window ${day?.heartRateWindowSummary?.modeUsed || 'n/a'} · HR points ${day?.heartRateWindowSummary?.points ?? 0}</div></div>
    </div></section>`;
  } else if (page === 'readiness') {
    const bars = contributorsToBars(day?.dailyReadiness?.contributors);
    const baseline = getBaseline('temperatureDeviation', settings.baselineWindow, selectedDate);
    app.innerHTML = `<section class="card"><h2>Readiness</h2>${renderDateStrip(selectedDate)}
      <div class="kpi"><div class="kpi-label">Score</div><div class="kpi-value">${fmt(day?.dailyReadiness?.score)}</div></div>
      <div class="kpi"><div class="kpi-label">Temperature deviation</div><div class="kpi-value">${fmt(day?.dailyReadiness?.temperatureDeviation, '°C')}</div><div class="small muted">Baseline ${fmt(baseline, '°C')} · Δ ${fmt((day?.dailyReadiness?.temperatureDeviation ?? null) - (baseline ?? 0), '°C')}</div></div>
      <h3>Contributors</h3>${bars.map((b) => `<div class="contributor-row"><div class="small">${titleCase(b.key)}: ${fmt(b.value)}</div><div class="progress"><span style="width:${Math.max(0, Math.min(100, b.value || 0))}%"></span></div></div>`).join('')}
    </section>`;
  } else if (page === 'activity') {
    const idx = dates.indexOf(selectedDate);
    const start = dates[Math.max(0, idx - 13)] || selectedDate;
    const range = getRange(start, selectedDate).dailyActivity;
    app.innerHTML = `<section class="card"><h2>Activity</h2>${renderDateStrip(selectedDate)}<div class="grid vitals-grid">
      <div class="kpi"><div class="kpi-label">Score</div><div class="kpi-value">${fmt(day?.dailyActivity?.score)}</div></div>
      <div class="kpi"><div class="kpi-label">Steps</div><div class="kpi-value">${fmt(day?.dailyActivity?.steps)}</div></div>
      <div class="kpi"><div class="kpi-label">Active calories</div><div class="kpi-value">${fmt(day?.dailyActivity?.activeCalories, ' cal')}</div></div>
      <div class="kpi"><div class="kpi-label">14-day averages</div><div class="small muted">Steps ${fmt(avg(range, 'steps'))} · Calories ${fmt(avg(range, 'activeCalories'))}</div></div>
    </div></section>`;
  } else if (page === 'vitals') {
    const b = {
      rhr: getBaseline('rhr_night_bpm', settings.baselineWindow, selectedDate),
      hrv: getBaseline('hrv_rmssd_proxy_ms', settings.baselineWindow, selectedDate),
      spo2: getBaseline('spo2Average', settings.baselineWindow, selectedDate)
    };
    app.innerHTML = `<section class="card"><h2>Vitals</h2>${renderDateStrip(selectedDate)}<div class="grid vitals-grid">
      <div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.rhr_night_bpm, ' bpm')}</div><div class="small muted">Baseline ${fmt(b.rhr, ' bpm')} · Δ ${fmt((day?.derivedNightlyVitals?.rhr_night_bpm ?? 0) - (b.rhr ?? 0), ' bpm')}</div></div>
      <div class="kpi"><div class="kpi-label">HRV proxy</div><div class="kpi-value">${fmt(day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms, ' ms')}</div><div class="small muted">Baseline ${fmt(b.hrv, ' ms')} · Δ ${fmt((day?.derivedNightlyVitals?.hrv_rmssd_proxy_ms ?? 0) - (b.hrv ?? 0), ' ms')}</div></div>
      <div class="kpi"><div class="kpi-label">SpO2</div><div class="kpi-value">${fmt(day?.dailySpo2?.spo2Average, '%')}</div><div class="small muted">Baseline ${fmt(b.spo2, '%')}</div></div>
      <div class="kpi"><div class="kpi-label">Temp deviation</div><div class="kpi-value">${fmt(day?.dailyReadiness?.temperatureDeviation, '°C')}</div></div>
    </div></section>`;
  } else if (page === 'trends') {
    const window = Number(new URLSearchParams(location.search).get('window') || '14');
    const idx = dates.indexOf(selectedDate);
    const start = dates[Math.max(0, idx - (window - 1))] || selectedDate;
    const range = getRange(start, selectedDate);
    const makeBtn = (n) => `<a class="btn ${window === n ? 'active' : ''}" href="${location.pathname}?window=${n}&date=${selectedDate}">${n}d</a>`;
    app.innerHTML = `<section class="card"><h2>Trends</h2><div class="row">${[7, 14, 30, 90].map(makeBtn).join('')}</div><div class="grid vitals-grid">
      ${lineChart(range.dailyReadiness, 'score', 'Readiness score')}
      ${lineChart(range.dailySleep, 'score', 'Sleep score')}
      ${lineChart(range.dailyActivity, 'score', 'Activity score')}
      ${lineChart(range.derivedNightlyVitals, 'rhr_night_bpm', 'RHR', ' bpm')}
      ${lineChart(range.derivedNightlyVitals, 'hrv_rmssd_proxy_ms', 'HRV', ' ms')}
      ${lineChart(range.dailySpo2, 'spo2Average', 'SpO2', '%')}
      ${lineChart(range.dailyReadiness, 'temperatureDeviation', 'Temp deviation', '°C')}
    </div></section>`;
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
        const range = result?.dateRange || {};
        const summary = `Data loaded: ${range.start || 'n/a'} -> ${range.end || 'n/a'} (${range.days || 0} days)`;
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
        showToast(`Import failed: ${message}`, 'error');
      }
    });
  } else if (page === 'data-tools-export') {
    const snapshot = getStoreSnapshot();
    setUiSnapshot({ generatedAt: new Date().toISOString(), selectedDate, data: snapshot.datasets, derivedNightlyVitals: snapshot.derivedNightlyVitals, ingestReport: snapshot.ingestReport });
    app.innerHTML = `<section class="card"><h2>Export</h2><div class="row"><button class="btn" id="csvExport">derived_nightly_vitals.csv</button><button class="btn" id="jsonExport">normalized_all.json</button></div></section>`;
    document.getElementById('csvExport')?.addEventListener('click', () => {
      const blob = new Blob([toCsv(snapshot.derivedNightlyVitals || [])], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'derived_nightly_vitals.csv'; a.click(); URL.revokeObjectURL(a.href);
    });
    document.getElementById('jsonExport')?.addEventListener('click', () => {
      const data = { metadata: { generatedAt: new Date().toISOString(), selectedDate }, uiSnapshot: snapshot.uiSnapshot, ingestReport: snapshot.ingestReport, datasets: snapshot.datasets, derivedNightlyVitals: snapshot.derivedNightlyVitals };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'normalized_all.json'; a.click(); URL.revokeObjectURL(a.href);
    });
  } else if (page === 'glossary') {
    const rows = [...byDateUiMapping, ...sleepUiMapping, ...readinessUiMapping, ...activityUiMapping, ...vitalsUiMapping, ...trendsUiMapping];
    app.innerHTML = `<section class="card"><h2>Glossary</h2><table class="simple-table"><thead><tr><th>Page</th><th>UI element</th><th>Source paths</th><th>Transform</th><th>Fallback</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r.page} / ${r.section}</td><td>${r.element}</td><td>${(r.sourcePaths || []).join('<br/>')}</td><td>${r.transform}</td><td>${r.fallback}</td></tr>`).join('')}</tbody></table></section>`;
  } else {
    app.innerHTML = `<section class="card"><h2>${titleCase(page)}</h2><p class="muted">Content available in dashboard tabs.</p></section>`;
  }

  document.documentElement.dataset.js = '1';
  window.addEventListener('unhandledrejection', (event) => setImportError(event.reason || new Error('Unhandled rejection')));
} catch (error) {
  setImportError(error, { page });
  document.getElementById('app').innerHTML = `<section class="fatal-card"><h2>App failed to load</h2><pre class="status">${String(error?.stack || error)}</pre></section>`;
}

