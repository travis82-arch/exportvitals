import {
  normalizeName,
  sniffDelimiter,
  toNumber,
  baselineMedian,
  median,
  readJournalEntries,
  saveJournalEntries,
  summarizeMet,
  parseContributors,
  parseSpo2Average,
  toCsv,
  createDateContext,
  getScopeRange,
  rowsForRange,
  aggregateKey,
  shiftIsoDate,
  isoWeekStart,
  monthStart
} from './vitals-core.mjs';

const STORAGE_KEY = 'ouraDerivedMetricsV4';
const SETTINGS_KEY = 'ouraDashboardSettingsV2';
const JOURNAL_KEY = 'ouraJournalEntriesV1';

const DATASET_ALIASES = {
  dailyReadiness: ['dailyreadiness.csv'], dailySleep: ['dailysleep.csv'], dailyActivity: ['dailyactivity.csv'], dailySpo2: ['dailyspo2.csv'], sleepTime: ['sleeptime.csv'], heartRate: ['heartrate.csv']
};

const ROUTES = {
  '/by-date': 'byDatePage', '/readiness': 'readinessPage', '/sleep': 'sleepPage', '/activity': 'activityPage', '/vitals': 'vitalsPage', '/my-health': 'myHealthPage', '/my-health/trends': 'myHealthTrendsPage', '/my-health/journal': 'myHealthJournalPage', '/my-health/data-tools/import': 'myHealthDataToolsImportPage', '/my-health/data-tools/export': 'myHealthDataToolsExportPage', '/my-health/data-tools/glossary': 'myHealthDataToolsGlossaryPage', '/my-health/data-tools/debug': 'myHealthDataToolsDebugPage', '/my-health/settings': 'myHealthSettingsPage'
};

const readinessNames = { activity_balance: 'Activity Balance', body_temperature: 'Body Temperature', hrv_balance: 'HRV Balance', previous_day_activity: 'Previous Day Activity', previous_night: 'Previous Night', recovery_index: 'Recovery Index', resting_heart_rate: 'Resting Heart Rate', sleep_balance: 'Sleep Balance', sleep_regularity: 'Sleep Regularity' };
const sleepNames = { deep_sleep: 'Deep Sleep', rem_sleep: 'REM Sleep', latency: 'Sleep Latency', timing: 'Sleep Timing', efficiency: 'Sleep Efficiency', restfulness: 'Restfulness', total_sleep: 'Total Sleep' };
const activityNames = { meet_daily_targets: 'Meet Daily Targets', move_every_hour: 'Move Every Hour', recovery_time: 'Recovery Time', stay_active: 'Stay Active', training_frequency: 'Training Frequency', training_volume: 'Training Volume' };

const defaultSettings = { baselineWindow: 14, rememberDerived: false, nightMode: 'auto', fallbackStart: '20:00', fallbackEnd: '10:00', unitsDistance: 'km', developerMode: false };
const app = { state: null, settings: loadSettings(), dateCtx: createDateContext([]) };

function loadSettings() { try { return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; } catch { return { ...defaultSettings }; } }
function persistSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings)); }
const fmt = (v, d = 1, s = '') => (v == null ? '—' : `${Number(v).toFixed(d)}${s}`);

function parseDate(raw) { const d = new Date(raw); return Number.isNaN(d.getTime()) ? (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null) : d.toISOString().slice(0, 10); }
function normalizeRoute(routeLike) { const route = String(routeLike || '').replace(/^#/, '').replace(/\/$/, '') || '/by-date'; return ROUTES[route] ? route : '/by-date'; }
function navigate(route) { location.hash = normalizeRoute(route); }

function parseCsvWithDebug(text) { const sniff = sniffDelimiter(text); const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: sniff.delimiter }); return { rows: parsed.data || [] }; }
function detectRegistry(entries) { const registry = {}; for (const entry of entries) { const n = normalizeName(entry.name.split('/').pop()); for (const [dataset, aliases] of Object.entries(DATASET_ALIASES)) if (aliases.some((a) => normalizeName(a) === n)) registry[dataset] = entry; } return registry; }

function buildNightlyVitals(heartRows, sleepRows) {
  const windows = new Map();
  for (const row of sleepRows) {
    const date = parseDate(row.day || row.date);
    windows.set(date, {
      start: new Date(row.bedtime_start || row.start_datetime || `${date}T${app.settings.fallbackStart}:00`),
      end: new Date(row.bedtime_end || row.end_datetime || `${date}T${app.settings.fallbackEnd}:00`)
    });
  }
  const grouped = new Map();
  for (const row of heartRows) {
    const ts = new Date(row.timestamp); const bpm = toNumber(row.bpm); if (Number.isNaN(ts.getTime()) || bpm == null || bpm < 30 || bpm > 120) continue;
    const date = parseDate(ts.toISOString()); const window = windows.get(date) || { start: new Date(`${date}T${app.settings.fallbackStart}:00`), end: new Date(`${date}T${app.settings.fallbackEnd}:00`) };
    if (ts < window.start || ts > window.end) continue;
    const bucket = grouped.get(date) || { date, bpms: [] }; bucket.bpms.push(bpm); grouped.set(date, bucket);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map((n) => {
    const bpms = n.bpms.sort((a, b) => a - b); const rhr = bpms[Math.floor(bpms.length * 0.05)] ?? null;
    const rr = bpms.map((b) => 60000 / b); let rmssd = null;
    if (rr.length > 3) { const diffs = rr.slice(1).map((v, i) => v - rr[i]); rmssd = Math.sqrt(diffs.reduce((a, d) => a + d * d, 0) / diffs.length); }
    return { date: n.date, rhr_night_bpm: rhr, hrv_rmssd_proxy_ms: rmssd };
  });
}

function rowByDate(rows, date) { return rows.find((r) => r.date === date) || null; }
function getContextual(rows, key) {
  const range = getScopeRange(app.dateCtx.scope, app.dateCtx.selectedDate); if (!range) return { value: null };
  if (app.dateCtx.scope === 'day') return { value: rowByDate(rows, app.dateCtx.selectedDate)?.[key] ?? null };
  const agg = aggregateKey(rowsForRange(rows, range.start, range.end), key); return { value: agg.median, min: agg.min, max: agg.max, count: agg.count };
}
function baselineFor(rows, key) {
  const before = rows.filter((r) => r.date < app.dateCtx.selectedDate && r[key] != null);
  return median(before.slice(-app.settings.baselineWindow).map((r) => r[key]));
}
function scopeLabel() {
  const r = getScopeRange(app.dateCtx.scope, app.dateCtx.selectedDate); if (!r) return 'No data';
  if (app.dateCtx.scope === 'day') return `Day · ${r.start}`;
  if (app.dateCtx.scope === 'week') return `Week of ${isoWeekStart(app.dateCtx.selectedDate)}`;
  return `Month of ${monthStart(app.dateCtx.selectedDate).slice(0, 7)}`;
}

function buildInsights(state) {
  const defs = [
    ['readinessScore', 'Readiness Score', 'Higher readiness usually reflects stronger recovery.'],
    ['sleepScore', 'Sleep Score', 'Sleep quality strongly affects next-day readiness.'],
    ['activityScore', 'Activity Score', 'Balanced daily movement supports long-term health.'],
    ['rhr_night_bpm', 'RHR Night', 'Lower resting heart rate often indicates better recovery.'],
    ['hrv_rmssd_proxy_ms', 'Estimated HRV (RMSSD proxy)', 'Higher HRV can indicate stronger adaptability.']
  ];
  return defs.map(([key, label, why]) => {
    const src = key.includes('rhr_') || key.includes('hrv_') ? state.nightlyVitalsRows : key === 'sleepScore' ? state.dailySleepRows : key === 'activityScore' ? state.dailyActivityRows : state.dailyReadinessRows;
    const current = getContextual(src, key).value; const baseline = baselineFor(src, key);
    const delta = current != null && baseline != null ? current - baseline : null;
    const warn = key === 'rhr_night_bpm' ? delta > 3 : delta < -5;
    const good = key === 'rhr_night_bpm' ? delta < -2 : delta > 4;
    const severity = delta == null ? 'info' : good ? 'good' : warn ? 'warn' : 'info';
    return { id: key, title: label, severity, latest: current, baseline, delta, why, tryText: 'Keep routines consistent, hydrate, and prioritize sleep timing.' };
  }).sort((a, b) => ({ good: 0, warn: 1, info: 2 }[a.severity] - ({ good: 0, warn: 1, info: 2 }[b.severity])));
}

function contributorsTable(map, obj) {
  if (!obj) return '<div class="muted">No contributors for selected scope.</div>';
  return `<table class="simple-table"><thead><tr><th>Contributor</th><th>Value</th></tr></thead><tbody>${Object.entries(map).map(([k, n]) => `<tr><td>${n}</td><td>${fmt(obj[k], 0)}</td></tr>`).join('')}</tbody></table>`;
}

function renderDateControls() {
  const el = document.getElementById('sharedDateControls');
  const latest = app.dateCtx.latestDate;
  if (!latest) { el.innerHTML = '<div class="muted">Import data to begin.</div>'; return; }
  const strip = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = shiftIsoDate(latest, -i); const has = app.dateCtx.availableDates.includes(d);
    const tag = app.state.journalEntries.some((j) => j.date === d) ? ' •' : '';
    strip.push(`<button class="btn ${app.dateCtx.selectedDate === d ? 'active' : ''}" data-date-pick="${d}" ${has ? '' : 'disabled'}>${d.slice(5)}${tag}</button>`);
  }
  el.innerHTML = `<div class="row"><strong>${scopeLabel()}</strong><span class="muted">Latest date: ${latest}</span></div>
    <div class="segmented"><button class="btn ${app.dateCtx.scope === 'day' ? 'active' : ''}" data-scope="day">Day</button><button class="btn ${app.dateCtx.scope === 'week' ? 'active' : ''}" data-scope="week">Week</button><button class="btn ${app.dateCtx.scope === 'month' ? 'active' : ''}" data-scope="month">Month</button></div>
    <div class="row">${strip.join('')}</div>
    <div class="row"><input id="datePicker" type="date" value="${app.dateCtx.selectedDate}"/><button class="btn secondary" data-nav="prev">Prev ${app.dateCtx.scope}</button><button class="btn secondary" data-nav="next">Next ${app.dateCtx.scope}</button></div>`;
}

function miniTrend(rows, key, count) {
  const pts = rows.slice(-count).map((r, i) => [i, r[key]]).filter((p) => p[1] != null); if (!pts.length) return '<div class="muted">No trend data.</div>';
  const vals = pts.map((p) => p[1]); const min = Math.min(...vals); const max = Math.max(...vals); const span = max - min || 1;
  const d = pts.map(([x, y]) => `${(x / Math.max(1, pts.length - 1)) * 200},${50 - ((y - min) / span) * 40}`).join(' ');
  return `<svg viewBox="0 0 200 50" width="100%" height="60"><polyline fill="none" stroke="#8db3ff" stroke-width="2" points="${d}"/></svg>`;
}

function render() {
  if (!app.state) return;
  renderDateControls();
  const cards = [
    ['Readiness Score', getContextual(app.state.dailyReadinessRows, 'readinessScore')], ['Sleep Score', getContextual(app.state.dailySleepRows, 'sleepScore')], ['Activity Score', getContextual(app.state.dailyActivityRows, 'activityScore')],
    ['RHR Night', getContextual(app.state.nightlyVitalsRows, 'rhr_night_bpm')], ['Estimated HRV (RMSSD proxy)', getContextual(app.state.nightlyVitalsRows, 'hrv_rmssd_proxy_ms')], ['SpO2 Night Avg', getContextual(app.state.dailySpo2Rows, 'spo2Average')], ['Temperature Deviation', getContextual(app.state.dailyReadinessRows, 'temperatureDeviation')]
  ];
  document.getElementById('byDateSummary').innerHTML = cards.map(([n, c]) => `<div class="kpi"><div class="kpi-label">${n}</div><div class="kpi-value">${fmt(c.value, 1)}</div><div class="kpi-reason">${c.min != null ? `min ${fmt(c.min, 1)} · max ${fmt(c.max, 1)} · n=${c.count}` : ''}</div></div>`).join('');

  const insights = buildInsights(app.state);
  document.getElementById('byDateInsights').innerHTML = insights.slice(0, 6).map((i) => `<div class="insight-card"><strong>${i.title}</strong><span class="badge severity-${i.severity}">${i.severity}</span><small>Latest ${fmt(i.latest, 1)} vs baseline ${fmt(i.baseline, 1)} (Δ ${fmt(i.delta, 1)})</small><small>Why you're seeing this: ${i.why}</small><small>What to try: ${i.tryText}</small></div>`).join('');

  renderScorePage('readinessContent', app.state.dailyReadinessRows, 'readinessScore', readinessNames, 'readinessContributors');
  renderScorePage('sleepContent', app.state.dailySleepRows, 'sleepScore', sleepNames, 'sleepContributors');
  renderScorePage('activityContent', app.state.dailyActivityRows, 'activityScore', activityNames, 'activityContributors');

  document.getElementById('vitalsSummary').innerHTML = `<div class="kpi"><div class="kpi-label">RHR Night</div><div class="kpi-value">${fmt(getContextual(app.state.nightlyVitalsRows, 'rhr_night_bpm').value, 1)}</div></div><div class="kpi"><div class="kpi-label">Estimated HRV (RMSSD proxy)</div><div class="kpi-value">${fmt(getContextual(app.state.nightlyVitalsRows, 'hrv_rmssd_proxy_ms').value, 1)}</div></div>`;

  const journalDates = new Set(app.state.journalEntries.map((j) => j.date));
  const ranges = [['14d', 14], ['30d', 30], ['90d', 90], ['1y', 365]];
  const chosen = Number(document.getElementById('trendRange')?.value || 30);
  const renderTrend = (rows, key, label) => `<div class="kpi"><div class="kpi-label">${label}</div>${miniTrend(rows, key, chosen)}<div class="small muted">Tags: ${rows.slice(-chosen).filter((r) => journalDates.has(r.date)).length}</div></div>`;
  document.getElementById('trendsChartGrid').innerHTML = [
    renderTrend(app.state.dailyReadinessRows, 'readinessScore', 'Readiness Score'), renderTrend(app.state.dailySleepRows, 'sleepScore', 'Sleep Score'), renderTrend(app.state.dailyActivityRows, 'activityScore', 'Activity Score'), renderTrend(app.state.nightlyVitalsRows, 'rhr_night_bpm', 'RHR Night'), renderTrend(app.state.nightlyVitalsRows, 'hrv_rmssd_proxy_ms', 'Estimated HRV'), renderTrend(app.state.dailySpo2Rows, 'spo2Average', 'SpO2 Night Avg'), renderTrend(app.state.dailyReadinessRows, 'temperatureDeviation', 'Temperature Deviation')
  ].join('');
  if (!document.getElementById('trendRange').dataset.bound) {
    document.getElementById('trendRange').innerHTML = ranges.map(([l, v]) => `<option value="${v}">${l}</option>`).join('');
    document.getElementById('trendRange').value = String(chosen);
    document.getElementById('trendRange').dataset.bound = '1';
    document.getElementById('trendRange').addEventListener('change', render);
  }

  document.querySelectorAll('[data-debug-link]').forEach((n) => n.classList.toggle('hidden', !app.settings.developerMode));
  document.getElementById('ingestReportContent').textContent = JSON.stringify(app.state.ingestReport, null, 2);
  document.getElementById('debugContent').textContent = JSON.stringify(app.state, null, 2);
}

function renderScorePage(targetId, rows, scoreKey, names, contributorKey) {
  const c = getContextual(rows, scoreKey);
  const dateRow = rowByDate(rows, app.dateCtx.selectedDate);
  const contributors = app.dateCtx.scope === 'day' ? dateRow?.[contributorKey] : null;
  const trendMode = app.dateCtx.scope === 'day' ? Number(document.querySelector(`[data-trend="${targetId}"]`)?.value || 14) : (app.dateCtx.scope === 'week' ? 84 : 365);
  document.getElementById(targetId).innerHTML = `<p class="muted">${scopeLabel()}</p><div class="kpi"><div class="kpi-label">Primary score</div><div class="kpi-value">${fmt(c.value, 0)}</div><div class="kpi-reason">${c.min != null ? `min ${fmt(c.min, 0)} · max ${fmt(c.max, 0)}` : ''}</div></div>
    ${contributorsTable(names, contributors)}
    <label class="small">Trend: <select data-trend="${targetId}"><option value="14">Last 14 days</option><option value="30">Last 30 days</option></select></label>
    <div>${miniTrend(rows, scoreKey, trendMode)}</div>`;
  const sel = document.querySelector(`[data-trend="${targetId}"]`);
  if (sel) sel.addEventListener('change', render);
}

function renderRoute(routeLike = location.hash || '/by-date') {
  const route = normalizeRoute(routeLike);
  if (route === '/my-health/data-tools/debug' && !app.settings.developerMode) navigate('/my-health/data-tools/import');
  const resolved = normalizeRoute(location.hash || route);
  document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === ROUTES[resolved]));
  document.querySelectorAll('.tab-link').forEach((el) => el.classList.toggle('active', el.dataset.route === resolved || (resolved.startsWith('/my-health') && el.dataset.route === '/my-health')));
  document.querySelectorAll('[data-subnav-root]').forEach((el) => el.classList.toggle('hidden', !resolved.startsWith(el.dataset.subnavRoot)));
  document.querySelectorAll('[data-subroute]').forEach((el) => el.classList.toggle('active', el.dataset.subroute === resolved));
}

async function readZip(file) {
  const zip = await JSZip.loadAsync(file); const entries = Object.values(zip.files).filter((e) => !e.dir && e.name.endsWith('.csv')); const registry = detectRegistry(entries); const datasets = {};
  for (const [key, entry] of Object.entries(registry)) datasets[key] = parseCsvWithDebug(await entry.async('text')).rows;
  const dailyReadinessRows = (datasets.dailyReadiness || []).map((row) => ({ date: parseDate(row.day || row.date), readinessScore: toNumber(row.score), temperatureDeviation: toNumber(row.temperature_deviation), readinessContributors: parseContributors(row.contributors) })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
  const dailySleepRows = (datasets.dailySleep || []).map((row) => ({ date: parseDate(row.day || row.date), sleepScore: toNumber(row.score), sleepContributors: parseContributors(row.contributors) })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
  const dailyActivityRows = (datasets.dailyActivity || []).map((row) => ({ date: parseDate(row.day || row.date), activityScore: toNumber(row.score), steps: toNumber(row.steps), activeCalories: toNumber(row.active_calories), totalCalories: toNumber(row.total_calories), activityContributors: parseContributors(row.contributors), metSeriesSummary: summarizeMet(row.met) })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
  const dailySpo2Rows = (datasets.dailySpo2 || []).map((row) => ({ date: parseDate(row.day || row.date), spo2Average: parseSpo2Average(row.spo2_percentage, row.average_spo2), breathingDisturbanceIndex: toNumber(row.breathing_disturbance_index) })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));
  const nightlyVitalsRows = buildNightlyVitals(datasets.heartRate || [], datasets.sleepTime || []);
  const availableDates = [...new Set([...dailyReadinessRows, ...dailySleepRows, ...dailyActivityRows, ...dailySpo2Rows, ...nightlyVitalsRows].map((r) => r.date).filter(Boolean))].sort();
  return { dailyReadinessRows, dailySleepRows, dailyActivityRows, dailySpo2Rows, nightlyVitalsRows, journalEntries: readJournalEntries(localStorage, JOURNAL_KEY), ingestReport: { datasetsFound: Object.keys(registry), counts: { readiness: dailyReadinessRows.length, sleep: dailySleepRows.length, activity: dailyActivityRows.length, spo2: dailySpo2Rows.length, nights: nightlyVitalsRows.length } }, availableDates };
}

function hookEvents() {
  document.querySelectorAll('[data-route],[data-subroute]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route || el.dataset.subroute); }));
  window.addEventListener('hashchange', () => renderRoute(location.hash));
  document.getElementById('zipInput').addEventListener('change', async () => {
    const file = document.getElementById('zipInput').files?.[0]; if (!file) return;
    app.state = await readZip(file); app.dateCtx = createDateContext(app.state.availableDates); render();
    if (app.settings.rememberDerived) localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
  });
  document.getElementById('clearBtn').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); location.reload(); });
  document.getElementById('baselineWindow').addEventListener('change', (e) => { app.settings.baselineWindow = Number(e.target.value); persistSettings(); render(); });
  document.getElementById('developerMode').addEventListener('change', (e) => { app.settings.developerMode = e.target.checked; persistSettings(); render(); renderRoute(location.hash); });
  ['rememberDerived', 'nightMode', 'fallbackStart', 'fallbackEnd', 'distanceUnit'].forEach((id) => document.getElementById(id).addEventListener('change', (e) => { app.settings[id === 'distanceUnit' ? 'unitsDistance' : id] = id === 'rememberDerived' ? e.target.checked : e.target.value; persistSettings(); }));

  document.getElementById('journalForm').addEventListener('submit', (e) => {
    e.preventDefault(); const fd = new FormData(e.target);
    const entries = readJournalEntries(localStorage, JOURNAL_KEY);
    entries.push({ id: crypto.randomUUID(), date: fd.get('date'), time: fd.get('time') || null, tag: fd.get('tag'), note: fd.get('note') || '' });
    saveJournalEntries(localStorage, JOURNAL_KEY, entries); if (app.state) { app.state.journalEntries = entries; render(); }
  });

  document.getElementById('sharedDateControls').addEventListener('click', (e) => {
    const date = e.target.dataset.datePick; const scope = e.target.dataset.scope; const nav = e.target.dataset.nav;
    if (date) app.dateCtx.selectedDate = date;
    if (scope) app.dateCtx.scope = scope;
    if (nav) {
      const step = app.dateCtx.scope === 'day' ? 1 : app.dateCtx.scope === 'week' ? 7 : 31;
      const next = shiftIsoDate(app.dateCtx.selectedDate, nav === 'next' ? step : -step);
      const min = app.dateCtx.minDate; const max = app.dateCtx.latestDate;
      if (next >= min && next <= max) app.dateCtx.selectedDate = next;
    }
    if (app.dateCtx.selectedDate < shiftIsoDate(app.dateCtx.latestDate, -6) && app.dateCtx.scope === 'day') app.dateCtx.scope = 'week';
    render();
  });
  document.getElementById('sharedDateControls').addEventListener('change', (e) => { if (e.target.id === 'datePicker') { app.dateCtx.selectedDate = e.target.value; if (app.dateCtx.selectedDate < shiftIsoDate(app.dateCtx.latestDate, -6)) app.dateCtx.scope = 'week'; render(); } });

  const doExport = (name, rows) => { const blob = new Blob([toCsv(rows)], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); };
  document.getElementById('exportReadiness').addEventListener('click', () => doExport('normalized_daily_readiness.csv', app.state?.dailyReadinessRows || []));
  document.getElementById('exportSleep').addEventListener('click', () => doExport('normalized_daily_sleep.csv', app.state?.dailySleepRows || []));
  document.getElementById('exportActivity').addEventListener('click', () => doExport('normalized_daily_activity.csv', app.state?.dailyActivityRows || []));
  document.getElementById('exportSpo2').addEventListener('click', () => doExport('normalized_daily_spo2.csv', app.state?.dailySpo2Rows || []));
  document.getElementById('exportVitals').addEventListener('click', () => doExport('derived_nightly_vitals.csv', app.state?.nightlyVitalsRows || []));
  document.getElementById('exportJournal').addEventListener('click', () => doExport('journal_tags.csv', app.state?.journalEntries || []));
  document.getElementById('exportJson').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(app.state || {}, null, 2)], { type: 'application/json' })); a.download = 'normalized_all.json'; a.click(); URL.revokeObjectURL(a.href); });
}

function initStatic() {
  document.getElementById('baselineWindow').value = String(app.settings.baselineWindow);
  document.getElementById('developerMode').checked = app.settings.developerMode;
  document.getElementById('rememberDerived').checked = app.settings.rememberDerived;
  document.getElementById('nightMode').value = app.settings.nightMode;
  document.getElementById('fallbackStart').value = app.settings.fallbackStart;
  document.getElementById('fallbackEnd').value = app.settings.fallbackEnd;
  document.getElementById('distanceUnit').value = app.settings.unitsDistance;
  document.getElementById('journalDate').value = new Date().toISOString().slice(0, 10);
}

hookEvents();
initStatic();
if (localStorage.getItem(STORAGE_KEY)) {
  try { app.state = JSON.parse(localStorage.getItem(STORAGE_KEY)); app.dateCtx = createDateContext(app.state.availableDates || []); } catch { /* noop */ }
}
render();
renderRoute(location.hash || '#/by-date');
