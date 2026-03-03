import { normalizeName, parseContributors, parseSpo2Average, toNumber, median } from '../vitals-core.mjs';

const STORAGE_KEY = 'ouraDerivedMetricsV3';

const DATASET_ALIASES = {
  dailyReadiness: ['dailyreadiness.csv'],
  dailySleep: ['dailysleep.csv'],
  dailyActivity: ['dailyactivity.csv'],
  dailySpo2: ['dailyspo2.csv'],
  sleepTime: ['sleeptime.csv'],
  heartRate: ['heartrate.csv']
};

const store = {
  datasets: { dailyReadiness: [], dailySleep: [], dailyActivity: [], dailySpo2: [], sleepTime: [], heartRate: [] },
  derivedNightlyVitals: [],
  ingestReport: {},
  availabilityMatrix: {},
  uiSnapshot: {},
  importState: { status: 'idle', phase: 'Idle', percent: 0, lastResult: null, lastError: null }
};

const byDate = (rows) => Object.fromEntries((rows || []).map((r) => [r.date, r]));

function parseCsv(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data || [];
}

function normalizeRows(dataset, rows) {
  if (dataset === 'dailyReadiness')
    return rows
      .map((r) => ({
        date: r.day ?? r.date,
        score: toNumber(r.score),
        temperatureDeviation: toNumber(r.temperature_deviation),
        contributors: parseContributors(r.contributors)
      }))
      .filter((r) => r.date);

  if (dataset === 'dailySleep')
    return rows
      .map((r) => ({
        date: r.day ?? r.date,
        score: toNumber(r.score),
        contributors: parseContributors(r.contributors)
      }))
      .filter((r) => r.date);

  if (dataset === 'dailyActivity')
    return rows
      .map((r) => ({
        date: r.day ?? r.date,
        score: toNumber(r.score),
        steps: toNumber(r.steps),
        activeCalories: toNumber(r.active_calories)
      }))
      .filter((r) => r.date);

  if (dataset === 'dailySpo2')
    return rows
      .map((r) => ({
        date: r.day ?? r.date,
        spo2Average: parseSpo2Average(r.spo2_percentage, r.average),
        breathingDisturbanceIndex: toNumber(r.breathing_disturbance_index)
      }))
      .filter((r) => r.date);

  if (dataset === 'sleepTime')
    return rows
      .map((r) => ({ date: r.day ?? r.date, bedtimeStart: r.bedtime_start, bedtimeEnd: r.bedtime_end }))
      .filter((r) => r.date);

  if (dataset === 'heartRate')
    return rows
      .map((r) => ({ timestamp: r.timestamp, bpm: toNumber(r.bpm) }))
      .filter((r) => r.timestamp && r.bpm != null);

  return [];
}

function selectNightWindow(date, options = {}) {
  const fallbackStart = options.fallbackStart || '21:00';
  const fallbackEnd = options.fallbackEnd || '09:00';
  const mode = options.nightWindowMode || 'auto';

  const sleepRow = store.datasets.sleepTime.find((row) => row.date === date);

  if ((mode === 'auto' || mode === 'sleep-time') && sleepRow?.bedtimeStart && sleepRow?.bedtimeEnd) {
    return {
      start: new Date(sleepRow.bedtimeStart).getTime(),
      end: new Date(sleepRow.bedtimeEnd).getTime(),
      modeUsed: 'sleepTime'
    };
  }

  const start = new Date(`${date}T${fallbackStart}:00`).getTime();
  const end = new Date(`${date}T${fallbackEnd}:00`).getTime();
  return { start, end: end < start ? end + 24 * 60 * 60 * 1000 : end, modeUsed: 'settings' };
}

function deriveNightlyVitals(options = {}) {
  const dates = getAvailableDates();
  return dates.map((date) => {
    const window = selectNightWindow(date, options);
    const hr = (store.datasets.heartRate || [])
      .filter((row) => {
        const t = new Date(row.timestamp).getTime();
        return Number.isFinite(t) && t >= window.start && t <= window.end;
      })
      .map((r) => r.bpm)
      .filter((v) => v != null);

    const deltas = [];
    for (let i = 1; i < hr.length; i += 1) deltas.push(Math.abs(hr[i] - hr[i - 1]));

    return {
      date,
      rhr_night_bpm: hr.length ? Math.min(...hr) : null,
      hrv_rmssd_proxy_ms: deltas.length ? Math.sqrt(deltas.reduce((a, n) => a + n ** 2, 0) / deltas.length) : null,
      nightWindowMode: window.modeUsed
    };
  });
}

function computeAvailabilityMatrix() {
  const has = (name) => (store.datasets[name] || []).length > 0;
  store.availabilityMatrix = {
    dailySleep: has('dailySleep'),
    dailyReadiness: has('dailyReadiness'),
    dailyActivity: has('dailyActivity'),
    dailySpo2: has('dailySpo2'),
    heartRate: has('heartRate'),
    sleepTime: has('sleepTime')
  };
  return store.availabilityMatrix;
}

function updateImportState(next, onProgress) {
  store.importState = { ...store.importState, ...next };
  if (onProgress) onProgress(store.importState);
}

function getDateRangeFromDatasets(datasets) {
  const dates = Object.values(datasets)
    .flatMap((rows) => rows.map((row) => row.date).filter(Boolean))
    .sort();
  if (!dates.length) return { start: null, end: null, days: 0 };
  const unique = [...new Set(dates)];
  return { start: unique[0], end: unique.at(-1), days: unique.length };
}

export function loadFromLocalCache(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    Object.assign(store, {
      datasets: { ...store.datasets, ...(parsed.datasets || {}) },
      derivedNightlyVitals: parsed.derivedNightlyVitals || [],
      ingestReport: parsed.ingestReport || {},
      availabilityMatrix: parsed.availabilityMatrix || {},
      uiSnapshot: parsed.uiSnapshot || {},
      importState: { ...store.importState, ...(parsed.importState || {}) }
    });
  } catch {
    // noop
  }
  return store;
}

export function saveToLocalCache(storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function importZip(file, options = {}, onProgress) {
  if (!file || !String(file.name || '').toLowerCase().endsWith('.zip')) {
    throw new Error('Please choose a valid .zip export file from Oura.');
  }

  updateImportState({ status: 'importing', phase: 'Reading ZIP', percent: 5, lastError: null }, onProgress);

  const zip = await JSZip.loadAsync(file);
  updateImportState({ phase: 'Decompressing files', percent: 25 }, onProgress);

  const found = {};
  const report = {};
  const parsedFiles = [];

  for (const entryName of Object.keys(zip.files)) {
    if (zip.files[entryName].dir) continue;
    parsedFiles.push(entryName);
    const short = normalizeName(entryName.split('/').pop());
    for (const [dataset, aliases] of Object.entries(DATASET_ALIASES)) {
      if (aliases.some((alias) => normalizeName(alias) === short)) {
        updateImportState({ phase: 'Parsing JSON/CSV', percent: 55 }, onProgress);
        const text = await zip.files[entryName].async('string');
        found[dataset] = normalizeRows(dataset, parseCsv(text));
        report[dataset] = found[dataset].length;
      }
    }
  }

  updateImportState({ phase: 'Normalizing daily tables', percent: 75 }, onProgress);
  store.datasets = { ...store.datasets, ...found };

  updateImportState({ phase: 'Deriving nightly vitals', percent: 90 }, onProgress);
  store.derivedNightlyVitals = deriveNightlyVitals(options);
  computeAvailabilityMatrix();

  const dateRange = getDateRangeFromDatasets({ ...store.datasets, derivedNightlyVitals: store.derivedNightlyVitals });
  const rowCounts = {
    ...Object.fromEntries(Object.entries(store.datasets).map(([name, rows]) => [name, rows.length])),
    derivedNightlyVitals: store.derivedNightlyVitals.length
  };
  const daysPerDataset = Object.fromEntries(
    Object.entries(store.datasets).map(([name, rows]) => [name, new Set(rows.map((row) => row.date).filter(Boolean)).size])
  );

  updateImportState({ phase: 'Saving + indexing dates', percent: 100 }, onProgress);
  store.ingestReport = {
    ...report,
    parsedFiles,
    dateRange,
    daysPerDataset,
    rowCounts,
    mostRecentDate: dateRange.end
  };

  store.importState = {
    ...store.importState,
    status: 'success',
    phase: 'Done',
    percent: 100,
    lastResult: store.ingestReport,
    lastError: null
  };

  saveToLocalCache();
  if (onProgress) onProgress(store.importState);
  return store.ingestReport;
}

export function getAvailableDates() {
  const dates = [
    ...store.datasets.dailySleep.map((r) => r.date),
    ...store.datasets.dailyReadiness.map((r) => r.date),
    ...store.datasets.dailyActivity.map((r) => r.date),
    ...store.datasets.dailySpo2.map((r) => r.date),
    ...store.datasets.sleepTime.map((r) => r.date)
  ].filter(Boolean);
  return [...new Set(dates)].sort();
}

export function getDay(date, options = {}) {
  const pick = (rows) => rows.find((r) => r.date === date) || null;
  const window = selectNightWindow(date, options);
  const hrRows = (store.datasets.heartRate || []).filter((row) => {
    const t = new Date(row.timestamp).getTime();
    return Number.isFinite(t) && t >= window.start && t <= window.end;
  });

  return {
    dailySleep: pick(store.datasets.dailySleep),
    dailyReadiness: pick(store.datasets.dailyReadiness),
    dailyActivity: pick(store.datasets.dailyActivity),
    dailySpo2: pick(store.datasets.dailySpo2),
    derivedNightlyVitals: pick(store.derivedNightlyVitals),
    sleepTime: pick(store.datasets.sleepTime),
    heartRateWindowSummary: {
      points: hrRows.length,
      min: hrRows.length ? Math.min(...hrRows.map((r) => r.bpm)) : null,
      avg: hrRows.length ? hrRows.reduce((sum, row) => sum + row.bpm, 0) / hrRows.length : null,
      modeUsed: window.modeUsed
    }
  };
}

export function getRange(start, end) {
  const inRange = (r) => r.date >= start && r.date <= end;
  return {
    dailySleep: store.datasets.dailySleep.filter(inRange),
    dailyReadiness: store.datasets.dailyReadiness.filter(inRange),
    dailyActivity: store.datasets.dailyActivity.filter(inRange),
    dailySpo2: store.datasets.dailySpo2.filter(inRange),
    derivedNightlyVitals: store.derivedNightlyVitals.filter(inRange)
  };
}

export function getBaseline(metric, windowDays = 14, endDate) {
  const allDates = getAvailableDates();
  const end = endDate || allDates.at(-1);
  if (!end) return null;
  const start = allDates[Math.max(0, allDates.indexOf(end) - (windowDays - 1))] || end;
  const range = getRange(start, end);

  const lookup = {
    sleepScore: range.dailySleep,
    readinessScore: range.dailyReadiness,
    activityScore: range.dailyActivity,
    rhr_night_bpm: range.derivedNightlyVitals,
    hrv_rmssd_proxy_ms: range.derivedNightlyVitals,
    spo2Average: range.dailySpo2,
    temperatureDeviation: range.dailyReadiness
  };

  const rows = lookup[metric] || [];
  return median(rows.map((r) => r[metric]).filter((v) => v != null));
}

export function setUiSnapshot(snapshot) {
  store.uiSnapshot = snapshot;
  saveToLocalCache();
}

export function getStoreSnapshot() {
  return store;
}

export function getImportState() {
  return store.importState;
}

export function setImportError(error, context = {}) {
  store.importState = {
    ...store.importState,
    status: 'error',
    lastError: {
      message: error?.message || String(error),
      stack: error?.stack || null,
      ...context
    }
  };
  saveToLocalCache();
}