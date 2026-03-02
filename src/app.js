let deferredPrompt = null;
const STORAGE_KEY = 'ouraDerivedMetricsV2';

const DATASET_ALIASES = {
  dailyReadiness: ['dailyreadiness.csv', 'readiness.csv', 'ouradailyreadiness.csv'],
  sleepTime: ['sleeptime.csv', 'ourasleeptime.csv'],
  sleepSession: ['sleep.csv', 'sleepperiod.csv', 'sleepperiods.csv', 'ourasleep.csv'],
  sleepHeartRate: ['sleepheartrate.csv', 'ourasleepheartrate.csv'],
  sleepHrv: ['sleephrv.csv', 'ourasleephrv.csv'],
  dailySleep: ['dailysleep.csv', 'ouradailysleep.csv'],
  heartRate: ['heartrate.csv', 'ouraheartrate.csv'],
  dailyActivity: ['dailyactivity.csv', 'ouradailyactivity.csv'],
  dailySpo2: ['dailyspo2.csv', 'ouradailyspo2.csv']
};

const FIELD_ALIASES = {
  date: ['date', 'day', 'summarydate', 'reportdate', 'timestamp', 'datetime', 'createdat'],
  readinessScore: ['readinessscore', 'readiness_score', 'readiness', 'readinesspoints', 'score'],
  totalSleepTime: ['totalsleeptime', 'totalsleepduration', 'total_sleep_duration', 'total_sleep_time'],
  averageHrv: ['averagehrv', 'avghrv', 'hrv', 'average_hrv'],
  restingHeartRate: ['restingheartrate', 'avghr', 'averageheartrate', 'lowestheartrate', 'rhr', 'resting_hr'],
  sleepScore: ['sleepscore', 'sleep_score', 'score'],
  temperatureDeviation: ['temperaturedeviation', 'tempdeviation', 'temperature_deviation']
};

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    btn.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }, { once: true });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

const zipInput = document.getElementById('zipInput');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');
const debugContent = document.getElementById('debugContent');

const kpis = {
  readiness: { value: document.getElementById('kpiReadiness'), reason: document.getElementById('reasonReadiness') },
  sleep: { value: document.getElementById('kpiSleep'), reason: document.getElementById('reasonSleep') },
  hrv: { value: document.getElementById('kpiHrv'), reason: document.getElementById('reasonHrv') },
  rhr: { value: document.getElementById('kpiRhr'), reason: document.getElementById('reasonRhr') }
};
const deviations = document.getElementById('deviations');

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[\s_\-]+/g, '');
}

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function toNumber(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDateToLocal(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{10,13}$/.test(raw)) {
    const num = Number(raw);
    if (!Number.isFinite(num)) return null;
    const ms = raw.length === 13 ? num : num * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : toLocalDateString(d);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : toLocalDateString(d);
}

function toLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDurationToMinutes(value) {
  if (value == null || value === '') return null;
  const str = String(value).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const parts = str.split(':').map(Number);
    const base = parts[0] * 60 + parts[1];
    return parts.length === 3 ? base + Math.round(parts[2] / 60) : base;
  }
  const n = toNumber(str);
  if (n == null) return null;
  if (n > 10000) return Math.round(n / 60);
  if (n > 250) return Math.round(n);
  return Math.round(n * 60);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatMinutes(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('.tab')];
  const panels = [...document.querySelectorAll('.tab-panel')];
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      panels.forEach((panel) => panel.classList.toggle('hidden', panel.dataset.panel !== tab.dataset.tab));
    });
  });
}

function detectDatasetRegistry(zipFiles) {
  const registry = {};
  for (const file of zipFiles) {
    const base = file.name.split('/').pop();
    const normalized = normalizeName(base);
    for (const [key, aliases] of Object.entries(DATASET_ALIASES)) {
      if (aliases.some((alias) => normalizeName(alias) === normalized) && !registry[key]) {
        registry[key] = file;
      }
    }
  }
  return registry;
}

function parseCsvWithDebug(text) {
  const cleaned = stripBom(text);
  const result = Papa.parse(cleaned, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    delimiter: ''
  });
  return {
    rows: result.data || [],
    delimiter: result.meta?.delimiter || 'auto',
    fields: result.meta?.fields || []
  };
}

function pickBestColumn(headers, aliases, validator) {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeName(header) }));
  for (const alias of aliases) {
    const hit = normalizedHeaders.find((h) => h.normalized === normalizeName(alias));
    if (hit && (!validator || validator(hit.header))) return hit.header;
  }
  return null;
}

function summarizeRows(rows, chosenColumns, mapper) {
  const parsed = [];
  for (const row of rows) {
    const mapped = mapper(row, chosenColumns);
    if (mapped) parsed.push(mapped);
  }
  return parsed;
}

function readinessMapper(row, chosen) {
  const date = parseDateToLocal(row[chosen.date]);
  const score = toNumber(row[chosen.score]);
  const tempDeviation = chosen.temperatureDeviation ? toNumber(row[chosen.temperatureDeviation]) : null;
  if (!date || score == null || score < 0 || score > 100) return null;
  return { date, readiness: score, temperatureDeviation: tempDeviation };
}

function sleepMapper(row, chosen) {
  const date = parseDateToLocal(row[chosen.date]);
  if (!date) return null;
  const sleepMinutes = chosen.sleepTime ? parseDurationToMinutes(row[chosen.sleepTime]) : null;
  const hrv = chosen.hrv ? toNumber(row[chosen.hrv]) : null;
  const rhr = chosen.rhr ? toNumber(row[chosen.rhr]) : null;
  const sleepScore = chosen.sleepScore ? toNumber(row[chosen.sleepScore]) : null;
  return { date, sleepMinutes, hrv, rhr, sleepScore };
}

function buildDatasetDebug(key, parsed, chosenColumns, reason) {
  return {
    dataset: key,
    delimiter: parsed.delimiter,
    rowCount: parsed.rows.length,
    columns: parsed.fields.slice(0, 30),
    chosenColumns,
    sampleRows: parsed.rows.slice(0, 3),
    reason: reason || null
  };
}

async function readZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.csv'));
  const datasetRegistry = detectDatasetRegistry(entries);
  const debug = {
    zipFilename: file.name,
    detectedDatasets: Object.fromEntries(Object.entries(datasetRegistry).map(([k, v]) => [k, v.name])),
    datasets: [],
    readinessFailureReason: null
  };

  const allRowsByDate = new Map();
  const notes = [];

  async function parseRegisteredDataset(key) {
    const entry = datasetRegistry[key];
    if (!entry) return null;
    const text = await entry.async('string');
    const parsed = parseCsvWithDebug(text);
    return { entry, parsed };
  }

  const readinessDataset = await parseRegisteredDataset('dailyReadiness');
  if (readinessDataset) {
    const headers = readinessDataset.parsed.fields;
    const chosen = {
      date: pickBestColumn(headers, FIELD_ALIASES.date),
      score: pickBestColumn(headers, FIELD_ALIASES.readinessScore),
      temperatureDeviation: pickBestColumn(headers, FIELD_ALIASES.temperatureDeviation)
    };

    let reason = null;
    if (!readinessDataset.parsed.rows.length) {
      reason = 'Parsed 0 rows after header.';
    } else if (!chosen.date) {
      reason = 'No valid rows: could not find a date column.';
    } else if (!chosen.score) {
      reason = 'No valid rows: could not find a readiness score column.';
    }

    const mappedRows = reason ? [] : summarizeRows(readinessDataset.parsed.rows, chosen, readinessMapper);
    if (!mappedRows.length && !reason) reason = 'No valid rows: score column not numeric or values out of range 0-100.';

    for (const row of mappedRows) {
      allRowsByDate.set(row.date, { ...(allRowsByDate.get(row.date) || {}), ...row });
    }

    if (reason) {
      notes.push(reason);
      debug.readinessFailureReason = reason;
    }
    debug.datasets.push(buildDatasetDebug('dailyReadiness', readinessDataset.parsed, chosen, reason));
  } else {
    const reason = 'No readiness dataset detected in ZIP.';
    notes.push(reason);
    debug.readinessFailureReason = reason;
  }

  const sleepDataset = (await parseRegisteredDataset('sleepSession')) || (await parseRegisteredDataset('dailySleep')) || (await parseRegisteredDataset('sleepTime'));
  if (sleepDataset) {
    const headers = sleepDataset.parsed.fields;
    const chosen = {
      date: pickBestColumn(headers, FIELD_ALIASES.date),
      sleepTime: pickBestColumn(headers, FIELD_ALIASES.totalSleepTime),
      hrv: pickBestColumn(headers, FIELD_ALIASES.averageHrv),
      rhr: pickBestColumn(headers, FIELD_ALIASES.restingHeartRate),
      sleepScore: pickBestColumn(headers, FIELD_ALIASES.sleepScore)
    };

    let reason = null;
    if (!sleepDataset.parsed.rows.length) reason = 'Parsed 0 rows after header.';
    else if (!chosen.date) reason = 'No valid rows: could not find a date column.';

    const mappedRows = reason ? [] : summarizeRows(sleepDataset.parsed.rows, chosen, sleepMapper);
    for (const row of mappedRows) {
      allRowsByDate.set(row.date, { ...(allRowsByDate.get(row.date) || {}), ...row });
    }
    if (reason) notes.push(`Sleep dataset issue: ${reason}`);
    debug.datasets.push(buildDatasetDebug('sleep', sleepDataset.parsed, chosen, reason));
  } else {
    notes.push('Sleep session data not found in this export.');
  }

  for (const key of ['sleepHeartRate', 'sleepHrv', 'heartRate', 'dailyActivity', 'dailySpo2']) {
    const extra = await parseRegisteredDataset(key);
    if (extra) {
      debug.datasets.push(buildDatasetDebug(key, extra.parsed, {}, null));
    }
  }

  const mergedRows = [...allRowsByDate.entries()]
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    mergedRows,
    status: {
      filename: file.name,
      found: Object.values(debug.detectedDatasets),
      missing: Object.keys(DATASET_ALIASES).filter((key) => !datasetRegistry[key]),
      latestDate: mergedRows[mergedRows.length - 1]?.date || null,
      notes
    },
    debug
  };
}

function baselineForMetric(rows, latestDate, key) {
  const values = rows.filter((row) => row.date !== latestDate && row[key] != null).slice(-14).map((row) => row[key]);
  return values.length >= 7 ? median(values) : null;
}

function render(result) {
  const rows = result.mergedRows;
  if (!rows.length) {
    kpis.readiness.value.textContent = '—';
    kpis.sleep.value.textContent = '—';
    kpis.hrv.value.textContent = '—';
    kpis.rhr.value.textContent = '—';
    deviations.textContent = 'No derived rows available from import.';
    return;
  }

  const latest = rows[rows.length - 1];
  const latestDate = latest.date;

  kpis.readiness.value.textContent = latest.readiness ?? '—';
  kpis.readiness.reason.textContent = latest.readiness == null
    ? (result.debug.readinessFailureReason || 'Readiness score missing in latest day.')
    : 'Loaded from daily readiness dataset.';

  kpis.sleep.value.textContent = latest.sleepMinutes != null ? formatMinutes(latest.sleepMinutes) : '—';
  kpis.sleep.reason.textContent = latest.sleepMinutes == null
    ? 'Sleep session data not found in this export.'
    : 'Loaded from sleep dataset.';

  kpis.hrv.value.textContent = latest.hrv != null ? `${latest.hrv} ms` : '—';
  kpis.hrv.reason.textContent = latest.hrv == null
    ? 'HRV values not present in matched sleep dataset.'
    : 'Loaded from sleep dataset HRV columns.';

  kpis.rhr.value.textContent = latest.rhr != null ? `${latest.rhr} bpm` : '—';
  kpis.rhr.reason.textContent = latest.rhr == null
    ? 'Resting heart-rate values not present in matched sleep dataset.'
    : 'Loaded from sleep dataset heart-rate columns.';

  const specs = [
    { key: 'readiness', label: 'Readiness Score', unit: '' },
    { key: 'sleepMinutes', label: 'Total Sleep Time', unit: ' min' },
    { key: 'hrv', label: 'HRV', unit: ' ms' },
    { key: 'rhr', label: 'Resting Heart Rate', unit: ' bpm' }
  ];

  const lines = specs.map((spec) => {
    const latestValue = latest[spec.key];
    if (latestValue == null) return `${spec.label}: latest —`;
    const baseline = baselineForMetric(rows, latestDate, spec.key);
    if (baseline == null) return `${spec.label}: latest ${latestValue}${spec.unit}; Baseline not available (need ≥7 days).`;
    const delta = latestValue - baseline;
    const pct = baseline !== 0 ? `${((delta / baseline) * 100).toFixed(1)}%` : 'n/a';
    return `${spec.label}: latest ${latestValue}${spec.unit}, baseline ${baseline.toFixed(1)}${spec.unit}, Δ ${delta.toFixed(1)}${spec.unit} (${pct})`;
  });
  deviations.textContent = lines.join('\n');
  deviations.style.whiteSpace = 'pre-line';
}

function buildStatus(info) {
  status.textContent = [
    `ZIP: ${info.filename}`,
    `Detected datasets: ${info.found.join(', ') || 'none'}`,
    `Missing keys: ${info.missing.join(', ') || 'none'}`,
    `Latest date detected: ${info.latestDate || 'none'}`,
    ...info.notes.map((note) => `Note: ${note}`)
  ].join('\n');
}

function renderDebug(debug) {
  const lines = [
    `ZIP filename: ${debug.zipFilename}`,
    'Detected datasets:',
    JSON.stringify(debug.detectedDatasets, null, 2),
    ''
  ];
  for (const dataset of debug.datasets) {
    lines.push(`Dataset: ${dataset.dataset}`);
    lines.push(`  delimiter: ${dataset.delimiter}`);
    lines.push(`  rows parsed: ${dataset.rowCount}`);
    lines.push(`  columns: ${dataset.columns.join(', ') || '(none)'}`);
    lines.push(`  chosen columns: ${JSON.stringify(dataset.chosenColumns)}`);
    if (dataset.reason) lines.push(`  reason: ${dataset.reason}`);
    lines.push(`  first rows: ${JSON.stringify(dataset.sampleRows, null, 2)}`);
    lines.push('');
  }
  if (debug.readinessFailureReason) lines.push(`Readiness KPI reason: ${debug.readinessFailureReason}`);
  debugContent.textContent = lines.join('\n');
}

function saveDerived(payload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadDerived() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearUI() {
  kpis.readiness.value.textContent = '—';
  kpis.sleep.value.textContent = '—';
  kpis.hrv.value.textContent = '—';
  kpis.rhr.value.textContent = '—';
  kpis.readiness.reason.textContent = 'Import an Oura ZIP to calculate this metric.';
  kpis.sleep.reason.textContent = 'Sleep session data not found in this export.';
  kpis.hrv.reason.textContent = 'Sleep session HRV data not found in this export.';
  kpis.rhr.reason.textContent = 'Sleep session heart-rate data not found in this export.';
  status.textContent = 'No file selected.';
  deviations.textContent = 'Import a ZIP to calculate deviations.';
  debugContent.textContent = 'No import yet.';
}

function runSelfTests() {
  const checks = [
    normalizeName('Readiness Score') === 'readinessscore',
    parseDateToLocal('2024-09-01') === '2024-09-01',
    parseDateToLocal('2024-09-01T23:45:00Z') !== null,
    toNumber('85') === 85
  ];
  const passed = checks.every(Boolean);
  console.info(`Self-test ${passed ? 'passed' : 'failed'}.`, checks);
}

zipInput.addEventListener('change', async () => {
  const file = zipInput.files?.[0];
  if (!file) return;
  try {
    status.textContent = 'Parsing ZIP locally…';
    const result = await readZip(file);
    render(result);
    buildStatus(result.status);
    renderDebug(result.debug);
    saveDerived({ ...result, importedAt: new Date().toISOString() });
  } catch (error) {
    status.textContent = `Import failed: ${error.message}`;
    debugContent.textContent = `Import failed:\n${error.stack || error.message}`;
  }
});

clearBtn.addEventListener('click', () => {
  zipInput.value = '';
  localStorage.removeItem(STORAGE_KEY);
  clearUI();
});

setupTabs();
runSelfTests();

const existing = loadDerived();
if (existing?.mergedRows?.length) {
  render(existing);
  buildStatus({
    ...existing.status,
    notes: [...(existing.status?.notes || []), `Loaded from local cache (${existing.importedAt}).`]
  });
  renderDebug(existing.debug);
}
