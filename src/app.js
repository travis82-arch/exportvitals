let deferredPrompt = null;
const STORAGE_KEY = 'ouraDerivedMetricsV1';

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

const kpiReadiness = document.getElementById('kpiReadiness');
const kpiSleep = document.getElementById('kpiSleep');
const kpiHrv = document.getElementById('kpiHrv');
const kpiRhr = document.getElementById('kpiRhr');
const kpiRhrLabel = document.getElementById('kpiRhrLabel');
const deviations = document.getElementById('deviations');

const METRICS = {
  readiness: ['score', 'readiness_score', 'readiness score'],
  readinessDate: ['day', 'date', 'summary_date'],
  sleepDate: ['day', 'date', 'summary_date'],
  bedtimeStart: ['bedtime_start', 'bedtime start', 'start_time', 'start time'],
  sleepDuration: ['total_sleep_duration', 'total sleep duration', 'total_sleep', 'total sleep', 'sleep duration'],
  hrv: ['average_hrv', 'average hrv', 'avg_hrv', 'hrv average', 'rmssd'],
  rhrLowest: ['lowest_heart_rate', 'lowest heart rate', 'lowest_hr', 'lowest hr'],
  rhrAverage: ['average_heart_rate', 'average heart rate', 'avg_heart_rate', 'average_hr', 'average hr']
};

function normalizeHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function pickColumn(headers, candidates) {
  const normalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  for (const cand of candidates) {
    const hit = normalized.get(normalizeHeader(cand));
    if (hit) return hit;
  }
  return null;
}

function parseCsv(text) {
  return Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseDurationToMinutes(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (value > 10000) return Math.round(value / 60); // seconds
    if (value > 250) return Math.round(value); // already minutes
    return Math.round(value * 60); // likely hours
  }
  const str = String(value).trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) {
    const parts = str.split(':').map(Number);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 60 + parts[1] + Math.round(parts[2] / 60);
  }
  const n = Number(str);
  return Number.isFinite(n) ? parseDurationToMinutes(n) : null;
}

function formatMinutes(total) {
  if (!Number.isFinite(total)) return '—';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function toDateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function latestByDate(rows) {
  return [...rows].sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;
}

function buildStatus(info) {
  const lines = [
    `ZIP: ${info.filename}`,
    `Found datasets: ${info.found.join(', ') || 'none'}`,
    `Missing datasets: ${info.missing.join(', ') || 'none'}`,
    `Latest date detected: ${info.latestDate || 'unknown'}`,
    ...info.notes.map((n) => `Note: ${n}`)
  ];
  status.textContent = lines.join('\n');
  status.style.whiteSpace = 'pre-line';
}

async function readZip(file) {
  const zip = await JSZip.loadAsync(file);
  const csvEntries = Object.values(zip.files)
    .filter((f) => !f.dir && f.name.toLowerCase().endsWith('.csv'));

  const datasets = { readiness: null, sleep: null };
  const notes = [];

  for (const entry of csvEntries) {
    const text = await entry.async('string');
    const rows = parseCsv(text);
    if (!rows.length) continue;
    const headers = Object.keys(rows[0]);
    const scoreCol = pickColumn(headers, METRICS.readiness);
    const readinessDate = pickColumn(headers, METRICS.readinessDate);
    const sleepDurationCol = pickColumn(headers, METRICS.sleepDuration);
    const sleepDateCol = pickColumn(headers, METRICS.sleepDate);

    const path = entry.name.toLowerCase();
    if ((!datasets.readiness && scoreCol && readinessDate) || path.includes('readiness')) {
      datasets.readiness = { rows, headers, file: entry.name };
    }
    if ((!datasets.sleep && sleepDurationCol && sleepDateCol) || path.includes('sleep')) {
      datasets.sleep = { rows, headers, file: entry.name };
    }
  }

  const readinessRows = [];
  if (datasets.readiness) {
    const rDate = pickColumn(datasets.readiness.headers, METRICS.readinessDate);
    const rScore = pickColumn(datasets.readiness.headers, METRICS.readiness);
    for (const row of datasets.readiness.rows) {
      const date = toDateOnly(row[rDate]);
      const score = toNumber(row[rScore]);
      if (date && score != null) readinessRows.push({ date, readiness: score });
    }
    if (!readinessRows.length) notes.push('Readiness file found but no valid rows for score/date.');
  } else {
    notes.push('No readiness dataset detected.');
  }

  const sleepRows = [];
  let rhrSource = 'RHR';
  if (datasets.sleep) {
    const sDate = pickColumn(datasets.sleep.headers, METRICS.bedtimeStart)
      || pickColumn(datasets.sleep.headers, METRICS.sleepDate);
    const sDuration = pickColumn(datasets.sleep.headers, METRICS.sleepDuration);
    const sHrv = pickColumn(datasets.sleep.headers, METRICS.hrv);
    const sRhrLow = pickColumn(datasets.sleep.headers, METRICS.rhrLowest);
    const sRhrAvg = pickColumn(datasets.sleep.headers, METRICS.rhrAverage);
    rhrSource = sRhrLow ? 'RHR (lowest)' : sRhrAvg ? 'RHR (average)' : 'RHR';

    for (const row of datasets.sleep.rows) {
      const date = toDateOnly(row[sDate]);
      const sleepMinutes = parseDurationToMinutes(row[sDuration]);
      const hrv = toNumber(row[sHrv]);
      const rhr = toNumber(sRhrLow ? row[sRhrLow] : row[sRhrAvg]);
      if (!date) continue;
      sleepRows.push({
        date,
        sleepMinutes,
        hrv,
        rhr
      });
    }
    if (!sleepRows.length) notes.push('Sleep file found but no valid date rows.');
  } else {
    notes.push('No sleep dataset detected.');
  }

  const dateMap = new Map();
  for (const row of readinessRows) dateMap.set(row.date, { ...(dateMap.get(row.date) || {}), ...row });
  for (const row of sleepRows) dateMap.set(row.date, { ...(dateMap.get(row.date) || {}), ...row });
  const mergedRows = [...dateMap.entries()]
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    mergedRows,
    rhrSource,
    status: {
      filename: file.name,
      found: [datasets.readiness?.file, datasets.sleep?.file].filter(Boolean),
      missing: [!datasets.readiness ? 'readiness CSV' : null, !datasets.sleep ? 'sleep CSV' : null].filter(Boolean),
      latestDate: mergedRows[mergedRows.length - 1]?.date,
      notes
    }
  };
}

function baselineForMetric(rows, latestDate, key) {
  const filtered = rows
    .filter((r) => r.date !== latestDate && r[key] != null)
    .slice(-14)
    .map((r) => r[key]);
  return median(filtered);
}

function render(mergedRows, rhrSource) {
  if (!mergedRows.length) {
    kpiReadiness.textContent = '—';
    kpiSleep.textContent = '—';
    kpiHrv.textContent = '—';
    kpiRhr.textContent = '—';
    deviations.textContent = 'No derived rows available from import.';
    return;
  }

  const latest = latestByDate(mergedRows);
  const latestDate = latest.date;
  kpiReadiness.textContent = latest.readiness ?? '—';
  kpiSleep.textContent = latest.sleepMinutes != null ? formatMinutes(latest.sleepMinutes) : '—';
  kpiHrv.textContent = latest.hrv != null ? `${latest.hrv} ms` : '—';
  kpiRhr.textContent = latest.rhr != null ? `${latest.rhr} bpm` : '—';
  kpiRhrLabel.textContent = `Latest ${rhrSource}`;

  const specs = [
    { key: 'readiness', label: 'Readiness', unit: '' },
    { key: 'sleepMinutes', label: 'Sleep duration', unit: ' min' },
    { key: 'hrv', label: 'HRV', unit: ' ms' },
    { key: 'rhr', label: rhrSource, unit: ' bpm' }
  ];

  const lines = specs.map((spec) => {
    const latestValue = latest[spec.key];
    const base = baselineForMetric(mergedRows, latestDate, spec.key);
    if (latestValue == null) return `${spec.label}: latest — (missing in latest row)`;
    if (base == null) return `${spec.label}: latest ${latestValue}${spec.unit}, baseline — (need more history)`;
    const delta = latestValue - base;
    const pct = base !== 0 ? (delta / base) * 100 : null;
    const sign = delta > 0 ? '+' : '';
    const pctText = pct == null ? 'n/a' : `${sign}${pct.toFixed(1)}%`;
    return `${spec.label}: latest ${latestValue}${spec.unit}, baseline ${base.toFixed(1)}${spec.unit}, Δ ${sign}${delta.toFixed(1)}${spec.unit} (${pctText})`;
  });

  deviations.textContent = lines.join('\n');
  deviations.style.whiteSpace = 'pre-line';
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

zipInput.addEventListener('change', async () => {
  const file = zipInput.files?.[0];
  if (!file) {
    status.textContent = 'No file selected.';
    return;
  }
  try {
    status.textContent = 'Parsing ZIP locally…';
    const result = await readZip(file);
    render(result.mergedRows, result.rhrSource);
    buildStatus(result.status);
    saveDerived({
      mergedRows: result.mergedRows,
      rhrSource: result.rhrSource,
      status: result.status,
      importedAt: new Date().toISOString()
    });
  } catch (error) {
    status.textContent = `Import failed: ${error.message}`;
    deviations.textContent = 'Could not compute deviations because parsing failed.';
  }
});

clearBtn.addEventListener('click', () => {
  zipInput.value = '';
  localStorage.removeItem(STORAGE_KEY);
  status.textContent = 'Cleared local derived data and file selection.';
  deviations.textContent = 'Import a ZIP to calculate deviations.';
  kpiReadiness.textContent = '—';
  kpiSleep.textContent = '—';
  kpiHrv.textContent = '—';
  kpiRhr.textContent = '—';
  kpiRhrLabel.textContent = 'Latest RHR';
});

const existing = loadDerived();
if (existing?.mergedRows?.length) {
  render(existing.mergedRows, existing.rhrSource || 'RHR');
  buildStatus({
    ...existing.status,
    notes: [...(existing.status?.notes || []), `Loaded from local cache (${existing.importedAt}).`]
  });
}
