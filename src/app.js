import {
  normalizeName,
  sniffDelimiter,
  safeJsonParse,
  toNumber,
  median,
  baselineMedian,
  metricDelta
} from './vitals-core.mjs';

const STORAGE_KEY = 'ouraDerivedMetricsV3';
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

function parseCsvWithDebug(text) {
  const sniff = sniffDelimiter(text);
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, delimiter: sniff.delimiter });
  return { rows: parsed.data || [], fields: parsed.meta?.fields || [], delimiter: parsed.meta?.delimiter || sniff.delimiter, sniff };
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
    const bucket = grouped.get(date) || { date, bpms: [], windowMode: window.mode, windowStart: window.start.toISOString(), windowEnd: window.end.toISOString() };
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
    return { date: n.date, samples, valid, rhr_night, estimated_hrv_rmssd_proxy, windowMode: n.windowMode, windowStart: n.windowStart, windowEnd: n.windowEnd };
  });
}

function formatDelta(metricKey, latest, baseline) {
  const d = metricDelta(metricKey, latest, baseline);
  if (d.absolute == null) return '—';
  const abs = `${d.absolute > 0 ? '+' : ''}${d.absolute.toFixed(metricKey === 'temp' ? 2 : 1)} ${d.deltaUnit}`;
  if (d.percent == null) return abs;
  return `${abs} (${d.percent > 0 ? '+' : ''}${d.percent.toFixed(1)}%)`;
}

function renderTrendSvg(el, series) {
  if (!el) return;
  if (!series.length) { el.innerHTML = 'No trend data'; return; }
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals); const max = Math.max(...vals);
  const points = vals.map((v, i) => {
    const x = (i / Math.max(vals.length - 1, 1)) * 180;
    const y = max === min ? 20 : 40 - ((v - min) / (max - min)) * 40;
    return `${x},${y}`;
  }).join(' ');
  el.innerHTML = `<svg width="180" height="44" viewBox="0 0 180 44"><polyline points="${points}" fill="none" stroke="#60a5fa" stroke-width="2"/></svg>`;
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
    const text = await entry.async('string');
    const parsed = parseCsvWithDebug(text);
    ingestReport.datasets[key] = { delimiterChosen: parsed.delimiter, rowsParsed: parsed.rows.length, fields: parsed.fields };

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
      rhr: baselineMedian(series, 'rhr', latestDate, 14),
      hrv: baselineMedian(series, 'hrv', latestDate, 14),
      spo2: baselineMedian(series, 'spo2', latestDate, 14),
      temp: baselineMedian(series, 'temp', latestDate, 14)
    }
  };

  return { tables, ingestReport, ingestReportJson: JSON.stringify(ingestReport, null, 2), series, snapshot };
}

function render(result) {
  const { snapshot, series, tables } = result;
  document.getElementById('latestNightDate').textContent = snapshot.latestDate || '—';
  const setMetric = (k, latestFmt, baselineFmt) => {
    const latest = snapshot.latest[k]; const baseline = snapshot.baseline[k];
    document.getElementById(`${k}Latest`).textContent = latest == null ? '—' : latestFmt(latest);
    document.getElementById(`${k}Baseline`).textContent = baseline == null ? '—' : baselineFmt(baseline);
    document.getElementById(`${k}Delta`).textContent = formatDelta(k, latest, baseline);
    renderTrendSvg(document.getElementById(`${k}Trend`), series.filter((s) => s[k] != null).slice(-30).map((s) => ({ date: s.date, value: s[k] })));
  };
  setMetric('rhr', (v) => `${v.toFixed(1)} bpm`, (v) => `${v.toFixed(1)} bpm`);
  setMetric('hrv', (v) => `${v.toFixed(1)} ms`, (v) => `${v.toFixed(1)} ms`);
  setMetric('spo2', (v) => `${v.toFixed(1)} %`, (v) => `${v.toFixed(1)} %`);
  setMetric('temp', (v) => `${v.toFixed(2)} °C`, (v) => `${v.toFixed(2)} °C`);

  const nightsDetected = tables.oura_nightly_vitals.length;
  const validNights = tables.oura_nightly_vitals.filter((n) => n.valid).length;
  const latestNight = tables.oura_nightly_vitals.at(-1);
  document.getElementById('qualityInfo').textContent = `nights detected/valid: ${nightsDetected}/${validNights} • latest samples: ${latestNight?.samples ?? '—'} • windowMode: ${latestNight?.windowMode ?? '—'}`;

  debugContent.textContent = result.ingestReportJson;
  ingestReportEl.textContent = result.ingestReportJson;
  status.textContent = `Parsed datasets: ${result.ingestReport.datasetsFound.join(', ') || 'none'}`;
}

zipInput.addEventListener('change', async () => {
  const file = zipInput.files?.[0];
  if (!file) return;
  const result = await readZip(file);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...result, importedAt: new Date().toISOString() }));
  render(result);
});

clearBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

const cached = localStorage.getItem(STORAGE_KEY);
if (cached) {
  try { render(JSON.parse(cached)); } catch { /* noop */ }
}
