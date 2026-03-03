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
  ingestReport: {}
};

const byDate = (rows) => Object.fromEntries((rows || []).map((r) => [r.date, r]));

function parseCsv(text) {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data || [];
}

function normalizeRows(dataset, rows) {
  if (dataset === 'dailyReadiness') return rows.map((r) => ({ date: r.day ?? r.date, score: toNumber(r.score), temperatureDeviation: toNumber(r.temperature_deviation), contributors: parseContributors(r.contributors) })).filter((r) => r.date);
  if (dataset === 'dailySleep') return rows.map((r) => ({ date: r.day ?? r.date, score: toNumber(r.score) })).filter((r) => r.date);
  if (dataset === 'dailyActivity') return rows.map((r) => ({ date: r.day ?? r.date, score: toNumber(r.score), steps: toNumber(r.steps), activeCalories: toNumber(r.active_calories) })).filter((r) => r.date);
  if (dataset === 'dailySpo2') return rows.map((r) => ({ date: r.day ?? r.date, spo2Average: parseSpo2Average(r.spo2_percentage, r.average) })).filter((r) => r.date);
  if (dataset === 'sleepTime') return rows.map((r) => ({ date: r.day ?? r.date, bedtimeStart: r.bedtime_start, bedtimeEnd: r.bedtime_end })).filter((r) => r.date);
  if (dataset === 'heartRate') return rows.map((r) => ({ timestamp: r.timestamp, bpm: toNumber(r.bpm) })).filter((r) => r.timestamp && r.bpm != null);
  return [];
}

function deriveNightlyVitals(heartRate, sleepTime) {
  const bySleepDate = byDate(sleepTime);
  return Object.values(bySleepDate).map((sleepRow) => {
    const start = sleepRow.bedtimeStart ? new Date(sleepRow.bedtimeStart).getTime() : null;
    const end = sleepRow.bedtimeEnd ? new Date(sleepRow.bedtimeEnd).getTime() : null;
    const windowRows = (heartRate || []).filter((row) => {
      const t = new Date(row.timestamp).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && t >= start && t <= end;
    });
    const hr = windowRows.map((r) => r.bpm).filter((v) => v != null);
    const deltas = [];
    for (let i = 1; i < hr.length; i += 1) deltas.push(Math.abs(hr[i] - hr[i - 1]));
    return {
      date: sleepRow.date,
      rhr_night_bpm: hr.length ? Math.min(...hr) : null,
      hrv_rmssd_proxy_ms: deltas.length ? Math.sqrt(deltas.reduce((a, n) => a + (n ** 2), 0) / deltas.length) : null
    };
  });
}

export function loadFromLocalCache(storage = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    Object.assign(store, {
      datasets: { ...store.datasets, ...(parsed.datasets || {}) },
      derivedNightlyVitals: parsed.derivedNightlyVitals || [],
      ingestReport: parsed.ingestReport || {}
    });
  } catch {
    // noop
  }
  return store;
}

export function saveToLocalCache(storage = localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function importZip(file) {
  const zip = await JSZip.loadAsync(file);
  const found = {};
  const report = {};
  for (const entryName of Object.keys(zip.files)) {
    const short = normalizeName(entryName.split('/').pop());
    for (const [dataset, aliases] of Object.entries(DATASET_ALIASES)) {
      if (aliases.some((alias) => normalizeName(alias) === short)) {
        const text = await zip.files[entryName].async('string');
        found[dataset] = normalizeRows(dataset, parseCsv(text));
        report[dataset] = found[dataset].length;
      }
    }
  }
  store.datasets = { ...store.datasets, ...found };
  store.derivedNightlyVitals = deriveNightlyVitals(store.datasets.heartRate, store.datasets.sleepTime);
  store.ingestReport = report;
  saveToLocalCache();
  return report;
}

export function getAvailableDates() {
  const dates = [
    ...store.datasets.dailySleep.map((r) => r.date),
    ...store.datasets.dailyReadiness.map((r) => r.date),
    ...store.datasets.dailyActivity.map((r) => r.date)
  ].filter(Boolean);
  return [...new Set(dates)].sort();
}

export function getDay(date) {
  const pick = (rows) => rows.find((r) => r.date === date) || null;
  return {
    dailySleep: pick(store.datasets.dailySleep),
    dailyReadiness: pick(store.datasets.dailyReadiness),
    dailyActivity: pick(store.datasets.dailyActivity),
    dailySpo2: pick(store.datasets.dailySpo2),
    derivedNightlyVitals: pick(store.derivedNightlyVitals),
    sleepTime: pick(store.datasets.sleepTime),
    heartRateWindowSummary: null
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

export function getBaseline(rows, key) {
  return median(rows.map((r) => r[key]).filter((v) => v != null));
}

export function getStoreSnapshot() {
  return store;
}
