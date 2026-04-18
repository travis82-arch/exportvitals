import { normalizeName, parseContributors, parseSpo2Average, toNumber, median, sniffDelimiter, stripBom } from '../vitals-core.mjs';
import JSZip from 'jszip';
import Papa from 'papaparse';

const LEGACY_STORAGE_KEY = 'ouraDerivedMetricsV3';
const META_STORAGE_KEY = 'ouraDerivedMetricsMetaV1';
const DB_NAME = 'ouraDerivedMetricsDbV1';
const DB_VERSION = 1;
const STORE_NAME = 'largeState';
const STORE_ID = 'latest';

const DATASET_ALIASES = {
  dailyReadiness: ['dailyreadiness.csv'],
  dailySleep: ['dailysleep.csv'],
  dailyActivity: ['dailyactivity.csv'],
  dailyStress: ['dailystress.csv'],
  daytimeStress: ['daytimestress.csv'],
  dailySpo2: ['dailyspo2.csv'],
  sleepTime: ['sleeptime.csv'],
  heartRate: ['heartrate.csv'],
  sleepModel: ['sleepmodel.csv'],
  workout: ['workout.csv', 'workouts.csv'],
  session: ['session.csv', 'sessions.csv']
};

const store = {
  datasets: {
    dailyReadiness: [],
    dailySleep: [],
    dailyActivity: [],
    dailyStress: [],
    daytimeStress: [],
    dailySpo2: [],
    sleepTime: [],
    heartRate: [],
    sleepModel: [],
    workout: [],
    session: []
  },
  derivedNightlyVitals: [],
  ingestReport: {},
  availabilityMatrix: {},
  uiSnapshot: {},
  importState: { status: 'idle', phase: 'Idle', percent: 0, lastResult: null, lastError: null, lastSuccessAt: null },
  storageState: {
    backend: 'indexeddb',
    largeState: { ok: false, readable: false, rowCounts: {}, updatedAt: null, error: null }
  }
};
const listeners = new Set();

const byDate = (rows) => Object.fromEntries((rows || []).map((r) => [r.date, r]));
const secondsToMinutes = (value) => {
  const numeric = toNumber(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric / 60;
};
const toLocalDateKey = (timestamp) => {
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) return null;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

function parseCsv(text) {
  const clean = stripBom(text);
  const { delimiter } = sniffDelimiter(clean);
  const { data } = Papa.parse(clean, { header: true, skipEmptyLines: true, delimiter });
  return data || [];
}

function pickRowValue(row, aliases = []) {
  if (!row || typeof row !== 'object') return null;
  const direct = aliases.map((key) => row[key]).find((value) => value != null && String(value).trim() !== '');
  if (direct != null && String(direct).trim() !== '') return direct;
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeName(key), value]));
  for (const alias of aliases) {
    const candidate = normalized.get(normalizeName(alias));
    if (candidate != null && String(candidate).trim() !== '') return candidate;
  }
  return null;
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

  if (dataset === 'dailyStress')
    return rows
      .map((r) => ({
        date: pickRowValue(r, ['day', 'date']),
        score: toNumber(pickRowValue(r, ['score', 'stress_score', 'daily_stress_score', 'stress'])),
        high: (() => {
          const minuteField = pickRowValue(r, ['high', 'high_stress_duration', 'high_stress_duration_min', 'high_stress_duration_minutes']);
          if (minuteField != null) return toNumber(minuteField);
          const secondsField = pickRowValue(r, ['stress_high', 'high_stress_duration_seconds']);
          return secondsToMinutes(secondsField);
        })(),
        medium: toNumber(pickRowValue(r, ['medium', 'medium_stress_duration', 'medium_stress_duration_min', 'medium_stress_duration_minutes'])),
        low: toNumber(pickRowValue(r, ['low', 'low_stress_duration', 'low_stress_duration_min', 'low_stress_duration_minutes'])),
        recovery: (() => {
          const minuteField = pickRowValue(r, ['recovery', 'restorative_time', 'restored_duration', 'restoration_duration', 'restorative_duration']);
          if (minuteField != null) return toNumber(minuteField);
          const secondsField = pickRowValue(r, ['recovery_high', 'restorative_duration_seconds']);
          return secondsToMinutes(secondsField);
        })(),
        daySummary: pickRowValue(r, ['day_summary', 'summary', 'state'])
      }))
      .filter((r) => r.date);

  if (dataset === 'daytimeStress')
    return rows
      .map((r) => {
        const timestamp = pickRowValue(r, ['timestamp', 'datetime', 'time', 'start_time']);
        const score = toNumber(pickRowValue(r, ['stress_score', 'score', 'level', 'stress_level', 'stress_value']));
        const recoveryValue = toNumber(pickRowValue(r, ['recovery_value', 'restored_value', 'recovery_score']));
        const dateRaw = pickRowValue(r, ['day', 'date']);
        const date = dateRaw ?? toLocalDateKey(timestamp);
        return {
          date,
          timestamp,
          score,
          recoveryValue,
          category: pickRowValue(r, ['category', 'stress_category', 'state', 'stress_state'])
        };
      })
      .filter((r) => r.date && (r.timestamp || Number.isFinite(r.score) || Number.isFinite(r.recoveryValue)));

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
        highestHeartRate: toNumber(r.highest_heart_rate),
        avgHeartRate: toNumber(r.average_heart_rate),
        avgHrv: toNumber(r.average_hrv),
        avgBreath: toNumber(r.average_breath),
        stage30s: typeof r.sleep_phase_30_sec === 'string' ? r.sleep_phase_30_sec : '',
        movement30s: typeof r.movement_30_sec === 'string' ? r.movement_30_sec : '',
        hrJson: r.heart_rate,
        hrvJson: r.hrv
      }))
      .filter((r) => r.date);

  if (dataset === 'workout')
    return rows
      .map((r) => {
        const startTs = r.start_datetime || r.start_time || r.start || r.timestamp;
        const endTs = r.end_datetime || r.end_time || r.end;
        const date = r.day ?? r.date ?? (startTs ? new Date(startTs).toISOString().slice(0, 10) : null);
        return {
          date,
          source: 'workout',
          type: r.activity || r.workout_type || r.type || 'Workout',
          startTime: startTs || null,
          endTime: endTs || null,
          durationSec: toNumber(r.duration) ?? toNumber(r.duration_seconds),
          calories: toNumber(r.calories) ?? toNumber(r.active_kilocalories),
          avgHr: toNumber(r.average_heart_rate) ?? toNumber(r.avg_hr)
        };
      })
      .filter((r) => r.date);

  if (dataset === 'session')
    return rows
      .map((r) => {
        const startTs = r.start_datetime || r.start_time || r.timestamp || null;
        const endTs = r.end_datetime || r.end_time || null;
        const date = r.day ?? r.date ?? (startTs ? new Date(startTs).toISOString().slice(0, 10) : null);
        return {
          date,
          source: 'session',
          type: r.type || r.session_type || 'Session',
          startTime: startTs,
          endTime: endTs,
          durationSec: toNumber(r.duration) ?? toNumber(r.duration_seconds),
          calories: toNumber(r.calories),
          avgHr: toNumber(r.average_heart_rate) ?? toNumber(r.avg_hr)
        };
      })
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
  const sleepModelRow = store.datasets.sleepModel.find((row) => row.date === date);

  const fromSleepWindow = (startIso, endIso, modeUsed) => {
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { start, end, modeUsed };
  };

  const fallbackLocalWindow = () => {
    const start = new Date(`${date}T${fallbackStart}:00`).getTime();
    const end = new Date(`${date}T${fallbackEnd}:00`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { start, end: end < start ? end + 24 * 60 * 60 * 1000 : end, modeUsed: 'settings' };
  };

  const fallbackUtcWindow = () => {
    const [startHour = '21', startMinute = '00'] = String(fallbackStart).split(':');
    const [endHour = '09', endMinute = '00'] = String(fallbackEnd).split(':');
    const base = new Date(`${date}T00:00:00Z`);
    const start = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(startHour), Number(startMinute), 0);
    const endRaw = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), Number(endHour), Number(endMinute), 0);
    return { start, end: endRaw < start ? endRaw + 24 * 60 * 60 * 1000 : endRaw, modeUsed: 'settings-utc' };
  };
  const fullDayWindow = () => {
    const start = new Date(`${date}T00:00:00`).getTime();
    const end = new Date(`${date}T23:59:59`).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    return { start, end, modeUsed: 'date-day' };
  };

  const windowPointCount = (window) => (store.datasets.heartRate || []).reduce((count, row) => {
    const t = new Date(row.timestamp).getTime();
    return Number.isFinite(t) && t >= window.start && t <= window.end ? count + 1 : count;
  }, 0);

  if ((mode === 'auto' || mode === 'sleep-time') && sleepRow?.bedtimeStart && sleepRow?.bedtimeEnd) {
    const window = fromSleepWindow(sleepRow.bedtimeStart, sleepRow.bedtimeEnd, 'sleepTime');
    if (window) return window;
  }

  if ((mode === 'auto' || mode === 'sleep-model') && sleepModelRow?.bedtimeStart && sleepModelRow?.bedtimeEnd) {
    const window = fromSleepWindow(sleepModelRow.bedtimeStart, sleepModelRow.bedtimeEnd, 'sleepModel');
    if (window) return window;
  }

  const fallbackLocal = fallbackLocalWindow();
  if (mode !== 'auto') return fallbackLocal || fallbackUtcWindow();

  const candidates = [
    fallbackLocal,
    fallbackUtcWindow(),
    fullDayWindow()
  ].filter(Boolean);

  if (!candidates.length) return { start: 0, end: 0, modeUsed: 'invalid' };
  let best = candidates[0];
  let bestCount = windowPointCount(best);
  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const count = windowPointCount(candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
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
    dailyStress: has('dailyStress'),
    daytimeStress: has('daytimeStress'),
    dailySpo2: has('dailySpo2'),
    heartRate: has('heartRate'),
    sleepTime: has('sleepTime'),
    sleepModel: has('sleepModel'),
    workout: has('workout'),
    session: has('session')
  };
  return store.availabilityMatrix;
}

function updateImportState(next, onProgress) {
  store.importState = { ...store.importState, ...next };
  emitStoreChange();
  if (onProgress) onProgress(store.importState);
}

function emitStoreChange() {
  for (const listener of listeners) {
    try {
      listener(getStoreSnapshot());
    } catch {
      // noop listener isolation
    }
  }
}

function getDateRangeFromDatasets(datasets) {
  const dates = Object.values(datasets)
    .flatMap((rows) => rows.map((row) => row.date).filter(Boolean))
    .sort();
  if (!dates.length) return { start: null, end: null, days: 0 };
  const unique = [...new Set(dates)];
  return { start: unique[0], end: unique.at(-1), days: unique.length };
}

function getStorage(storage) {
  if (storage) return storage;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function getIndexedDb(indexedDb) {
  if (indexedDb) return indexedDb;
  return typeof indexedDB !== 'undefined' ? indexedDB : null;
}

function largeStatePayload() {
  return {
    datasets: store.datasets,
    derivedNightlyVitals: store.derivedNightlyVitals,
    ingestReport: store.ingestReport,
    availabilityMatrix: store.availabilityMatrix,
    uiSnapshot: store.uiSnapshot
  };
}

function applyLargeState(payload = {}) {
  Object.assign(store, {
    datasets: { ...store.datasets, ...(payload.datasets || {}) },
    derivedNightlyVitals: payload.derivedNightlyVitals || [],
    ingestReport: payload.ingestReport || {},
    availabilityMatrix: payload.availabilityMatrix || {},
    uiSnapshot: payload.uiSnapshot || {}
  });
  if (!payload.availabilityMatrix || !Object.keys(payload.availabilityMatrix).length) {
    computeAvailabilityMatrix();
  }
}

function metaStatePayload() {
  return {
    importState: store.importState,
    storageState: store.storageState
  };
}

function openDb(indexedDb = getIndexedDb()) {
  if (!indexedDb?.open) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
    request.onsuccess = () => resolve(request.result);
  });
}

function idbPut(db, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const storeRef = tx.objectStore(STORE_NAME);
    storeRef.put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Failed to write IndexedDB.'));
  });
}

function idbGet(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const storeRef = tx.objectStore(STORE_NAME);
    const request = storeRef.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Failed to read IndexedDB.'));
  });
}

function saveMetaToLocalStorage(storage = getStorage()) {
  if (!storage?.setItem) return;
  storage.setItem(META_STORAGE_KEY, JSON.stringify(metaStatePayload()));
}

async function saveLargeToIndexedDb(indexedDb = getIndexedDb()) {
  if (!indexedDb?.open) {
    store.storageState = {
      ...store.storageState,
      backend: 'indexeddb-unavailable',
      largeState: {
        ok: false,
        readable: false,
        rowCounts: store.ingestReport?.rowCounts || {},
        updatedAt: null,
        error: 'IndexedDB unavailable in this environment'
      }
    };
    return false;
  }
  const db = await openDb(indexedDb);
  try {
    const updatedAt = new Date().toISOString();
    await idbPut(db, { id: STORE_ID, updatedAt, payload: largeStatePayload() });
    store.storageState = {
      ...store.storageState,
      backend: 'indexeddb',
      largeState: {
        ok: true,
        readable: true,
        rowCounts: store.ingestReport?.rowCounts || {},
        updatedAt,
        error: null
      }
    };
    return true;
  } finally {
    db?.close?.();
  }
}

async function loadLargeFromIndexedDb(indexedDb = getIndexedDb()) {
  if (!indexedDb?.open) {
    store.storageState = {
      ...store.storageState,
      backend: 'indexeddb-unavailable',
      largeState: { ok: false, readable: false, rowCounts: {}, updatedAt: null, error: 'IndexedDB unavailable in this environment' }
    };
    return false;
  }
  const db = await openDb(indexedDb);
  try {
    const record = await idbGet(db, STORE_ID);
    if (!record?.payload) {
      store.storageState = {
        ...store.storageState,
        backend: 'indexeddb',
        largeState: { ok: false, readable: false, rowCounts: {}, updatedAt: null, error: null }
      };
      return false;
    }
    applyLargeState(record.payload);
    store.storageState = {
      ...store.storageState,
      backend: 'indexeddb',
      largeState: {
        ok: true,
        readable: true,
        rowCounts: record.payload?.ingestReport?.rowCounts || {},
        updatedAt: record.updatedAt || null,
        error: null
      }
    };
    return true;
  } finally {
    db?.close?.();
  }
}

export function loadFromLocalCache(storage = getStorage()) {
  if (!storage?.getItem) return store;
  try {
    const parsed = JSON.parse(storage.getItem(META_STORAGE_KEY) || '{}');
    Object.assign(store, {
      importState: { ...store.importState, ...(parsed.importState || {}) },
      storageState: { ...store.storageState, ...(parsed.storageState || {}) }
    });
  } catch {
    // noop
  }
  if (store.importState?.status === 'success' && !store.ingestReport?.dateRange?.end) {
    store.importState = { ...store.importState, status: 'idle', lastResult: null };
  }

  if (!store.ingestReport?.dateRange?.end) {
    try {
      const legacyParsed = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY) || '{}');
      if (legacyParsed?.datasets) {
        applyLargeState(legacyParsed);
        store.storageState = {
          ...store.storageState,
          backend: 'localstorage-legacy',
          largeState: {
            ok: true,
            readable: true,
            rowCounts: legacyParsed?.ingestReport?.rowCounts || {},
            updatedAt: null,
            error: null
          }
        };
      }
    } catch {
      // noop
    }
  }
  return store;
}

export async function hydrateFromPersistence({ storage = getStorage(), indexedDb = getIndexedDb() } = {}) {
  loadFromLocalCache(storage);
  try {
    await loadLargeFromIndexedDb(indexedDb);
  } catch (error) {
    store.storageState = {
      ...store.storageState,
      backend: 'indexeddb',
      largeState: { ok: false, readable: false, rowCounts: {}, updatedAt: null, error: error?.message || String(error) }
    };
  }
  saveMetaToLocalStorage(storage);
  emitStoreChange();
  return store;
}

export function saveToLocalCache(storage = getStorage()) {
  saveMetaToLocalStorage(storage);
}

export async function importZipArrayBuffer({ fileName, arrayBuffer, options = {}, onProgress } = {}) {
  if (!arrayBuffer || !String(fileName || '').toLowerCase().endsWith('.zip')) {
    throw new Error('Please choose a valid .zip export file from Oura.');
  }

  updateImportState({ status: 'loading', phase: 'Reading ZIP', percent: 5, lastError: null }, onProgress);
  try {
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
      lastError: null,
      lastSuccessAt: new Date().toISOString()
    };

    await saveLargeToIndexedDb();
    saveMetaToLocalStorage();
    emitStoreChange();
    if (onProgress) onProgress(store.importState);
    return store.ingestReport;
  } catch (error) {
    store.importState = {
      ...store.importState,
      status: 'error',
      phase: 'Failed',
      lastError: { message: error?.message || String(error), stack: error?.stack || null }
    };
    saveMetaToLocalStorage();
    emitStoreChange();
    if (onProgress) onProgress(store.importState);
    throw error;
  }
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
    ...store.datasets.dailyStress.map((r) => r.date),
    ...store.datasets.daytimeStress.map((r) => r.date),
    ...store.datasets.dailySpo2.map((r) => r.date),
    ...store.datasets.sleepTime.map((r) => r.date)
    ,...store.datasets.sleepModel.map((r) => r.date),
    ...store.datasets.workout.map((r) => r.date),
    ...store.datasets.session.map((r) => r.date)
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
  const hrMax = sortedHr.length ? Math.max(...sortedHr.map((row) => row.bpm)) : null;
  const hrAvg = sortedHr.length ? sortedHr.reduce((sum, row) => sum + row.bpm, 0) / sortedHr.length : null;
  const dayStart = new Date(`${date}T06:00:00`).getTime();
  const dayEnd = new Date(`${date}T23:59:59`).getTime();
  const daytimeHr = (store.datasets.heartRate || [])
    .map((row) => ({ t: new Date(row.timestamp).getTime(), bpm: row.bpm }))
    .filter((row) => Number.isFinite(row.t) && row.t >= dayStart && row.t <= dayEnd && Number.isFinite(Number(row.bpm)))
    .map((row) => Number(row.bpm));
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
    dailyStress: pick(store.datasets.dailyStress),
    dailySpo2: pick(store.datasets.dailySpo2),
    sleepModel,
    sleepHrSeries,
    sleepHrvSeries,
    sleepStages,
    sleepMovement,
    activityClassSeries,
    activities: [...store.datasets.workout.filter((r) => r.date === date), ...store.datasets.session.filter((r) => r.date === date)]
      .sort((a, b) => new Date(b.startTime || `${b.date}T00:00:00`).getTime() - new Date(a.startTime || `${a.date}T00:00:00`).getTime()),
    derivedNightlyVitals: pick(store.derivedNightlyVitals),
    sleepTime: pick(store.datasets.sleepTime),
    heartRateWindowSummary: {
      points: hrRows.length,
      min: hrMin,
      max: hrMax,
      avg: hrAvg,
      modeUsed: window.modeUsed
    },
    daytimeHeartRateSummary: {
      points: daytimeHr.length,
      min: daytimeHr.length ? Math.min(...daytimeHr) : null,
      max: daytimeHr.length ? Math.max(...daytimeHr) : null,
      avg: daytimeHr.length ? daytimeHr.reduce((sum, value) => sum + value, 0) / daytimeHr.length : null
    },
    heartRateSeries,
    hrSeries: heartRateSeries,
    hrMin,
    hrAvg
  };
}

export function getRange(start, end) {
  const inRange = (r) => r.date >= start && r.date <= end;
  const heartRateInRange = (store.datasets.heartRate || []).filter((row) => {
    const t = new Date(row.timestamp).getTime();
    if (!Number.isFinite(t)) return false;
    const date = new Date(t).toISOString().slice(0, 10);
    return date >= start && date <= end;
  });
  const heartRatePointRows = heartRateInRange.map((row) => ({
    ...row,
    pointCount: Number.isFinite(Number(row.bpm)) ? 1 : 0
  }));
  const daytimeByDate = new Map();
  for (const row of heartRatePointRows) {
    const t = new Date(row.timestamp).getTime();
    const hour = new Date(t).getUTCHours();
    if (hour < 6 || hour > 23) continue;
    const date = new Date(t).toISOString().slice(0, 10);
    const bucket = daytimeByDate.get(date) || { date, values: [] };
    const bpm = Number(row.bpm);
    if (Number.isFinite(bpm)) bucket.values.push(bpm);
    daytimeByDate.set(date, bucket);
  }
  const daytimeHeartRate = [...daytimeByDate.values()].map((bucket) => ({
    date: bucket.date,
    min: bucket.values.length ? Math.min(...bucket.values) : null,
    avg: bucket.values.length ? bucket.values.reduce((sum, value) => sum + value, 0) / bucket.values.length : null,
    max: bucket.values.length ? Math.max(...bucket.values) : null
  }));
  return {
    dailySleep: store.datasets.dailySleep.filter(inRange),
    dailyReadiness: store.datasets.dailyReadiness.filter(inRange),
    dailyActivity: store.datasets.dailyActivity.filter(inRange),
    dailyStress: store.datasets.dailyStress.filter(inRange),
    daytimeStress: store.datasets.daytimeStress.filter(inRange),
    dailySpo2: store.datasets.dailySpo2.filter(inRange),
    sleepModel: store.datasets.sleepModel.filter(inRange),
    workout: store.datasets.workout.filter(inRange),
    session: store.datasets.session.filter(inRange),
    heartRate: heartRatePointRows,
    daytimeHeartRate,
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
  saveMetaToLocalStorage();
  emitStoreChange();
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
  saveMetaToLocalStorage();
  emitStoreChange();
}

export function subscribeToStore(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}
