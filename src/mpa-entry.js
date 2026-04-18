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

const PAGE_META = {
  index: {
    title: 'Home',
    subtitle: 'Daily and multi-day snapshot across Readiness, Sleep, Activity, Heart Rate, and Stress.'
  },
  readiness: { title: 'Readiness', subtitle: 'Recovery readiness summary for the selected period.' },
  sleep: { title: 'Sleep', subtitle: 'Sleep quality and overnight recovery signals.' },
  activity: { title: 'Activity', subtitle: 'Movement load and consistency across the selected period.' },
  'heart-rate': { title: 'Heart Rate', subtitle: 'Overnight heart rate and variability trends.' },
  stress: { title: 'Stress', subtitle: 'Stress-related recovery proxy from available data.' },
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
    activity_balance: 'Activity balance',
    body_temperature: 'Body temperature',
    hrv_balance: 'HRV balance',
    previous_day_activity: 'Previous day activity',
    previous_night: 'Previous night',
    recovery_index: 'Recovery index',
    resting_heart_rate: 'Resting heart rate',
    sleep_balance: 'Sleep balance',
    sleep_regularity: 'Sleep regularity'
  },
  sleep: {
    deep_sleep: 'Deep sleep',
    rem_sleep: 'REM sleep',
    latency: 'Latency',
    timing: 'Timing',
    efficiency: 'Efficiency',
    restfulness: 'Restfulness',
    total_sleep: 'Total sleep'
  },
  activity: {
    meet_daily_targets: 'Meet targets',
    move_every_hour: 'Move hourly',
    recovery_time: 'Recovery time',
    stay_active: 'Stay active',
    training_frequency: 'Training frequency',
    training_volume: 'Training volume'
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
    const value = average(rangeRows.derivedNightlyVitals, 'hrv_rmssd_proxy_ms');
    return {
      domain,
      title: 'Stress',
      value: fmt(value, 1, ' ms'),
      sub: 'Recovery proxy'
    };
  }

  const [dataset, key] = SCORE_FIELDS[domain] || [];
  const source = dataset ? rangeRows[dataset] : [];
  const value = range.isSingleDay ? day?.[dataset]?.[key] : average(source, key);

  return {
    domain,
    title: PAGE_META[domain]?.title || domain,
    value: fmt(value),
    sub: range.isSingleDay ? 'Selected day' : 'Range average'
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
      (item) => `<article class="metric-card"><div class="metric-label">${item.label}</div><div class="metric-value">${item.value}</div><div class="metric-note">${item.note || ''}</div></article>`
    )
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
    .map(([key, total]) => ({
      key,
      label: labels[key] || key,
      avg: total / (counts.get(key) || 1)
    }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 6);
}

function renderContributorRows(rows) {
  if (!rows.length) return '<div class="placeholder">No contributor data available for this range.</div>';
  return `<div class="contributor-list">${rows
    .map(
      (row) => `<div class="contributor-row"><div class="row split-row"><span>${row.label}</span><strong>${Math.round(row.avg)}</strong></div><div class="progress"><span style="width:${Math.max(0, Math.min(100, row.avg))}%"></span></div></div>`
    )
    .join('')}</div>`;
}

function renderPreviewCard({ title, subtitle, metrics, footer }) {
  return `
    <section class="card section-card">
      <div class="section-head">
        <h3>${title}</h3>
        <p class="muted">${subtitle}</p>
      </div>
      ${renderMetricGrid(metrics)}
      <p class="small muted">${footer}</p>
    </section>
  `;
}

function renderHome(range, day, rangeRows) {
  const summaries = DOMAIN_ORDER.map((domain) => metricDomainSummary(domain, range, day, rangeRows));
  const readiness = summaries.find((item) => item.domain === 'readiness');
  const heroDetail = range.isSingleDay
    ? `Selected day: ${range.end || 'n/a'}.`
    : `Multi-day mode: values are averages for ${summarizeRange(range)}.`;

  const sleepRows = rangeRows.dailySleep || [];
  const activityRows = rangeRows.dailyActivity || [];
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
      status: range.isSingleDay ? 'Single day' : 'Range average',
      detail: heroDetail,
      extra: '<p class="muted">Focus on consistency: strong sleep plus balanced activity improves readiness trends.</p>'
    })}

    ${renderPreviewCard({
      title: 'Sleep preview',
      subtitle: range.isSingleDay ? 'Overnight sleep snapshot' : 'Range sleep average',
      metrics: [
        { label: 'Sleep score', value: fmt(range.isSingleDay ? day?.dailySleep?.score : average(sleepRows, 'score')) },
        { label: 'Efficiency', value: fmt(average(rangeRows.sleepModel, 'efficiencyPct'), 0, '%'), note: 'From Sleep Model when available' },
        { label: 'Avg HR', value: fmt(average(rangeRows.sleepModel, 'avgHeartRate'), 1, ' bpm') },
        { label: 'Avg HRV', value: fmt(average(rangeRows.sleepModel, 'avgHrv'), 1, ' ms') }
      ],
      footer: 'Preview card uses available data only. Full sleep deep-dive remains in the Sleep tab.'
    })}

    ${renderPreviewCard({
      title: 'Activity preview',
      subtitle: range.isSingleDay ? 'Selected day movement' : 'Range movement summary',
      metrics: [
        { label: 'Activity score', value: fmt(range.isSingleDay ? day?.dailyActivity?.score : average(activityRows, 'score')) },
        { label: 'Steps', value: fmt(average(activityRows, 'steps'), 0) },
        { label: 'Active calories', value: fmt(average(activityRows, 'activeCalories'), 0, ' cal') },
        { label: 'Inactivity alerts', value: fmt(average(activityRows, 'inactivityAlerts'), 1) }
      ],
      footer: 'Activity preview reflects selected range; detailed contributors remain on Activity tab.'
    })}

    ${renderPreviewCard({
      title: 'Stress preview',
      subtitle: 'Derived from available nightly variability proxy',
      metrics: [
        { label: 'Stress proxy', value: fmt(average(vitalsRows, 'hrv_rmssd_proxy_ms'), 1, ' ms') },
        { label: 'Resting HR', value: fmt(average(vitalsRows, 'rhr_night_bpm'), 1, ' bpm') },
        { label: 'Data points', value: fmt(vitalsRows.length, 0) },
        { label: 'Mode', value: range.isSingleDay ? 'Daily' : 'Range avg' }
      ],
      footer: 'Stress model depth is intentionally limited in PR2 and will expand in follow-up PRs.'
    })}

    ${renderPreviewCard({
      title: 'Heart Rate preview',
      subtitle: range.isSingleDay ? 'Single-day overnight' : 'Multi-day heart trend snapshot',
      metrics: [
        { label: 'Overnight avg', value: fmt(range.isSingleDay ? day?.heartRateWindowSummary?.avg : average(vitalsRows, 'rhr_night_bpm'), 1, ' bpm') },
        { label: 'Min overnight', value: fmt(day?.heartRateWindowSummary?.min, 1, ' bpm') },
        { label: 'Max overnight', value: fmt(day?.heartRateWindowSummary?.max, 1, ' bpm') },
        { label: 'Points', value: fmt(day?.heartRateWindowSummary?.points, 0) }
      ],
      footer: 'Heart Rate tab contains the dedicated range-aware detail view scaffold.'
    })}
  `;
}

function renderDomainPage(pageKey, range, day, rangeRows) {
  const [datasetKey, scoreKey] = SCORE_FIELDS[pageKey] || [];
  const title = PAGE_META[pageKey]?.title || pageKey;
  const labelMap = CONTRIBUTOR_LABELS[pageKey] || {};
  const dataRows = datasetKey ? rangeRows[datasetKey] || [] : [];
  const dayValue = datasetKey ? day?.[datasetKey]?.[scoreKey] : null;
  const rangeValue = datasetKey ? average(dataRows, scoreKey) : null;

  const baseMetrics = [
    { label: range.isSingleDay ? 'Selected day score' : 'Range average score', value: fmt(range.isSingleDay ? dayValue : rangeValue) },
    { label: 'Window', value: summarizeRange(range) }
  ];

  if (pageKey === 'sleep') {
    baseMetrics.push(
      { label: 'Sleep model efficiency', value: fmt(average(rangeRows.sleepModel, 'efficiencyPct'), 0, '%') },
      { label: 'Avg HRV', value: fmt(average(rangeRows.sleepModel, 'avgHrv'), 1, ' ms') }
    );
  }

  if (pageKey === 'activity') {
    baseMetrics.push(
      { label: 'Avg steps', value: fmt(average(dataRows, 'steps'), 0) },
      { label: 'Active calories', value: fmt(average(dataRows, 'activeCalories'), 0, ' cal') }
    );
  }

  const contributorRows = summarizeContributors(dataRows, labelMap);

  return `
    ${renderHeroCard({
      eyebrow: `${title} hero`,
      title: `${title} summary`,
      value: fmt(range.isSingleDay ? dayValue : rangeValue),
      status: range.isSingleDay ? 'Single day' : 'Range average',
      detail: range.isSingleDay
        ? `Daily view for ${range.end || 'n/a'}.`
        : `Multi-day view for ${summarizeRange(range)}. Hero and contributors show averaged values.`
    })}

    <section class="card section-card">
      <div class="section-head">
        <h3>Key metrics</h3>
        <p class="muted">Compact overview using the shared card and metric system.</p>
      </div>
      ${renderMetricGrid(baseMetrics)}
    </section>

    <section class="card section-card">
      <div class="section-head">
        <h3>Contributors</h3>
        <p class="muted">Top contributors for the selected date/range.</p>
      </div>
      ${renderContributorRows(contributorRows)}
    </section>

    <section class="card section-card">
      <div class="section-head">
        <h3>Detail card</h3>
        <p class="muted">Unified chart/detail chrome in place. Full parity mapping continues in PR3+.</p>
      </div>
      <div class="placeholder">Detailed visual layers are intentionally deferred while preserving real data summaries.</div>
    </section>
  `;
}

function renderHeartRatePage(range, day, rangeRows) {
  const rhr = average(rangeRows.derivedNightlyVitals, 'rhr_night_bpm');
  const hrvProxy = average(rangeRows.derivedNightlyVitals, 'hrv_rmssd_proxy_ms');
  const heroValue = range.isSingleDay ? day?.heartRateWindowSummary?.avg : rhr;

  return `
    ${renderHeroCard({
      eyebrow: 'Heart Rate hero',
      title: 'Overnight heart-rate summary',
      value: fmt(heroValue, 1, ' bpm'),
      status: range.isSingleDay ? 'Single day' : 'Range average',
      detail: range.isSingleDay
        ? 'Single-day overnight summary from selected date.'
        : `Multi-day range average for ${summarizeRange(range)}.`
    })}

    <section class="card section-card">
      <div class="section-head"><h3>Metrics</h3><p class="muted">Range-aware values from derived nightly vitals.</p></div>
      ${renderMetricGrid([
        { label: 'Resting HR (range avg)', value: fmt(rhr, 1, ' bpm') },
        { label: 'HRV proxy', value: fmt(hrvProxy, 1, ' ms') },
        { label: 'Overnight points', value: fmt(day?.heartRateWindowSummary?.points, 0) },
        { label: 'Range', value: summarizeRange(range) }
      ])}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Trend card</h3><p class="muted">Shared trend card styling for chart surfaces.</p></div>
      <div class="placeholder">Trend visualization scaffold is in place and will be deepened in PR3+.</div>
    </section>
  `;
}

function renderStressPage(range, rangeRows) {
  const stressProxy = average(rangeRows.derivedNightlyVitals, 'hrv_rmssd_proxy_ms');
  const restingHr = average(rangeRows.derivedNightlyVitals, 'rhr_night_bpm');

  return `
    ${renderHeroCard({
      eyebrow: 'Stress hero',
      title: 'Stress and recovery snapshot',
      value: fmt(stressProxy, 1, ' ms'),
      status: range.isSingleDay ? 'Single day' : 'Range average',
      detail: 'Stress summary currently uses available derived proxies only (no fabricated values).'
    })}

    <section class="card section-card">
      <div class="section-head"><h3>Stress metrics</h3><p class="muted">Compact cards with consistent grid behavior.</p></div>
      ${renderMetricGrid([
        { label: 'Stress proxy', value: fmt(stressProxy, 1, ' ms') },
        { label: 'Resting HR', value: fmt(restingHr, 1, ' bpm') },
        { label: 'Days in range', value: fmt((rangeRows.derivedNightlyVitals || []).length, 0) },
        { label: 'Selected range', value: summarizeRange(range) }
      ])}
    </section>

    <section class="card section-card">
      <div class="section-head"><h3>Contributors</h3><p class="muted">Shared contributor row treatment.</p></div>
      ${renderContributorRows(
        [
          { label: 'Recovery variability', avg: Number.isFinite(stressProxy) ? Math.max(0, Math.min(100, stressProxy)) : null },
          { label: 'Overnight resting HR', avg: Number.isFinite(restingHr) ? Math.max(0, Math.min(100, 100 - restingHr)) : null }
        ].filter((item) => Number.isFinite(item.avg))
      )}
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

function renderSettingsPage(range, rangeRows) {
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

function renderPageShell(app, title, subtitle) {
  app.innerHTML = `
    <section class="page-header card">
      <div>
        <p class="eyebrow">Oura dashboard</p>
        <h1>${title}</h1>
        <p class="muted">${subtitle}</p>
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

function renderPageContent(range, day, rangeRows) {
  const content = document.getElementById('pageContent');
  if (!content) return;

  if (page === 'index') {
    content.innerHTML = renderHome(range, day, rangeRows);
    return;
  }

  if (page === 'settings') {
    renderSettingsPage(range, rangeRows);
    return;
  }

  if (page === 'heart-rate') {
    content.innerHTML = renderHeartRatePage(range, day, rangeRows);
    return;
  }

  if (page === 'stress') {
    content.innerHTML = renderStressPage(range, rangeRows);
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

  loadFromLocalCache();
  const availableDates = getAvailableDates();
  const persisted = loadSelectedRange();
  const initialRange = resolveSelectedRange(availableDates, persisted);
  persistSelectedRange({ preset: initialRange.preset, start: initialRange.start, end: initialRange.end });

  const app = document.getElementById('app');
  if (!app) throw new Error('Missing app mount node');

  const meta = PAGE_META[page] || PAGE_META.index;
  renderPageShell(app, meta.title, meta.subtitle);

  const rerender = (range) => {
    const rangeRows = range.start && range.end
      ? getRange(range.start, range.end)
      : { dailySleep: [], dailyReadiness: [], dailyActivity: [], derivedNightlyVitals: [], sleepModel: [], dailySpo2: [] };
    const day = range.end ? getDay(range.end, settings) : null;
    mountDateRangeControl(availableDates, range, rerender);
    renderPageContent(range, day, rangeRows);
  };

  rerender(initialRange);
  hideBootShell();
}

bootstrap().catch((error) => {
  setImportError(error, { source: 'bootstrap' });
  console.error(error);
  hideBootShell();
});
