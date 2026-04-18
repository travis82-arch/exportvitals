import { normalizeName, parseContributors, parseSpo2Average, toNumber, median, sniffDelimiter, stripBom } from '../vitals-core.mjs';
import JSZip from 'jszip';
import Papa from 'papaparse';

const STORAGE_KEY = 'ouraDerivedMetricsV3';

const DATASET_ALIASES = {
  dailyReadiness: ['dailyreadiness.csv'],
  dailySleep: ['dailysleep.csv'],
  dailyActivity: ['dailyactivity.csv'],
  dailySpo2: ['dailyspo2.csv'],
  sleepTime: ['sleeptime.csv'],
  heartRate: ['heartrate.csv'],
  sleepModel: ['sleepmodel.csv']
};

const store = {
  datasets: { dailyReadiness: [], dailySleep: [], dailyActivity: [], dailySpo2: [], sleepTime: [], heartRate: [], sleepModel: [] },
  derivedNightlyVitals: [],
  ingestReport: {},
  availabilityMatrix: {},
  uiSnapshot: {},
  importState: { status: 'idle', phase: 'Idle', percent: 0, lastResult: null, lastError: null }
};

const byDate = (rows) => Object.fromEntries((rows || []).map((r) => [r.date, r]));

function parseCsv(text) {
  const clean = stripBom(text);
  const { delimiter } = sniffDelimiter(clean);
  const { data } = Papa.parse(clean, { header: true, skipEmptyLines: true, delimiter });
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
        activeCalories: toNumber(r.active_calories),
        totalCalories: toNumber(r.total_calories),
        targetCalories: toNumber(r.target_calories),
        mediumActivityTime: toNumber(r.medium_activity_time),
        highActivityTime: toNumber(r.high_activity_time),
        lowActivityTime: toNumber(r.low_activity_time),
        sedentaryTime: toNumber(r.sedentary_time),
        inactivityAlerts: toNumber(r.inactivity_alerts),
        metersToTarget: toNumber(r.meters_to_target),
        class5Min: typeof r.class_5_min === 'string' ? r.class_5_min : '',
        contributors: parseContributors(r.contributors)
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

  if (dataset === 'sleepModel')
    return rows
      .map((r) => ({
        date: r.day,
        bedtimeStart: r.bedtime_start,
        bedtimeEnd: r.bedtime_end,
        totalSleepSec: toNumber(r.total_sleep_duration),
        timeInBedSec: toNumber(r.time_in_bed),
        efficiencyPct: toNumber(r.efficiency),
        latencySec: toNumber(r.latency),
        awakeSec: toNumber(r.awake_time),
        deepSec: toNumber(r.deep_sleep_duration),
        lightSec: toNumber(r.light_sleep_duration),
        remSec: toNumber(r.rem_sleep_duration),
        lowestHeartRate: toNumber(r.lowest_heart_rate),
        avgHeartRate: toNumber(r.average_heart_rate),
        avgHrv: toNumber(r.average_hrv),
        avgBreath: toNumber(r.average_breath),
        stage30s: typeof r.sleep_phase_30_sec === 'string' ? r.sleep_phase_30_sec : '',
        movement30s: typeof r.movement_30_sec === 'string' ? r.movement_30_sec : '',
        hrJson: r.heart_rate,
        hrvJson: r.hrv
      }))
      .filter((r) => r.date);

  return [];
}

export function parseSeriesJson(jsonString) {
  if (!jsonString) return null;
  try {
    const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
    const start = parsed?.timestamp ?? parsed?.start_time ?? parsed?.start;
    const startMs = Number.isFinite(new Date(start).getTime()) ? new Date(start).getTime() : toNumber(parsed?.start_ms);
    const intervalSec = toNumber(parsed?.interval ?? parsed?.interval_seconds ?? parsed?.interval_sec);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    if (!Number.isFinite(startMs) || !Number.isFinite(intervalSec) || !items.length) return null;
    return { startMs, intervalSec, items };
  } catch {
    return null;
  }
}

export function seriesToPoints(series, maxPoints = 360) {
  const startMs = series?.startMs;
  const intervalSec = series?.intervalSec;
  const items = series?.items;
  const safeItems = Array.isArray(items) ? items : [];
  if (!Number.isFinite(startMs) || !Number.isFinite(intervalSec) || !safeItems.length) return [];
  const full = safeItems.map((item, index) => {
    const numeric = toNumber(item);
    return { tMs: startMs + index * intervalSec * 1000, v: Number.isFinite(numeric) ? numeric : null };
  });
  if (full.length <= maxPoints) return full;
  const stride = Math.ceil(full.length / maxPoints);
  return full.filter((_, idx) => idx % stride === 0 || idx === full.length - 1);
}

export function inferSleepStageDigitMap(row) {
  const phase = typeof row?.stage30s === 'string' ? row.stage30s : '';
  if (!phase) return null;
  const durationTargets = {
    Awake: Number(row?.awakeSec) || 0,
    Deep: Number(row?.deepSec) || 0,
    Light: Number(row?.lightSec) || 0,
    REM: Number(row?.remSec) || 0
  };
  const digits = [...new Set(phase.split('').filter((d) => /\d/.test(d)))];
  if (!digits.length) return null;
  const counts = Object.fromEntries(digits.map((d) => [d, 0]));
  for (const ch of phase) if (counts[ch] != null) counts[ch] += 1;
  const stages = ['Awake', 'Deep', 'Light', 'REM'];
  const candidates = [];
  const assign = (idx, available, mapping) => {
    if (idx >= digits.length) {
      candidates.push({ ...mapping });
      return;
    }
    const d = digits[idx];
    for (let i = 0; i < available.length; i += 1) {
      mapping[d] = available[i];
      assign(idx + 1, [...available.slice(0, i), ...available.slice(i + 1)], mapping);
      delete mapping[d];
    }
  };
  assign(0, stages, {});

  let best = null;
  let bestErr = Number.POSITIVE_INFINITY;
  for (const mapping of candidates) {
    const predicted = { Awake: 0, Deep: 0, Light: 0, REM: 0 };
    for (const d of digits) predicted[mapping[d]] += counts[d] * 30;
    const err = stages.reduce((sum, st) => sum + Math.abs((predicted[st] || 0) - (durationTargets[st] || 0)), 0);
    if (err < bestErr) {
      bestErr = err;
      best = mapping;
    }
  }
  return best;
}

export function decodeStages(row) {
  const origin = row?.bedtimeStart ? new Date(row.bedtimeStart).getTime() : null;
  const phase = typeof row?.stage30s === 'string' ? row.stage30s : '';
  const mapping = inferSleepStageDigitMap(row);
  if (!Number.isFinite(origin) || !phase || !mapping) return [];
  const segments = [];
  let segStart = 0;
  let prev = phase[0];
  for (let i = 1; i <= phase.length; i += 1) {
    const code = phase[i];
    if (i === phase.length || code !== prev) {
      const stage = mapping[prev];
      if (stage) {
        segments.push({ startMs: origin + segStart * 30000, endMs: origin + i * 30000, stage });
      }
      segStart = i;
      prev = code;
    }
  }
  return segments;
}

export function decodeClass5Min(class5Min, dayDate) {
  if (typeof class5Min !== 'string' || !class5Min.length || !dayDate) return [];
  const startMs = new Date(`${dayDate}T00:00:00`).getTime();
  if (!Number.isFinite(startMs)) return [];
  return class5Min.split('').map((ch, idx) => {
    const d = Number(ch);
    let level = 0;
    if (d === 0) level = 0;
    else if (d <= 1) level = 1;
    else if (d <= 3) level = 2;
    else if (d <= 5) level = 3;
    return { tMs: startMs + idx * 5 * 60 * 1000, level };
  });
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
    sleepTime: has('sleepTime'),
    sleepModel: has('sleepModel')
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

export function loadFromLocalCache(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.getItem) return store;
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
    if (!parsed.availabilityMatrix || !Object.keys(parsed.availabilityMatrix).length) {
      computeAvailabilityMatrix();
    }
  } catch {
    // noop
  }
  return store;
}

export function saveToLocalCache(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.setItem) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export async function importZipArrayBuffer({ fileName, arrayBuffer, options = {}, onProgress } = {}) {
  if (!arrayBuffer || !String(fileName || '').toLowerCase().endsWith('.zip')) {
    throw new Error('Please choose a valid .zip export file from Oura.');
  }

  updateImportState({ status: 'importing', phase: 'Reading ZIP', percent: 5, lastError: null }, onProgress);

  const zip = await JSZip.loadAsync(arrayBuffer);
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
  store.datasets = Object.fromEntries(Object.keys(store.datasets).map((name) => [name, found[name] || []]));

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

export async function importZip(file, options = {}, onProgress) {
  if (!file || !String(file.name || '').toLowerCase().endsWith('.zip') || typeof file.arrayBuffer !== 'function') {
    throw new Error('Please choose a valid .zip export file from Oura.');
  }
  const arrayBuffer = await file.arrayBuffer();
  return importZipArrayBuffer({ fileName: file.name, arrayBuffer, options, onProgress });
}

export function getAvailableDates() {
  const dates = [
    ...store.datasets.dailySleep.map((r) => r.date),
    ...store.datasets.dailyReadiness.map((r) => r.date),
    ...store.datasets.dailyActivity.map((r) => r.date),
    ...store.datasets.dailySpo2.map((r) => r.date),
    ...store.datasets.sleepTime.map((r) => r.date)
    ,...store.datasets.sleepModel.map((r) => r.date)
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
  const sortedHr = hrRows
    .map((row) => ({ t: new Date(row.timestamp).getTime(), bpm: row.bpm }))
    .filter((row) => Number.isFinite(row.t) && row.bpm != null)
    .sort((a, b) => a.t - b.t);
  const maxPoints = 240;
  const step = Math.max(1, Math.ceil(sortedHr.length / maxPoints));
  const heartRateSeries = sortedHr
    .filter((_, index) => index % step === 0)
    .map((row) => ({ t: row.t, bpm: row.bpm }));
  const hrMin = sortedHr.length ? Math.min(...sortedHr.map((row) => row.bpm)) : null;
  const hrAvg = sortedHr.length ? sortedHr.reduce((sum, row) => sum + row.bpm, 0) / sortedHr.length : null;
  const sleepModel = pick(store.datasets.sleepModel);
  const hrParsed = parseSeriesJson(sleepModel?.hrJson);
  const hrvParsed = parseSeriesJson(sleepModel?.hrvJson);
  const sleepHrSeries = seriesToPoints(hrParsed);
  const sleepHrvSeries = seriesToPoints(hrvParsed);
  const sleepStages = decodeStages(sleepModel);
  const stageOrigin = sleepModel?.bedtimeStart ? new Date(sleepModel.bedtimeStart).getTime() : null;
  const sleepMovement = [];
  if (sleepModel?.movement30s && Number.isFinite(stageOrigin)) {
    for (let i = 0; i < sleepModel.movement30s.length; i += 1) {
      const v = toNumber(sleepModel.movement30s[i]);
      sleepMovement.push({ tMs: stageOrigin + i * 30000, v: Number.isFinite(v) ? v : null });
    }
  }
  const activityClassSeries = decodeClass5Min(pick(store.datasets.dailyActivity)?.class5Min, date);

  return {
    dailySleep: pick(store.datasets.dailySleep),
    dailyReadiness: pick(store.datasets.dailyReadiness),
    dailyActivity: pick(store.datasets.dailyActivity),
    dailySpo2: pick(store.datasets.dailySpo2),
    sleepModel,
    sleepHrSeries,
    sleepHrvSeries,
    sleepStages,
    sleepMovement,
    activityClassSeries,
    derivedNightlyVitals: pick(store.derivedNightlyVitals),
    sleepTime: pick(store.datasets.sleepTime),
    heartRateWindowSummary: {
      points: hrRows.length,
      min: hrMin,
      avg: hrAvg,
      modeUsed: window.modeUsed
    },
    heartRateSeries,
    hrSeries: heartRateSeries,
    hrMin,
    hrAvg
  };
}

export function getRange(start, end) {
  const inRange = (r) => r.date >= start && r.date <= end;
  return {
    dailySleep: store.datasets.dailySleep.filter(inRange),
    dailyReadiness: store.datasets.dailyReadiness.filter(inRange),
    dailyActivity: store.datasets.dailyActivity.filter(inRange),
    dailySpo2: store.datasets.dailySpo2.filter(inRange),
    sleepModel: store.datasets.sleepModel.filter(inRange),
    derivedNightlyVitals: store.derivedNightlyVitals.filter(inRange)
  };
}

export function getBaseline(metric, windowDays = 14, endDate) {
  const allDates = getAvailableDates();
  const end = endDate || allDates.at(-1);
  if (!end) return null;
  const start = allDates[Math.max(0, allDates.indexOf(end) - (windowDays - 1))] || end;
  const range = getRange(start, end);

  const metricMap = {
    sleepScore: { rows: range.dailySleep, field: 'score' },
    readinessScore: { rows: range.dailyReadiness, field: 'score' },
    activityScore: { rows: range.dailyActivity, field: 'score' },
    rhr_night_bpm: { rows: range.derivedNightlyVitals, field: 'rhr_night_bpm' },
    hrv_rmssd_proxy_ms: { rows: range.derivedNightlyVitals, field: 'hrv_rmssd_proxy_ms' },
    spo2Average: { rows: range.dailySpo2, field: 'spo2Average' },
    temperatureDeviation: { rows: range.dailyReadiness, field: 'temperatureDeviation' }
  };

  const mapped = metricMap[metric];
  if (!mapped) return null;
  return median((mapped.rows || []).map((row) => row[mapped.field]).filter((v) => v != null));
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
