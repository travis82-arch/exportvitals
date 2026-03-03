import {
  normalizeName,
  sniffDelimiter,
  safeJsonParse,
  toNumber,
  baselineMedian,
  metricDelta
} from './vitals-core.mjs';

const STORAGE_KEY = 'ouraDerivedMetricsV3';
const SETTINGS_KEY = 'ouraDashboardSettingsV1';
const INSIGHTS_LOG_KEY = 'ouraInsightsLogV1';
const BASELINE_WINDOW_DAYS = 14;
const DATASET_ALIASES = {
  dailyReadiness: ['dailyreadiness.csv'],
  dailySleep: ['dailysleep.csv'],
  dailyActivity: ['dailyactivity.csv'],
  dailySpo2: ['dailyspo2.csv'],
  sleepTime: ['sleeptime.csv'],
  heartRate: ['heartrate.csv']
};

const zipInput = document.getElementById('zipInput');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');
const debugContent = document.getElementById('debugContent');
const ingestReportEl = document.getElementById('ingestReportContent');
const baselineWindowLabel = document.getElementById('baselineWindowLabel');
const todayImportPrompt = document.getElementById('todayImportPrompt');
const developerModeToggle = document.getElementById('developerModeToggle');
const developerDebugLinkWrap = document.getElementById('developerDebugLinkWrap');
const exportInsightsJsonBtn = document.getElementById('exportInsightsJsonBtn');
const exportInsightsCsvBtn = document.getElementById('exportInsightsCsvBtn');
const clearInsightsLogBtn = document.getElementById('clearInsightsLogBtn');
const insightsLogStatus = document.getElementById('insightsLogStatus');

const PAGE_BY_ROUTE = {
  '/today': 'todayPage',
  '/vitals': 'vitalsPage',
  '/my-health': 'myHealthPage',
  '/my-health/trends': 'myHealthTrendsPage',
  '/my-health/data-tools/import': 'myHealthDataToolsImportPage',
  '/my-health/data-tools/debug': 'myHealthDataToolsDebugPage',
  '/my-health/settings': 'myHealthSettingsPage'
};

const DEFAULT_ROUTE = '/today';
const METRIC_DEFS = {
  rhr: { label: 'RHR Night', unit: 'bpm', digits: 1, deltaUnit: 'bpm' },
  hrv: { label: 'Estimated HRV (RMSSD proxy)', unit: 'ms', digits: 1, deltaUnit: 'ms' },
  spo2: { label: 'SpO2 Night Avg', unit: '%', digits: 1, deltaUnit: 'pp' },
  temp: { label: 'Temperature Deviation', unit: '°C', digits: 2, deltaUnit: '°C' },
  readinessScore: { label: 'Readiness Score', unit: '', digits: 0 },
  sleepScore: { label: 'Sleep Score', unit: '', digits: 0 },
  activityScore: { label: 'Activity Score', unit: '', digits: 0 }
};

const appState = {
  current: null,
  selectedVitalMetric: 'rhr',
  vitalsRangeDays: 14,
  trendsRangeDays: 14,
  selectedInsightId: null,
  insightFilter: 'all'
};

function getSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { developerMode: false };
  try {
    const parsed = JSON.parse(raw);
    return { developerMode: Boolean(parsed.developerMode) };
  } catch {
    return { developerMode: false };
  }
}

function saveSettings(nextSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
}

function getInsightsLog() {
  try {
    const raw = localStorage.getItem(INSIGHTS_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInsightsLog(log) {
  localStorage.setItem(INSIGHTS_LOG_KEY, JSON.stringify(log));
  renderInsightsLogStatus();
}

function renderInsightsLogStatus() {
  const count = getInsightsLog().length;
  insightsLogStatus.textContent = count ? `Insights log entries: ${count}` : 'Insights log is empty.';
}

function normalizeRoute(routeLike) {
  const route = String(routeLike || '').replace(/^#/, '').replace(/\/$/, '') || DEFAULT_ROUTE;
  const settings = getSettings();
  if (route === '/my-health/data-tools/debug' && !settings.developerMode) return '/my-health/settings';
  return PAGE_BY_ROUTE[route] ? route : DEFAULT_ROUTE;
}

function refreshDeveloperModeUi() {
  const { developerMode } = getSettings();
  developerModeToggle.checked = developerMode;
  developerDebugLinkWrap.classList.toggle('hidden', !developerMode);
}

function renderRoute(routeLike = location.hash || DEFAULT_ROUTE) {
  const route = normalizeRoute(routeLike);
  document.querySelectorAll('.page').forEach((page) => {
    page.classList.toggle('active', page.id === PAGE_BY_ROUTE[route]);
  });
  document.querySelectorAll('.tab-link').forEach((link) => {
    const isActive = link.dataset.route === route || (route.startsWith('/my-health') && link.dataset.route === '/my-health');
    link.classList.toggle('active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
  refreshDeveloperModeUi();
}

function navigateTo(routeLike) {
  const route = normalizeRoute(routeLike);
  if (location.hash !== `#${route}`) location.hash = route;
  renderRoute(route);
}

function fmt(value, key) {
  if (value == null) return '—';
  const def = METRIC_DEFS[key];
  if (!def) return String(value);
  const formatted = Number(value).toFixed(def.digits);
  return def.unit ? `${formatted} ${def.unit}` : formatted;
}

function parseCsvWithDebug(text) {
  const sniff = sniffDelimiter(text);
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: sniff.delimiter });
  return {
    rows: parsed.data || [],
    fields: parsed.meta?.fields || [],
    delimiter: parsed.meta?.delimiter || sniff.delimiter,
    sniff
  };
}

function detectDatasetRegistry(entries) {
  const registry = {};
  for (const entry of entries) {
    const normalized = normalizeName(entry.name.split('/').pop());
    for (const [dataset, aliases] of Object.entries(DATASET_ALIASES)) {
      if (aliases.some((a) => normalizeName(a) === normalized)) registry[dataset] = entry;
    }
  }
  return registry;
}

function parseDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildNightlyVitals(heartRows, sleepWindows) {
  const grouped = new Map();
  for (const row of heartRows) {
    const ts = new Date(row.timestamp);
    const bpm = toNumber(row.bpm);
    if (Number.isNaN(ts.getTime()) || bpm == null || bpm < 30 || bpm > 120) continue;
    const date = parseDate(ts.toISOString());
    const window = sleepWindows.get(date) || {
      start: new Date(`${date}T00:00:00`),
      end: new Date(`${date}T06:00:00`),
      mode: 'fallback'
    };
    if (ts < window.start || ts > window.end) continue;
    const bucket = grouped.get(date) || {
      date,
      bpms: [],
      windowMode: window.mode,
      windowStart: window.start.toISOString(),
      windowEnd: window.end.toISOString()
    };
    bucket.bpms.push(bpm);
    grouped.set(date, bucket);
  }
  return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date)).map((n) => {
    const samples = n.bpms.length;
    const valid = samples >= 50;
    const rhr_night = valid ? [...n.bpms].sort((a, b) => a - b)[Math.floor(n.bpms.length * 0.05)] : null;
    const rr = n.bpms.map((bpm) => 60000 / bpm);
    let estimated_hrv_rmssd_proxy = null;
    if (valid && rr.length > 1) {
      let ss = 0;
      for (let i = 1; i < rr.length; i += 1) ss += (rr[i] - rr[i - 1]) ** 2;
      estimated_hrv_rmssd_proxy = Math.sqrt(ss / (rr.length - 1));
    }
    return {
      date: n.date,
      samples,
      valid,
      rhr_night,
      estimated_hrv_rmssd_proxy,
      windowMode: n.windowMode,
      windowStart: n.windowStart,
      windowEnd: n.windowEnd
    };
  });
}

function toCsv(rows) {
  if (!rows.length) return 'date,ruleId,severity,message,latest,baseline,delta,createdAt\n';
  const headers = ['date', 'ruleId', 'severity', 'message', 'latest', 'baseline', 'delta', 'createdAt'];
  const escape = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return `${headers.join(',')}\n${rows.map((row) => headers.map((h) => escape(row[h])).join(',')).join('\n')}`;
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function normalizeSeverityValue(severity) {
  if (severity === 'warn') return 3;
  if (severity === 'good') return 2;
  return 1;
}

function buildInsightCards(snapshot, latestNightRow) {
  const insights = [];
  const latest = snapshot.latest || {};
  const baseline = snapshot.baseline || {};
  const add = (card) => insights.push({
    ...card,
    rank: normalizeSeverityValue(card.severity) * 100 + Math.abs(Number(card.magnitude || 0))
  });

  if (latest.rhr != null && latest.hrv != null && baseline.rhr != null && baseline.hrv != null) {
    if (latest.rhr <= baseline.rhr - 3 && latest.hrv >= baseline.hrv + 2) {
      add({
        id: `recovery-positive-${snapshot.latestDate}`,
        ruleId: 'recovery-positive',
        title: 'Recovery Positive',
        severity: 'good',
        metricRefs: ['rhr', 'hrv'],
        latest: { rhr: latest.rhr, hrv: latest.hrv },
        baseline: { rhr: baseline.rhr, hrv: baseline.hrv },
        delta: { rhr: latest.rhr - baseline.rhr, hrv: latest.hrv - baseline.hrv },
        message: 'Recovery looks strong vs baseline.',
        reasonLines: [
          `RHR Night is at least 3 bpm lower than baseline (${fmt(latest.rhr, 'rhr')} vs ${fmt(baseline.rhr, 'rhr')}).`,
          `Estimated HRV is at least 2 ms above baseline (${fmt(latest.hrv, 'hrv')} vs ${fmt(baseline.hrv, 'hrv')}).`
        ],
        thresholds: 'RHR ≤ baseline - 3 bpm and HRV ≥ baseline + 2 ms',
        magnitude: Math.abs((latest.rhr - baseline.rhr)) + Math.abs((latest.hrv - baseline.hrv))
      });
    }

    if (latest.rhr >= baseline.rhr + 3 && latest.hrv <= baseline.hrv - 2) {
      add({
        id: `possible-strain-${snapshot.latestDate}`,
        ruleId: 'possible-strain',
        title: 'Possible Strain',
        severity: 'warn',
        metricRefs: ['rhr', 'hrv'],
        latest: { rhr: latest.rhr, hrv: latest.hrv },
        baseline: { rhr: baseline.rhr, hrv: baseline.hrv },
        delta: { rhr: latest.rhr - baseline.rhr, hrv: latest.hrv - baseline.hrv },
        message: 'Strain signals up vs baseline.',
        reasonLines: [
          `RHR Night is at least 3 bpm above baseline (${fmt(latest.rhr, 'rhr')} vs ${fmt(baseline.rhr, 'rhr')}).`,
          `Estimated HRV is at least 2 ms below baseline (${fmt(latest.hrv, 'hrv')} vs ${fmt(baseline.hrv, 'hrv')}).`
        ],
        thresholds: 'RHR ≥ baseline + 3 bpm and HRV ≤ baseline - 2 ms',
        magnitude: Math.abs((latest.rhr - baseline.rhr)) + Math.abs((latest.hrv - baseline.hrv))
      });
    }
  }

  if (latest.temp != null && baseline.temp != null && Math.abs(latest.temp - baseline.temp) >= 0.2) {
    add({
      id: `temperature-shift-${snapshot.latestDate}`,
      ruleId: 'temperature-shift',
      title: 'Temperature Shift',
      severity: 'info',
      metricRefs: ['temp'],
      latest: { temp: latest.temp },
      baseline: { temp: baseline.temp },
      delta: { temp: latest.temp - baseline.temp },
      message: 'Temperature deviation shifted vs baseline.',
      reasonLines: [`Temperature deviation differs by at least 0.2 °C (${fmt(latest.temp, 'temp')} vs ${fmt(baseline.temp, 'temp')}).`],
      thresholds: '|tempDeviation - tempBaseline| ≥ 0.2 °C',
      magnitude: Math.abs(latest.temp - baseline.temp)
    });
  }

  if (latest.spo2 != null && baseline.spo2 != null && latest.spo2 <= baseline.spo2 - 0.5) {
    add({
      id: `spo2-dip-${snapshot.latestDate}`,
      ruleId: 'spo2-dip',
      title: 'SpO2 Dip',
      severity: 'warn',
      metricRefs: ['spo2'],
      latest: { spo2: latest.spo2 },
      baseline: { spo2: baseline.spo2 },
      delta: { spo2: latest.spo2 - baseline.spo2 },
      message: 'SpO2 is lower than baseline.',
      reasonLines: [`SpO2 Night Avg is at least 0.5 pp below baseline (${fmt(latest.spo2, 'spo2')} vs ${fmt(baseline.spo2, 'spo2')}).`],
      thresholds: 'SpO2 ≤ baseline - 0.5 pp',
      magnitude: Math.abs(latest.spo2 - baseline.spo2)
    });
  }

  if (latestNightRow && (latestNightRow.samples < 50 || latestNightRow.windowMode === 'fallback')) {
    add({
      id: `data-quality-warning-${snapshot.latestDate}`,
      ruleId: 'data-quality-warning',
      title: 'Data Quality Warning',
      severity: 'warn',
      metricRefs: ['rhr', 'hrv'],
      latest: { samples: latestNightRow.samples, windowMode: latestNightRow.windowMode },
      baseline: {},
      delta: {},
      message: 'Night window is estimated; verify patterns over multiple nights.',
      reasonLines: [
        `Latest night samples: ${latestNightRow.samples}.`,
        `Window mode: ${latestNightRow.windowMode}.`
      ],
      thresholds: 'samples < 50 OR windowMode === fallback',
      magnitude: latestNightRow.samples < 50 ? 100 - latestNightRow.samples : 10
    });
  }

  return insights.sort((a, b) => b.rank - a.rank);
}

async function readZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir && e.name.endsWith('.csv'));
  const registry = detectDatasetRegistry(entries);
  const ingestReport = { datasetsFound: Object.keys(registry), datasets: {}, parseErrors: [], lastIngestTimestamp: new Date().toISOString() };

  const tables = {
    oura_daily_readiness: [], oura_daily_sleep: [], oura_daily_activity: [], oura_daily_spo2: [],
    oura_sleep_time: [], oura_nightly_vitals: []
  };

  const byDate = new Map();
  const sleepWindows = new Map();

  for (const [key, entry] of Object.entries(registry)) {
    const text = await entry.async('text');
    const parsed = parseCsvWithDebug(text);
    ingestReport.datasets[key] = {
      rows: parsed.rows.length,
      fields: parsed.fields,
      delimiter: parsed.delimiter,
      sniff: parsed.sniff
    };

    for (const row of parsed.rows) {
      if (key === 'dailyReadiness') {
        const contributors = safeJsonParse(row.contributors);
        if (contributors.error) ingestReport.parseErrors.push({ dataset: key, field: 'contributors', error: contributors.error });
        tables.oura_daily_readiness.push({
          date: parseDate(row.day || row.date),
          score: toNumber(row.score),
          temperature_deviation: toNumber(row.temperature_deviation),
          temperature_trend_deviation: toNumber(row.temperature_trend_deviation),
          contributors_json: row.contributors || null,
          contributors_parsed: contributors.parsed
        });
      }
      if (key === 'dailySleep') tables.oura_daily_sleep.push({ date: parseDate(row.day || row.date), score: toNumber(row.score), contributors_json: row.contributors || null });
      if (key === 'dailyActivity') {
        const met = safeJsonParse(row.met);
        if (met.error) ingestReport.parseErrors.push({ dataset: key, field: 'met', error: met.error });
        tables.oura_daily_activity.push({ date: parseDate(row.day || row.date), score: toNumber(row.score), steps: toNumber(row.steps), contributors_json: row.contributors || null, met_json: row.met || null, met_items_count: met.parsed?.items?.length ?? null });
      }
      if (key === 'dailySpo2') {
        const spo2Json = safeJsonParse(row.spo2_percentage);
        if (spo2Json.error) ingestReport.parseErrors.push({ dataset: key, field: 'spo2_percentage', error: spo2Json.error });
        tables.oura_daily_spo2.push({ date: parseDate(row.day || row.date), breathing_disturbance_index: toNumber(row.breathing_disturbance_index), spo2_average: toNumber(spo2Json.parsed?.average) ?? toNumber(row.average_spo2), spo2_json_raw: row.spo2_percentage || null });
      }
      if (key === 'sleepTime') {
        const date = parseDate(row.day || row.date);
        tables.oura_sleep_time.push({ date, recommendation: row.recommendation || null, status: row.status || null, optimal_bedtime: row.optimal_bedtime || null });
        const start = row.bedtime_start ? new Date(row.bedtime_start) : null;
        const end = row.bedtime_end ? new Date(row.bedtime_end) : null;
        if (date && start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) sleepWindows.set(date, { start, end, mode: 'sleeptime' });
      }
    }

    if (key === 'heartRate') {
      const heartRows = parsed.rows.map((row) => ({ timestamp: row.timestamp || row.datetime, bpm: row.bpm || row.heart_rate, source: row.source }));
      tables.oura_nightly_vitals = buildNightlyVitals(heartRows, sleepWindows);
    }
  }

  for (const row of tables.oura_daily_readiness) byDate.set(row.date, { ...(byDate.get(row.date) || {}), temp: row.temperature_deviation });
  for (const row of tables.oura_daily_spo2) byDate.set(row.date, { ...(byDate.get(row.date) || {}), spo2: row.spo2_average });
  for (const row of tables.oura_nightly_vitals) if (row.valid) byDate.set(row.date, { ...(byDate.get(row.date) || {}), rhr: row.rhr_night, hrv: row.estimated_hrv_rmssd_proxy, samples: row.samples, windowMode: row.windowMode });

  const series = [...byDate.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
  const latest = series.at(-1) || {};
  const latestDate = latest.date;
  const snapshot = {
    latestDate,
    latest,
    baseline: {
      rhr: baselineMedian(series, 'rhr', latestDate, BASELINE_WINDOW_DAYS),
      hrv: baselineMedian(series, 'hrv', latestDate, BASELINE_WINDOW_DAYS),
      spo2: baselineMedian(series, 'spo2', latestDate, BASELINE_WINDOW_DAYS),
      temp: baselineMedian(series, 'temp', latestDate, BASELINE_WINDOW_DAYS)
    }
  };

  const latestNightRow = tables.oura_nightly_vitals.find((row) => row.date === latestDate) || tables.oura_nightly_vitals.at(-1) || null;
  const insights = buildInsightCards(snapshot, latestNightRow);

  return { tables, ingestReport, ingestReportJson: JSON.stringify(ingestReport, null, 2), series, snapshot, insights };
}

function renderTrendSvg(el, series, baselineValue = null) {
  if (!el) return;
  if (!series.length) { el.innerHTML = 'No trend data'; return; }
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals, baselineValue ?? Number.POSITIVE_INFINITY);
  const max = Math.max(...vals, baselineValue ?? Number.NEGATIVE_INFINITY);
  const toPointY = (v) => (max === min ? 20 : 40 - ((v - min) / (max - min)) * 40);
  const points = vals.map((v, i) => {
    const x = (i / Math.max(vals.length - 1, 1)) * 220;
    const y = toPointY(v);
    return `${x},${y}`;
  }).join(' ');
  const baselineLine = baselineValue == null ? '' : `<line x1="0" y1="${toPointY(baselineValue)}" x2="220" y2="${toPointY(baselineValue)}" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,3"/>`;
  el.innerHTML = `<svg width="220" height="44" viewBox="0 0 220 44">${baselineLine}<polyline points="${points}" fill="none" stroke="#60a5fa" stroke-width="2"/></svg>`;
}

function formatDelta(metricKey, latest, baseline) {
  const d = metricDelta(metricKey, latest, baseline);
  if (d.absolute == null) return '—';
  const abs = `${d.absolute > 0 ? '+' : ''}${d.absolute.toFixed(metricKey === 'temp' ? 2 : 1)} ${d.deltaUnit}`;
  if (d.percent == null) return abs;
  return `${abs} (${d.percent > 0 ? '+' : ''}${d.percent.toFixed(1)}%)`;
}

function renderTodayScores(tables, snapshot) {
  const latestReadiness = [...tables.oura_daily_readiness].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const latestSleep = [...tables.oura_daily_sleep].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const latestActivity = [...tables.oura_daily_activity].sort((a, b) => a.date.localeCompare(b.date)).at(-1);

  const readinessScore = latestReadiness?.score;
  const sleepScore = latestSleep?.score;
  const activityScore = latestActivity?.score;

  document.getElementById('todayReadinessScore').textContent = readinessScore == null ? '—' : readinessScore;
  document.getElementById('todaySleepScore').textContent = sleepScore == null ? '—' : sleepScore;
  document.getElementById('todayActivityScore').textContent = activityScore == null ? '—' : activityScore;
  document.getElementById('todayLatestNightDate').textContent = snapshot.latestDate || '—';

  const isMissing = readinessScore == null && sleepScore == null && activityScore == null;
  todayImportPrompt.classList.toggle('hidden', !isMissing);
}

function renderInsightsSection(insights) {
  const list = document.getElementById('todayInsightsList');
  const top3 = insights.slice(0, 3);
  list.innerHTML = top3.length ? '' : '<div class="muted">No insight cards yet. Import more data to generate signals.</div>';

  for (const card of top3) {
    const btn = document.createElement('button');
    btn.className = `insight-card severity-${card.severity}`;
    btn.type = 'button';
    btn.innerHTML = `<strong>${card.title}</strong><span>${card.message}</span><small>${card.metricRefs.map((m) => METRIC_DEFS[m]?.label || m).join(' • ')}</small>`;
    btn.addEventListener('click', () => openInsightDrawer(card.id));
    list.appendChild(btn);
  }
  document.getElementById('viewAllInsightsBtn').disabled = !insights.length;
}

function openInsightDrawer(cardId) {
  const result = appState.current;
  if (!result) return;
  appState.selectedInsightId = cardId;
  renderInsightDrawer();
}

function renderInsightDrawer() {
  const result = appState.current;
  const drawer = document.getElementById('insightDrawer');
  const card = result?.insights?.find((item) => item.id === appState.selectedInsightId);
  drawer.classList.toggle('open', Boolean(card));
  drawer.setAttribute('aria-hidden', card ? 'false' : 'true');
  if (!card) return;
  document.getElementById('insightDrawerTitle').textContent = card.title;
  document.getElementById('insightDrawerThresholds').textContent = `Thresholds: ${card.thresholds}`;
  document.getElementById('insightDrawerMessage').textContent = card.message;
  document.getElementById('insightDrawerLatestBaseline').innerHTML = card.metricRefs.map((metric) => {
    const latest = card.latest?.[metric];
    const baseline = card.baseline?.[metric];
    const delta = card.delta?.[metric];
    return `<li><strong>${METRIC_DEFS[metric]?.label || metric}:</strong> latest ${fmt(latest, metric)} vs baseline ${fmt(baseline, metric)} (Δ ${delta == null ? '—' : delta.toFixed(metric === 'temp' ? 2 : 1)})</li>`;
  }).join('');
  document.getElementById('insightDrawerReasons').innerHTML = card.reasonLines.map((line) => `<li>${line}</li>`).join('');
}

function renderAllInsightsModal() {
  const result = appState.current;
  const modal = document.getElementById('allInsightsModal');
  const body = document.getElementById('allInsightsList');
  if (!result) return;
  const filtered = appState.insightFilter === 'all' ? result.insights : result.insights.filter((i) => i.severity === appState.insightFilter);
  body.innerHTML = filtered.length ? '' : '<div class="muted">No insights match this filter.</div>';
  for (const card of filtered) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `insight-row severity-${card.severity}`;
    row.innerHTML = `<strong>${card.title}</strong><span>${card.message}</span><small>${card.thresholds}</small>`;
    row.addEventListener('click', () => {
      modal.classList.remove('open');
      openInsightDrawer(card.id);
    });
    body.appendChild(row);
  }
}

function openVitalsDetail(metricKey) {
  appState.selectedVitalMetric = metricKey;
  document.getElementById('vitalsDetailModal').classList.add('open');
  renderVitalsDetail();
}

function renderVitalsDetail() {
  const result = appState.current;
  if (!result) return;
  const metricKey = appState.selectedVitalMetric;
  const allSeries = result.series.filter((s) => s[metricKey] != null);
  const sliced = allSeries.slice(-appState.vitalsRangeDays);
  const latestPoint = sliced.at(-1);
  const baseline = baselineMedian(result.series, metricKey, latestPoint?.date, BASELINE_WINDOW_DAYS);

  document.getElementById('vitalsDetailTitle').textContent = METRIC_DEFS[metricKey].label;
  renderTrendSvg(document.getElementById('vitalsDetailTrend'), sliced.map((s) => ({ date: s.date, value: s[metricKey] })), baseline);
  document.getElementById('vitalsDetailSummary').textContent = `Latest: ${fmt(latestPoint?.[metricKey], metricKey)} • Baseline (14d median): ${fmt(baseline, metricKey)} • Delta: ${formatDelta(metricKey, latestPoint?.[metricKey], baseline)}`;

  const selectedNight = result.tables.oura_nightly_vitals.find((n) => n.date === latestPoint?.date);
  document.getElementById('vitalsDetailQuality').textContent = selectedNight ? `Data quality (${selectedNight.date}): samples ${selectedNight.samples}, windowMode ${selectedNight.windowMode}` : 'Data quality: not applicable for selected point.';
  document.getElementById('vitalsDefinition').textContent = `${METRIC_DEFS[metricKey].label} is shown from your locally-derived nightly vitals and compared with your 14-day baseline median.`;
}

function renderTrendsDashboard() {
  const result = appState.current;
  const chartGrid = document.getElementById('trendsChartGrid');
  if (!result) {
    chartGrid.innerHTML = '<div class="muted">Import Oura data to view trends.</div>';
    return;
  }

  const scoreSeries = {
    readinessScore: [...result.tables.oura_daily_readiness].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: r.date, value: r.score })),
    sleepScore: [...result.tables.oura_daily_sleep].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: r.date, value: r.score })),
    activityScore: [...result.tables.oura_daily_activity].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ date: r.date, value: r.score }))
  };

  const vitalsSeries = {
    rhr: result.series.map((s) => ({ date: s.date, value: s.rhr })).filter((s) => s.value != null),
    hrv: result.series.map((s) => ({ date: s.date, value: s.hrv })).filter((s) => s.value != null),
    spo2: result.series.map((s) => ({ date: s.date, value: s.spo2 })).filter((s) => s.value != null),
    temp: result.series.map((s) => ({ date: s.date, value: s.temp })).filter((s) => s.value != null)
  };

  const specs = ['readinessScore', 'sleepScore', 'activityScore', 'rhr', 'hrv', 'spo2', 'temp'];
  chartGrid.innerHTML = '';
  for (const key of specs) {
    const src = scoreSeries[key] || vitalsSeries[key] || [];
    const rangeSeries = src.slice(-appState.trendsRangeDays);
    const latest = rangeSeries.at(-1)?.value;
    const baseline = key.endsWith('Score')
      ? (() => {
        const prior = rangeSeries.slice(0, -1).map((item) => item.value).filter((v) => v != null);
        if (!prior.length) return null;
        const sorted = [...prior].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      })()
      : baselineMedian(result.series, key, rangeSeries.at(-1)?.date, BASELINE_WINDOW_DAYS);

    const card = document.createElement('div');
    card.className = 'kpi';
    card.innerHTML = `<div class="kpi-label">${METRIC_DEFS[key].label}</div><div class="kpi-value" id="trendLatest-${key}">${fmt(latest, key)}</div><div class="kpi-reason">Baseline: ${fmt(baseline, key)}</div><div class="kpi-reason">Delta: ${key.endsWith('Score') ? (latest != null && baseline != null ? (latest - baseline > 0 ? '+' : '') + (latest - baseline).toFixed(1) : '—') : formatDelta(key, latest, baseline)}</div><div id="trendChart-${key}" class="trend"></div>`;
    chartGrid.appendChild(card);
    renderTrendSvg(card.querySelector(`#trendChart-${key}`), rangeSeries, baseline);
  }
}

function appendInsightsLog(insights, snapshot) {
  if (!snapshot.latestDate || !insights.length) return;
  const existing = getInsightsLog();
  const existingKeys = new Set(existing.map((i) => `${i.date}|${i.ruleId}`));
  const next = [...existing];
  for (const insight of insights) {
    const key = `${snapshot.latestDate}|${insight.ruleId}`;
    if (existingKeys.has(key)) continue;
    next.push({
      date: snapshot.latestDate,
      ruleId: insight.ruleId,
      severity: insight.severity,
      latest: JSON.stringify(insight.latest || {}),
      baseline: JSON.stringify(insight.baseline || {}),
      delta: JSON.stringify(insight.delta || {}),
      message: insight.message,
      createdAt: new Date().toISOString()
    });
  }
  if (next.length !== existing.length) saveInsightsLog(next);
}

function render(result) {
  appState.current = result;
  const { snapshot, series, tables, insights } = result;
  renderTodayScores(tables, snapshot);
  renderInsightsSection(insights || []);
  renderInsightDrawer();
  document.getElementById('latestNightDate').textContent = snapshot.latestDate || '—';
  const baselineEnding = series.filter((row) => row.date !== snapshot.latestDate).at(-1)?.date || '—';
  baselineWindowLabel.textContent = `Baseline window: ${BASELINE_WINDOW_DAYS}-day median ending ${baselineEnding}`;
  const setMetric = (k) => {
    const latest = snapshot.latest[k]; const baseline = snapshot.baseline[k];
    document.getElementById(`${k}Latest`).textContent = latest == null ? '—' : fmt(latest, k);
    document.getElementById(`${k}Baseline`).textContent = baseline == null ? '—' : fmt(baseline, k);
    document.getElementById(`${k}Delta`).textContent = formatDelta(k, latest, baseline);
    renderTrendSvg(document.getElementById(`${k}Trend`), series.filter((s) => s[k] != null).slice(-30).map((s) => ({ date: s.date, value: s[k] })), baseline);
  };
  ['rhr', 'hrv', 'spo2', 'temp'].forEach(setMetric);

  const nightsDetected = tables.oura_nightly_vitals.length;
  const validNights = tables.oura_nightly_vitals.filter((n) => n.valid).length;
  const latestNight = tables.oura_nightly_vitals.at(-1);
  document.getElementById('qualityInfo').textContent = `nights detected/valid: ${nightsDetected}/${validNights} • latest samples: ${latestNight?.samples ?? '—'} • windowMode: ${latestNight?.windowMode ?? '—'}`;

  debugContent.textContent = result.ingestReportJson;
  ingestReportEl.textContent = result.ingestReportJson;
  status.textContent = `Parsed datasets: ${result.ingestReport.datasetsFound.join(', ') || 'none'}`;

  renderVitalsDetail();
  renderTrendsDashboard();
}

function clearRenderedData() {
  appState.current = null;
  appState.selectedInsightId = null;
  document.getElementById('todayReadinessScore').textContent = '—';
  document.getElementById('todaySleepScore').textContent = '—';
  document.getElementById('todayActivityScore').textContent = '—';
  document.getElementById('todayLatestNightDate').textContent = '—';
  todayImportPrompt.classList.remove('hidden');
  document.getElementById('todayInsightsList').innerHTML = '<div class="muted">No insight cards yet. Import more data to generate signals.</div>';
  document.getElementById('viewAllInsightsBtn').disabled = true;
  document.getElementById('latestNightDate').textContent = '—';
  baselineWindowLabel.textContent = `Baseline window: ${BASELINE_WINDOW_DAYS}-day median ending —`;
  ['rhr', 'hrv', 'spo2', 'temp'].forEach((k) => {
    document.getElementById(`${k}Latest`).textContent = '—';
    document.getElementById(`${k}Baseline`).textContent = '—';
    document.getElementById(`${k}Delta`).textContent = '';
    document.getElementById(`${k}Trend`).innerHTML = '';
  });
  document.getElementById('qualityInfo').textContent = '';
  document.getElementById('trendsChartGrid').innerHTML = '<div class="muted">Import Oura data to view trends.</div>';
  document.getElementById('insightDrawer').classList.remove('open');
  debugContent.textContent = 'No import yet.';
  ingestReportEl.textContent = 'No ingest yet.';
  status.textContent = 'No file selected.';
}

document.querySelectorAll('[data-route]').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    navigateTo(link.dataset.route || DEFAULT_ROUTE);
  });
});

window.addEventListener('hashchange', () => renderRoute(location.hash));

developerModeToggle.addEventListener('change', () => {
  saveSettings({ ...getSettings(), developerMode: developerModeToggle.checked });
  refreshDeveloperModeUi();
  if (!developerModeToggle.checked && normalizeRoute(location.hash) === '/my-health/settings') return;
  if (!developerModeToggle.checked && location.hash === '#/my-health/data-tools/debug') navigateTo('/my-health/settings');
});

document.querySelectorAll('[data-vitals-metric]').forEach((button) => {
  button.addEventListener('click', () => openVitalsDetail(button.dataset.vitalsMetric));
});

document.getElementById('closeVitalsDetail').addEventListener('click', () => {
  document.getElementById('vitalsDetailModal').classList.remove('open');
});

document.querySelectorAll('[data-vitals-range]').forEach((button) => {
  button.addEventListener('click', () => {
    appState.vitalsRangeDays = Number(button.dataset.vitalsRange);
    document.querySelectorAll('[data-vitals-range]').forEach((b) => b.classList.toggle('active', b === button));
    renderVitalsDetail();
  });
});

document.querySelectorAll('[data-trends-range]').forEach((button) => {
  button.addEventListener('click', () => {
    appState.trendsRangeDays = Number(button.dataset.trendsRange);
    document.querySelectorAll('[data-trends-range]').forEach((b) => b.classList.toggle('active', b === button));
    renderTrendsDashboard();
  });
});

document.getElementById('viewAllInsightsBtn').addEventListener('click', () => {
  document.getElementById('allInsightsModal').classList.add('open');
  renderAllInsightsModal();
});

document.getElementById('closeAllInsights').addEventListener('click', () => {
  document.getElementById('allInsightsModal').classList.remove('open');
});

document.getElementById('closeInsightDrawer').addEventListener('click', () => {
  appState.selectedInsightId = null;
  renderInsightDrawer();
});

document.querySelectorAll('[data-insight-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    appState.insightFilter = button.dataset.insightFilter;
    document.querySelectorAll('[data-insight-filter]').forEach((b) => b.classList.toggle('active', b === button));
    renderAllInsightsModal();
  });
});

exportInsightsJsonBtn.addEventListener('click', () => {
  const log = getInsightsLog();
  downloadText(`insights-log-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(log, null, 2), 'application/json');
});

exportInsightsCsvBtn.addEventListener('click', () => {
  const log = getInsightsLog();
  downloadText(`insights-log-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(log), 'text/csv');
});

clearInsightsLogBtn.addEventListener('click', () => {
  saveInsightsLog([]);
});

zipInput.addEventListener('change', async () => {
  const file = zipInput.files?.[0];
  if (!file) return;
  const result = await readZip(file);
  appendInsightsLog(result.insights || [], result.snapshot || {});
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...result, importedAt: new Date().toISOString() }));
  render(result);
});

clearBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  zipInput.value = '';
  clearRenderedData();
});

const cached = localStorage.getItem(STORAGE_KEY);
if (cached) {
  try { render(JSON.parse(cached)); } catch { clearRenderedData(); }
} else {
  clearRenderedData();
}

renderInsightsLogStatus();
refreshDeveloperModeUi();
renderRoute(location.hash || `#${DEFAULT_ROUTE}`);
