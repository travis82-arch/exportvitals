import { renderTopNav } from './components/TopNav.js';
import { renderDateRangeControl } from './components/DateRangeControl.js';
import {
  loadFromLocalCache,
  importZip,
  getAvailableDates,
  getDay,
  getRange,
  getStoreSnapshot,
  setImportError
} from './store/dataStore.js';
import { loadSettings } from './state/settings.js';
import { loadSelectedRange, persistSelectedRange, resolveSelectedRange, summarizeRange } from './state/selectedRange.js';
import { installRuntimeDiagnostics } from './state/runtimeDiagnostics.js';
import { hasPurgedReloadFlag, purgeStaleServiceWorkersAndCaches, setPurgedReloadFlag } from './boot/swPurge.js';

const page = document.body.dataset.page || 'index';
const settings = loadSettings();

const SCORE_FIELDS = {
  readiness: ['dailyReadiness', 'score'],
  sleep: ['dailySleep', 'score'],
  activity: ['dailyActivity', 'score']
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

function hideBootShell() {
  const bootShell = document.getElementById('bootShell');
  if (bootShell) bootShell.style.display = 'none';
}

function toPageTitle() {
  const map = {
    index: 'Home',
    readiness: 'Readiness',
    sleep: 'Sleep',
    activity: 'Activity',
    'heart-rate': 'Heart Rate',
    stress: 'Stress',
    settings: 'Settings'
  };
  return map[page] || 'Oura Dashboard';
}

function renderPageShell(app, title, subtitle) {
  app.innerHTML = `
    <section class="page-header card">
      <h1>${title}</h1>
      <p class="muted">${subtitle}</p>
    </section>
    <section id="dateRangeMount"></section>
    <section id="pageContent" class="grid"></section>
  `;
}

function renderScoreCard({ title, value, detail }) {
  return `<article class="kpi"><div class="kpi-label">${title}</div><div class="kpi-value">${value}</div><div class="small muted">${detail}</div></article>`;
}

function renderOverviewCards(rangeRows) {
  return `
    <section class="card">
      <h2>Overview</h2>
      <div class="grid compact">
        ${renderScoreCard({ title: 'Readiness score', value: fmt(average(rangeRows.dailyReadiness, 'score')), detail: 'Range average' })}
        ${renderScoreCard({ title: 'Sleep score', value: fmt(average(rangeRows.dailySleep, 'score')), detail: 'Range average' })}
        ${renderScoreCard({ title: 'Activity score', value: fmt(average(rangeRows.dailyActivity, 'score')), detail: 'Range average' })}
        ${renderScoreCard({ title: 'Overnight HR', value: fmt(average(rangeRows.derivedNightlyVitals, 'rhr_night_bpm'), 1, ' bpm'), detail: 'Range average' })}
      </div>
    </section>
  `;
}

function renderMainPage(pageKey, range, day, rangeRows) {
  const content = document.getElementById('pageContent');
  if (!content) return;

  if (pageKey === 'index') {
    content.innerHTML = `
      ${renderOverviewCards(rangeRows)}
      <section class="card">
        <h2>Home previews</h2>
        <div class="grid compact">
          ${['Readiness', 'Sleep', 'Activity', 'Heart Rate', 'Stress'].map((label) => `<article class="kpi"><div class="kpi-label">${label}</div><div class="small muted">Aligned to ${summarizeRange(range)}</div></article>`).join('')}
        </div>
      </section>
    `;
    return;
  }

  if (pageKey === 'heart-rate') {
    const hrAvg = range.isSingleDay ? day?.heartRateWindowSummary?.avg : average(rangeRows.derivedNightlyVitals, 'rhr_night_bpm');
    content.innerHTML = `
      <section class="card"><h2>Heart Rate summary</h2><div class="grid compact">${renderScoreCard({ title: range.isSingleDay ? 'Overnight average HR' : 'Range average RHR', value: fmt(hrAvg, 1, ' bpm'), detail: range.isSingleDay ? 'Single-day detail view' : 'Multi-day aggregate view' })}</div></section>
      <section class="card"><h3>Details</h3><p class="muted">${range.isSingleDay ? `Window points: ${day?.heartRateWindowSummary?.points || 0}` : 'Range summary chart coming next PR.'}</p></section>
    `;
    return;
  }

  if (pageKey === 'stress') {
    content.innerHTML = `
      <section class="card"><h2>Stress summary</h2><div class="grid compact">
        ${renderScoreCard({ title: 'Stress proxy', value: fmt(average(rangeRows.derivedNightlyVitals, 'hrv_rmssd_proxy_ms'), 1, ' ms'), detail: 'Derived from nightly HRV proxy' })}
      </div></section>
      <section class="card"><h3>Contributors</h3><p class="muted">${range.isSingleDay ? 'Single-day stress detail scaffold ready.' : 'Multi-day contributor aggregation scaffold ready; deeper mapping in PR2.'}</p></section>
    `;
    return;
  }

  const [datasetKey, field] = SCORE_FIELDS[pageKey] || [];
  const rangeAvg = average(rangeRows[datasetKey], field);
  const singleValue = day?.[datasetKey]?.[field];

  content.innerHTML = `
    <section class="card">
      <h2>${toPageTitle()} hero</h2>
      <div class="grid compact">
        ${renderScoreCard({
          title: range.isSingleDay ? 'Selected day score' : 'Range average score',
          value: fmt(range.isSingleDay ? singleValue : rangeAvg),
          detail: range.isSingleDay ? `Date: ${range.end || 'n/a'}` : `Window: ${summarizeRange(range)}`
        })}
      </div>
    </section>
    <section class="card">
      <h3>${range.isSingleDay ? 'Detail view' : 'Trend summary'}</h3>
      <p class="muted">${range.isSingleDay ? 'Detailed day sections stay enabled for this tab.' : 'Daily aggregate trend section scaffolded; final visualization follows in PR2.'}</p>
    </section>
  `;
}

function diagnosticsText(range) {
  const snapshot = getStoreSnapshot();
  return JSON.stringify(
    {
      parsedFiles: snapshot.ingestReport?.parsedFiles || [],
      rowCounts: snapshot.ingestReport?.rowCounts || {},
      ingestReport: snapshot.ingestReport || {},
      availabilityMatrix: snapshot.availabilityMatrix || {},
      selectedRange: range,
      lastImportError: snapshot.importState?.lastError || null
    },
    null,
    2
  );
}

function renderSettingsPage(range) {
  const content = document.getElementById('pageContent');
  if (!content) return;

  content.innerHTML = `
    <section class="card">
      <h2>Data</h2>
      <p class="muted">Upload one Oura ZIP file. Uploading a new ZIP replaces the currently cached dataset.</p>
      <input id="settingsUploadInput" type="file" accept=".zip,application/zip">
      <div id="uploadStatus" class="small muted top-gap"></div>
    </section>
    <section class="card">
      <h2>My Health</h2>
      <div class="grid compact">
        <article class="kpi"><div class="kpi-label">Sleep Health</div><div class="small muted">Section scaffold</div></article>
        <article class="kpi"><div class="kpi-label">Stress Management</div><div class="small muted">Section scaffold</div></article>
        <article class="kpi"><div class="kpi-label">Heart Health</div><div class="small muted">Section scaffold</div></article>
        <article class="kpi"><div class="kpi-label">Habits and routines</div><div class="small muted">Section scaffold</div></article>
      </div>
    </section>
    <section class="card">
      <div class="row split-row"><h2>Debug</h2><button id="copyDebugBtn" class="btn secondary" type="button">Copy</button></div>
      <textarea id="debugText" class="debug-text" readonly>${diagnosticsText(range)}</textarea>
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
      await importZip(file, settings, (progress) => {
        status.textContent = `${progress.phase} (${progress.percent}%)`;
      });
      window.location.reload();
    } catch (error) {
      setImportError(error, { source: 'settings-upload' });
      status.textContent = `Import failed: ${error?.message || String(error)}`;
      const debugText = content.querySelector('#debugText');
      if (debugText) debugText.value = diagnosticsText(range);
    }
  });

  content.querySelector('#copyDebugBtn')?.addEventListener('click', async () => {
    const debugText = content.querySelector('#debugText');
    await navigator.clipboard.writeText(debugText?.value || '');
  });
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

  loadFromLocalCache();
  const availableDates = getAvailableDates();
  const persisted = loadSelectedRange();
  const initialRange = resolveSelectedRange(availableDates, persisted);
  persistSelectedRange({ preset: initialRange.preset, start: initialRange.start, end: initialRange.end });

  const app = document.getElementById('app');
  if (!app) throw new Error('Missing app mount node');

  renderPageShell(app, toPageTitle(), 'Shared date-range selection persists across tabs.');

  const rerender = (range) => {
    const rangeRows = range.start && range.end ? getRange(range.start, range.end) : {
      dailySleep: [], dailyReadiness: [], dailyActivity: [], derivedNightlyVitals: [], sleepModel: [], dailySpo2: []
    };
    const day = range.end ? getDay(range.end, settings) : null;
    mountDateRangeControl(availableDates, range, rerender);

    if (page === 'settings') {
      renderSettingsPage(range);
    } else {
      renderMainPage(page, range, day, rangeRows);
    }
  };

  rerender(initialRange);
  hideBootShell();
}

bootstrap().catch((error) => {
  setImportError(error, { source: 'bootstrap' });
  console.error(error);
  hideBootShell();
});
