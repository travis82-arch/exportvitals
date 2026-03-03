import {
  normalizeName,
  sniffDelimiter,
  safeJsonParse,
  toNumber,
  baselineMedian,
  median,
  readJournalEntries,
  saveJournalEntries,
  summarizeMet,
  parseContributors,
  parseSpo2Average,
  toCsv
} from './vitals-core.mjs';

const STORAGE_KEY = 'ouraDerivedMetricsV4';
const SETTINGS_KEY = 'ouraDashboardSettingsV2';
const JOURNAL_KEY = 'ouraJournalEntriesV1';

const DATASET_ALIASES = {
  dailyReadiness: ['dailyreadiness.csv'],
  dailySleep: ['dailysleep.csv'],
  dailyActivity: ['dailyactivity.csv'],
  dailySpo2: ['dailyspo2.csv'],
  sleepTime: ['sleeptime.csv'],
  heartRate: ['heartrate.csv']
};

const ROUTES = {
  '/today': 'todayPage',
  '/readiness': 'readinessPage',
  '/sleep': 'sleepPage',
  '/activity': 'activityPage',
  '/vitals': 'vitalsPage',
  '/my-health': 'myHealthPage',
  '/my-health/trends': 'myHealthTrendsPage',
  '/my-health/journal': 'myHealthJournalPage',
  '/my-health/data-tools/import': 'myHealthDataToolsImportPage',
  '/my-health/data-tools/export': 'myHealthDataToolsExportPage',
  '/my-health/data-tools/glossary': 'myHealthDataToolsGlossaryPage',
  '/my-health/data-tools/debug': 'myHealthDataToolsDebugPage',
  '/my-health/settings': 'myHealthSettingsPage'
};

const readinessNames = {
  activity_balance: 'Activity Balance', body_temperature: 'Body Temperature', hrv_balance: 'HRV Balance', previous_day_activity: 'Previous Day Activity', previous_night: 'Previous Night', recovery_index: 'Recovery Index', resting_heart_rate: 'Resting Heart Rate', sleep_balance: 'Sleep Balance', sleep_regularity: 'Sleep Regularity'
};
const sleepNames = { deep_sleep: 'Deep Sleep', rem_sleep: 'REM Sleep', latency: 'Sleep Latency', timing: 'Sleep Timing', efficiency: 'Sleep Efficiency', restfulness: 'Restfulness', total_sleep: 'Total Sleep' };
const activityNames = { meet_daily_targets: 'Meet Daily Targets', move_every_hour: 'Move Every Hour', recovery_time: 'Recovery Time', stay_active: 'Stay Active', training_frequency: 'Training Frequency', training_volume: 'Training Volume' };

const defaultSettings = {
  baselineWindow: 14,
  rememberDerived: false,
  nightMode: 'auto',
  fallbackStart: '20:00',
  fallbackEnd: '10:00',
  unitsDistance: 'km'
};

const app = { state: null, settings: loadSettings() };

function loadSettings() {
  try { return { ...defaultSettings, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')) }; } catch { return { ...defaultSettings }; }
}
function persistSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(app.settings)); }

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmt(value, digits = 1, suffix = '') { return value == null ? '—' : `${Number(value).toFixed(digits)}${suffix}`; }
function normalizeRoute(routeLike) {
  const route = String(routeLike || '').replace(/^#/, '').replace(/\/$/, '') || '/today';
  return ROUTES[route] ? route : '/today';
}
function renderRoute(routeLike = location.hash || '/today') {
  const route = normalizeRoute(routeLike);
  document.querySelectorAll('.page').forEach((el) => el.classList.toggle('active', el.id === ROUTES[route]));
  document.querySelectorAll('.tab-link').forEach((el) => {
    const active = el.dataset.route === route || (route.startsWith('/my-health') && el.dataset.route === '/my-health');
    el.classList.toggle('active', active);
  });
  document.querySelectorAll('[data-subnav-root]').forEach((el) => el.classList.toggle('hidden', !route.startsWith(el.dataset.subnavRoot)));
  document.querySelectorAll('[data-subroute]').forEach((el) => el.classList.toggle('active', el.dataset.subroute === route));
}
function navigate(route) { location.hash = normalizeRoute(route); }

function parseCsvWithDebug(text) {
  const sniff = sniffDelimiter(text);
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: sniff.delimiter });
  return { rows: parsed.data || [], fields: parsed.meta?.fields || [], delimiter: sniff.delimiter };
}
function detectRegistry(entries) {
  const registry = {};
  for (const entry of entries) {
    const n = normalizeName(entry.name.split('/').pop());
    for (const [dataset, aliases] of Object.entries(DATASET_ALIASES)) if (aliases.some((a) => normalizeName(a) === n)) registry[dataset] = entry;
  }
  return registry;
}

function buildNightlyVitals(heartRows, sleepRows) {
  const windows = new Map();
  for (const row of sleepRows) {
    const date = parseDate(row.day || row.date);
    const start = new Date(row.bedtime_start || row.start_datetime || `${date}T${app.settings.fallbackStart}:00`);
    const end = new Date(row.bedtime_end || row.end_datetime || `${date}T${app.settings.fallbackEnd}:00`);
    windows.set(date, { start, end, mode: row.bedtime_start ? 'sleep_time' : 'fallback' });
  }
  const grouped = new Map();
  for (const row of heartRows) {
    const ts = new Date(row.timestamp);
    const bpm = toNumber(row.bpm);
    if (Number.isNaN(ts.getTime()) || bpm == null || bpm < 30 || bpm > 120) continue;
    const date = parseDate(ts.toISOString());
    const window = windows.get(date) || { start: new Date(`${date}T${app.settings.fallbackStart}:00`), end: new Date(`${date}T${app.settings.fallbackEnd}:00`), mode: 'fallback' };
    if (ts < window.start || ts > window.end) continue;
    const bucket = grouped.get(date) || { date, bpms: [], windowMode: window.mode };
    bucket.bpms.push(bpm);
    grouped.set(date, bucket);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map((n) => {
    const bpms = n.bpms.sort((a, b) => a - b);
    const rhr = bpms[Math.floor(bpms.length * 0.05)] ?? null;
    const rr = bpms.map((b) => 60000 / b);
    let rmssd = null;
    if (rr.length > 1) {
      let ss = 0;
      for (let i = 1; i < rr.length; i += 1) ss += (rr[i] - rr[i - 1]) ** 2;
      rmssd = Math.sqrt(ss / (rr.length - 1));
    }
    return { date: n.date, samples: bpms.length, valid: bpms.length >= 50, rhr_night_bpm: rhr, hrv_rmssd_proxy_ms: rmssd, windowMode: n.windowMode };
  });
}

function buildInsights(derived) {
  const out = [];
  const latestDate = derived.latestDate;
  const w = app.settings.baselineWindow;
  const last = derived.latest || {};
  const push = (id, title, severity, latest, baseline, why, tryText) => out.push({ id, title, severity, latest, baseline, delta: latest != null && baseline != null ? latest - baseline : null, why, tryText, date: latestDate });
  const baseReadiness = baselineMedian(derived.dailyReadinessRows, 'readinessScore', latestDate, w);
  const baseSleep = baselineMedian(derived.dailySleepRows, 'sleepScore', latestDate, w);
  const baseActivity = baselineMedian(derived.dailyActivityRows, 'activityScore', latestDate, w);
  const baseRhr = baselineMedian(derived.nightlyVitalsRows, 'rhr_night_bpm', latestDate, w);
  const baseHrv = baselineMedian(derived.nightlyVitalsRows, 'hrv_rmssd_proxy_ms', latestDate, w);
  const baseTemp = baselineMedian(derived.dailyReadinessRows, 'temperatureDeviation', latestDate, w);
  const baseSpo2 = baselineMedian(derived.dailySpo2Rows, 'spo2Average', latestDate, w);
  if (last.readinessScore != null && baseReadiness != null && Math.abs(last.readinessScore - baseReadiness) >= 8) push('readiness-shift', 'Readiness Score Shift', 'Medium', last.readinessScore, baseReadiness, 'Your latest Readiness Score moved materially versus your baseline median.', 'Aim for a lighter day and prioritize sleep timing.');
  if (last.sleepScore != null && baseSleep != null && Math.abs(last.sleepScore - baseSleep) >= 8) push('sleep-shift', 'Sleep Score Shift', 'Medium', last.sleepScore, baseSleep, 'Your Sleep Score changed versus your baseline.', 'Keep bedtime and wake time consistent tonight.');
  if (last.activityScore != null && baseActivity != null && Math.abs(last.activityScore - baseActivity) >= 10) push('activity-shift', 'Activity Score Load Change', 'Low', last.activityScore, baseActivity, 'Your Activity Score diverged from baseline.', 'Balance training load and recovery today.');
  if (last.rhr != null && baseRhr != null && Math.abs(last.rhr - baseRhr) >= 3) push('rhr-shift', 'Resting Heart Rate Shift', 'High', last.rhr, baseRhr, 'Night resting heart rate is outside normal range.', 'Reduce late meals/alcohol and prioritize wind-down.');
  if (last.hrv != null && baseHrv != null && Math.abs(last.hrv - baseHrv) >= 5) push('hrv-proxy-shift', 'HRV Proxy Shift', 'Medium', last.hrv, baseHrv, 'Estimated HRV (proxy) moved versus baseline.', 'Consider lower intensity and stress management today.');
  if (last.temperatureDeviation != null && ((Math.abs(last.temperatureDeviation) >= 0.3) || (baseTemp != null && Math.abs(last.temperatureDeviation - baseTemp) >= 0.2))) push('temp-shift', 'Temperature Deviation Elevated', 'High', last.temperatureDeviation, baseTemp, 'Temperature deviation is elevated in absolute terms or vs baseline.', 'Hydrate, recover, and monitor trends over several days.');
  if ((last.spo2Average != null && baseSpo2 != null && last.spo2Average <= baseSpo2 - 0.5) || (last.breathingDisturbanceIndex != null && last.breathingDisturbanceIndex >= 30)) push('resp-shift', 'Respiratory Signal Shift', 'High', last.spo2Average ?? last.breathingDisturbanceIndex, baseSpo2, 'SpO2 or breathing disturbance changed from typical.', 'Review sleep environment and evening routine.');
  return out.slice(0, 6);
}

function trendSvg(series, baseline, markerDates = new Set()) {
  if (!series.length) return '<div class="muted">No data</div>';
  const w = 360; const h = 120; const pad = 18;
  const vals = series.map((s) => s.value).filter((v) => v != null);
  const min = Math.min(...vals, baseline ?? Infinity); const max = Math.max(...vals, baseline ?? -Infinity);
  const norm = (v, lo, hi, len, offset) => offset + (hi === lo ? len / 2 : (v - lo) / (hi - lo) * len);
  const points = series.map((s, i) => `${norm(i, 0, Math.max(1, series.length - 1), w - pad * 2, pad)},${h - norm(s.value, min, max, h - pad * 2, pad)}`).join(' ');
  const baselineY = baseline == null ? '' : `<line x1="${pad}" x2="${w - pad}" y1="${h - norm(baseline, min, max, h - pad * 2, pad)}" y2="${h - norm(baseline, min, max, h - pad * 2, pad)}" class="baseline"/>`;
  const markers = series.map((s, i) => markerDates.has(s.date) ? `<circle cx="${norm(i, 0, Math.max(1, series.length - 1), w - pad * 2, pad)}" cy="${h - norm(s.value, min, max, h - pad * 2, pad)}" r="3" class="tag-marker" data-date="${s.date}"/>` : '').join('');
  return `<svg viewBox="0 0 ${w} ${h}"><polyline points="${points}" class="line"/>${baselineY}${markers}</svg>`;
}

function contributorList(obj, map) {
  if (!obj) return '<p class="muted">No contributors available.</p>';
  const rows = Object.entries(map).map(([k, label]) => `<li>${label}: <strong>${fmt(obj[k], 0)}</strong></li>`).join('');
  return `<ul class="compact-list">${rows}</ul>`;
}

function renderPageWithData(containerId, rows, scoreKey, contribKey, nameMap, extraHtml = '') {
  const latest = rows.at(-1);
  const baseline = baselineMedian(rows, scoreKey, latest?.date, app.settings.baselineWindow);
  const chartRows = rows.slice(-app.settings.baselineWindow).map((r) => ({ date: r.date, value: r[scoreKey] })).filter((r) => r.value != null);
  const tags = new Set(readJournalEntries(localStorage, JOURNAL_KEY).map((e) => e.date));
  document.getElementById(containerId).innerHTML = `
    <div class="kpi"><div class="kpi-label">Latest</div><div class="kpi-value">${fmt(latest?.[scoreKey], 0)}</div><div class="kpi-reason">Baseline ${app.settings.baselineWindow}d: ${fmt(baseline, 0)}</div></div>
    <div class="trend">${trendSvg(chartRows, baseline, tags)}</div>
    ${extraHtml}
    <h4>Contributors</h4>${contributorList(latest?.[contribKey], nameMap)}
    <table class="simple-table"><thead><tr><th>Date</th><th>Score</th><th>Detail</th></tr></thead><tbody>${rows.slice(-14).reverse().map((r) => `<tr><td>${r.date}</td><td>${fmt(r[scoreKey], 0)}</td><td>${fmt(r.temperatureDeviation, 2)}</td></tr>`).join('')}</tbody></table>`;
}

function render(derived) {
  app.state = derived;
  const latest = derived.latest || {};
  document.getElementById('todayReadinessScore').textContent = fmt(latest.readinessScore, 0);
  document.getElementById('todaySleepScore').textContent = fmt(latest.sleepScore, 0);
  document.getElementById('todayActivityScore').textContent = fmt(latest.activityScore, 0);
  document.getElementById('todayTemp').textContent = fmt(latest.temperatureDeviation, 2, ' °C');
  document.getElementById('todaySpo2').textContent = fmt(latest.spo2Average, 1, ' %');
  document.getElementById('todayBdi').textContent = fmt(latest.breathingDisturbanceIndex, 1);
  document.getElementById('todayLatestNightDate').textContent = derived.latestDate || '—';
  document.getElementById('todayInsightsList').innerHTML = derived.insights.length ? derived.insights.map((i) => `<button class="insight-card" data-insight-id="${i.id}"><strong>${i.title}</strong><span>${i.severity}</span><small>${i.why}</small></button>`).join('') : '<div class="muted">No insights yet.</div>';

  renderPageWithData('readinessContent', derived.dailyReadinessRows, 'readinessScore', 'readinessContributors', readinessNames);
  renderPageWithData('sleepContent', derived.dailySleepRows, 'sleepScore', 'sleepContributors', sleepNames, `<div class="status">Bedtime Guidance: ${derived.sleepTimeGuidance || 'Not available in this export.'}</div>`);
  const activityExtra = `<div class="status">Steps: ${fmt(derived.dailyActivityRows.at(-1)?.steps, 0)} · Active Calories: ${fmt(derived.dailyActivityRows.at(-1)?.activeCalories,0)} · Total Calories: ${fmt(derived.dailyActivityRows.at(-1)?.totalCalories,0)} · EWD: ${fmt(derived.dailyActivityRows.at(-1)?.equivalentWalkingDistance,0)} ${app.settings.unitsDistance}</div><div class="status">MET distribution: ${JSON.stringify(derived.dailyActivityRows.at(-1)?.metSeriesSummary || {})}</div>`;
  renderPageWithData('activityContent', derived.dailyActivityRows, 'activityScore', 'activityContributors', activityNames, activityExtra);

  const v = derived.nightlyVitalsRows;
  const latestNight = v.at(-1);
  const br = baselineMedian(v, 'rhr_night_bpm', latestNight?.date, app.settings.baselineWindow);
  const bh = baselineMedian(v, 'hrv_rmssd_proxy_ms', latestNight?.date, app.settings.baselineWindow);
  document.getElementById('rhrLatest').textContent = fmt(latestNight?.rhr_night_bpm, 1);
  document.getElementById('hrvLatest').textContent = fmt(latestNight?.hrv_rmssd_proxy_ms, 1);
  document.getElementById('rhrBaseline').textContent = fmt(br, 1);
  document.getElementById('hrvBaseline').textContent = fmt(bh, 1);
  document.getElementById('baselineWindowLabel').textContent = `Baseline window: ${app.settings.baselineWindow}-day median ending ${latestNight?.date || '—'}`;

  document.getElementById('trendsChartGrid').innerHTML = ['readinessScore', 'sleepScore', 'activityScore'].map((k) => {
    const src = derived[k === 'readinessScore' ? 'dailyReadinessRows' : k === 'sleepScore' ? 'dailySleepRows' : 'dailyActivityRows'].slice(-30).map((r) => ({ date: r.date, value: r[k] }));
    const b = baselineMedian(src.map((s) => ({ ...s, [k]: s.value })), k, src.at(-1)?.date, app.settings.baselineWindow);
    return `<div class="kpi"><div class="kpi-label">${k}</div><div class="trend">${trendSvg(src, b, new Set(derived.journalEntries.map((j) => j.date)))}</div></div>`;
  }).join('');

  document.getElementById('ingestReportContent').textContent = JSON.stringify(derived.ingestReport, null, 2);
  document.getElementById('debugContent').textContent = JSON.stringify(derived, null, 2);
  bindDynamicEvents();
}

function bindDynamicEvents() {
  document.querySelectorAll('.tag-marker').forEach((node) => {
    node.addEventListener('click', () => {
      const date = node.dataset.date;
      const entries = (app.state?.journalEntries || []).filter((j) => j.date === date);
      alert(`${date}\n${entries.map((e) => `${e.tag}${e.note ? `: ${e.note}` : ''}`).join('\n') || 'No entries'}`);
    });
  });
  document.querySelectorAll('[data-insight-id]').forEach((node) => node.addEventListener('click', () => {
    const card = app.state.insights.find((i) => i.id === node.dataset.insightId);
    if (!card) return;
    document.getElementById('insightDrawerTitle').textContent = card.title;
    document.getElementById('insightDrawerMessage').textContent = `Why you're seeing this: ${card.why}`;
    document.getElementById('insightDrawerLatestBaseline').innerHTML = `<li>Latest: ${card.latest ?? '—'}</li><li>Baseline median: ${card.baseline ?? '—'}</li><li>Delta: ${card.delta ?? '—'}</li><li>What to try: ${card.tryText}</li>`;
    document.getElementById('insightDrawer').classList.add('open');
  }));
}

async function readZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir && e.name.endsWith('.csv'));
  const registry = detectRegistry(entries);
  const datasets = {};
  for (const [key, entry] of Object.entries(registry)) datasets[key] = parseCsvWithDebug(await entry.async('text')).rows;

  const dailyReadinessRows = (datasets.dailyReadiness || []).map((row) => ({
    date: parseDate(row.day || row.date), readinessScore: toNumber(row.score), temperatureDeviation: toNumber(row.temperature_deviation), temperatureTrendDeviation: toNumber(row.temperature_trend_deviation), readinessContributors: parseContributors(row.contributors)
  })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));

  const dailySleepRows = (datasets.dailySleep || []).map((row) => ({ date: parseDate(row.day || row.date), sleepScore: toNumber(row.score), sleepContributors: parseContributors(row.contributors) })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));

  const dailyActivityRows = (datasets.dailyActivity || []).map((row) => ({
    date: parseDate(row.day || row.date), activityScore: toNumber(row.score), steps: toNumber(row.steps), activeCalories: toNumber(row.active_calories), totalCalories: toNumber(row.total_calories), equivalentWalkingDistance: toNumber(row.equivalent_walking_distance), inactivityAlerts: toNumber(row.inactivity_alerts), restingTime: toNumber(row.resting_time), nonWearTime: toNumber(row.non_wear_time), activityContributors: parseContributors(row.contributors), metSeriesSummary: summarizeMet(row.met)
  })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));

  const dailySpo2Rows = (datasets.dailySpo2 || []).map((row) => ({
    date: parseDate(row.day || row.date), spo2Average: parseSpo2Average(row.spo2_percentage, row.average_spo2), breathingDisturbanceIndex: toNumber(row.breathing_disturbance_index)
  })).filter((r) => r.date).sort((a, b) => a.date.localeCompare(b.date));

  const nightlyVitalsRows = buildNightlyVitals(datasets.heartRate || [], datasets.sleepTime || []);
  const latestDate = [dailyReadinessRows.at(-1)?.date, dailySleepRows.at(-1)?.date, dailyActivityRows.at(-1)?.date, nightlyVitalsRows.at(-1)?.date].filter(Boolean).sort().at(-1) || null;
  const byDate = (arr, key, date) => arr.find((r) => r.date === date)?.[key] ?? null;
  const latest = {
    readinessScore: byDate(dailyReadinessRows, 'readinessScore', latestDate),
    sleepScore: byDate(dailySleepRows, 'sleepScore', latestDate),
    activityScore: byDate(dailyActivityRows, 'activityScore', latestDate),
    temperatureDeviation: byDate(dailyReadinessRows, 'temperatureDeviation', latestDate),
    spo2Average: byDate(dailySpo2Rows, 'spo2Average', latestDate),
    breathingDisturbanceIndex: byDate(dailySpo2Rows, 'breathingDisturbanceIndex', latestDate),
    rhr: byDate(nightlyVitalsRows, 'rhr_night_bpm', latestDate),
    hrv: byDate(nightlyVitalsRows, 'hrv_rmssd_proxy_ms', latestDate)
  };

  const derived = {
    dailyReadinessRows, dailySleepRows, dailyActivityRows, dailySpo2Rows, nightlyVitalsRows,
    insightsLog: [], journalEntries: readJournalEntries(localStorage, JOURNAL_KEY), ingestReport: { datasetsFound: Object.keys(registry), counts: { readiness: dailyReadinessRows.length, sleep: dailySleepRows.length, activity: dailyActivityRows.length, spo2: dailySpo2Rows.length, nights: nightlyVitalsRows.length } },
    debugReport: {}, latestDate, latest,
    sleepTimeGuidance: (datasets.sleepTime || []).at(-1)?.status || null
  };
  derived.insights = buildInsights(derived);
  return derived;
}

function doExport(name, rows) { download(name, toCsv(rows), 'text/csv'); }
function download(name, text, type) { const blob = new Blob([text], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); }

function hookEvents() {
  document.querySelectorAll('[data-route],[data-subroute]').forEach((el) => el.addEventListener('click', (e) => { e.preventDefault(); navigate(el.dataset.route || el.dataset.subroute); }));
  window.addEventListener('hashchange', () => renderRoute(location.hash));
  document.getElementById('zipInput').addEventListener('change', async () => {
    const file = document.getElementById('zipInput').files?.[0];
    if (!file) return;
    const derived = await readZip(file);
    render(derived);
    if (app.settings.rememberDerived) localStorage.setItem(STORAGE_KEY, JSON.stringify(derived));
  });
  document.getElementById('clearBtn').addEventListener('click', () => { localStorage.removeItem(STORAGE_KEY); app.state = null; location.reload(); });
  document.getElementById('baselineWindow').addEventListener('change', (e) => { app.settings.baselineWindow = Number(e.target.value); persistSettings(); if (app.state) render(app.state); });
  document.getElementById('rememberDerived').addEventListener('change', (e) => { app.settings.rememberDerived = e.target.checked; persistSettings(); });
  document.getElementById('nightMode').addEventListener('change', (e) => { app.settings.nightMode = e.target.value; persistSettings(); });
  document.getElementById('fallbackStart').addEventListener('change', (e) => { app.settings.fallbackStart = e.target.value; persistSettings(); });
  document.getElementById('fallbackEnd').addEventListener('change', (e) => { app.settings.fallbackEnd = e.target.value; persistSettings(); });
  document.getElementById('distanceUnit').addEventListener('change', (e) => { app.settings.unitsDistance = e.target.value; persistSettings(); if (app.state) render(app.state); });

  document.getElementById('journalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const entry = { id: crypto.randomUUID(), date: fd.get('date'), time: fd.get('time') || null, tag: fd.get('tag'), note: fd.get('note') || '' };
    const entries = readJournalEntries(localStorage, JOURNAL_KEY);
    entries.push(entry);
    saveJournalEntries(localStorage, JOURNAL_KEY, entries);
    if (app.state) { app.state.journalEntries = entries; render(app.state); }
    e.target.reset();
  });

  document.getElementById('exportReadiness').addEventListener('click', () => doExport('normalized_daily_readiness.csv', app.state?.dailyReadinessRows || []));
  document.getElementById('exportSleep').addEventListener('click', () => doExport('normalized_daily_sleep.csv', app.state?.dailySleepRows || []));
  document.getElementById('exportActivity').addEventListener('click', () => doExport('normalized_daily_activity.csv', app.state?.dailyActivityRows || []));
  document.getElementById('exportSpo2').addEventListener('click', () => doExport('normalized_daily_spo2.csv', app.state?.dailySpo2Rows || []));
  document.getElementById('exportVitals').addEventListener('click', () => doExport('derived_nightly_vitals.csv', app.state?.nightlyVitalsRows || []));
  document.getElementById('exportJournal').addEventListener('click', () => doExport('journal_tags.csv', app.state?.journalEntries || []));
  document.getElementById('exportJson').addEventListener('click', () => download('normalized_all.json', JSON.stringify(app.state || {}, null, 2), 'application/json'));

  document.getElementById('closeInsightDrawer').addEventListener('click', () => document.getElementById('insightDrawer').classList.remove('open'));
}

function initStatic() {
  document.getElementById('baselineWindow').value = String(app.settings.baselineWindow);
  document.getElementById('rememberDerived').checked = app.settings.rememberDerived;
  document.getElementById('nightMode').value = app.settings.nightMode;
  document.getElementById('fallbackStart').value = app.settings.fallbackStart;
  document.getElementById('fallbackEnd').value = app.settings.fallbackEnd;
  document.getElementById('distanceUnit').value = app.settings.unitsDistance;
  document.getElementById('journalDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('glossaryContent').innerHTML = `<table class="simple-table"><thead><tr><th>Metric</th><th>Source</th><th>Units</th></tr></thead><tbody>
    <tr><td>Readiness Score</td><td>dailyReadiness.score</td><td>score</td></tr>
    <tr><td>Sleep Score</td><td>dailySleep.score</td><td>score</td></tr>
    <tr><td>Activity Score</td><td>dailyActivity.score</td><td>score</td></tr>
    <tr><td>Temperature Deviation</td><td>dailyReadiness.temperature_deviation</td><td>°C</td></tr>
    <tr><td>SpO2</td><td>dailySpo2.spo2_percentage.average</td><td>%</td></tr>
    <tr><td>Breathing Disturbance Index</td><td>dailySpo2.breathing_disturbance_index</td><td>index</td></tr>
    <tr><td>RHR Night</td><td>derived heartRate + sleepTime</td><td>bpm</td></tr>
    <tr><td>Estimated HRV (RMSSD proxy)</td><td>derived heartRate + sleepTime</td><td>ms</td></tr>
  </tbody></table>`;
}

hookEvents();
initStatic();
if (localStorage.getItem(STORAGE_KEY)) {
  try { render(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { /* noop */ }
}
renderRoute(location.hash || '#/today');
