import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { importZipArrayBuffer, getAvailableDates, getDay, getRange, getStoreSnapshot, hydrateFromPersistence } from '../src/store/dataStore.js';
import { resolveSelectedRange } from '../src/state/selectedRange.js';
import { shouldRenderDateRangeForPage, shouldRenderIntroBanner } from '../src/state/pageConfig.js';
import { runSettingsUploadImport } from '../src/state/importFlow.js';

async function buildZip(nameToCsv) {
  const zip = new JSZip();
  for (const [name, csv] of Object.entries(nameToCsv)) zip.file(name, csv);
  return zip.generateAsync({ type: 'arraybuffer' });
}

function createMemoryStorage() {
  const data = new Map();
  const writes = [];
  return {
    writes,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => {
      writes.push({ key, value });
      data.set(key, String(value));
    },
    removeItem: (key) => data.delete(key)
  };
}

function createFakeIndexedDb() {
  const records = new Map();
  return {
    open() {
      const request = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => {},
          transaction: (_storeName, mode) => {
            const tx = { oncomplete: null, onerror: null, error: null };
            const objectStore = {
              put(value) {
                records.set(value.id, structuredClone(value));
                queueMicrotask(() => tx.oncomplete?.());
              },
              get(id) {
                const getRequest = { result: null, error: null, onsuccess: null, onerror: null };
                queueMicrotask(() => {
                  getRequest.result = records.get(id) || null;
                  getRequest.onsuccess?.();
                });
                return getRequest;
              }
            };
            tx.objectStore = () => objectStore;
            tx.mode = mode;
            return tx;
          },
          close: () => {}
        };
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test('successful upload updates active state and latest day is renderable', async () => {
  const firstZip = await buildZip({
    'daily_readiness.csv': 'day,score,temperature_deviation,contributors\n2026-01-01,82,0.1,"{""resting_heart_rate"":80}"\n2026-01-02,88,0.0,"{""resting_heart_rate"":85}"',
    'daily_sleep.csv': 'day,score,contributors\n2026-01-01,77,"{""efficiency"":70}"\n2026-01-02,83,"{""efficiency"":78}"',
    'sleep_model.csv': 'day,total_sleep_duration,time_in_bed,efficiency,latency,awake_time,deep_sleep_duration,light_sleep_duration,rem_sleep_duration,lowest_heart_rate,average_heart_rate,average_hrv,average_breath\n2026-01-01,25200,28800,88,540,1200,5400,12000,7800,52,60,40,14\n2026-01-02,25800,29100,89,480,900,6000,11700,8100,50,59,45,13.8'
  });

  const progressStates = [];
  await importZipArrayBuffer({
    fileName: 'first.zip',
    arrayBuffer: firstZip,
    onProgress: (progress) => progressStates.push(progress.status)
  });

  assert.deepEqual(getAvailableDates(), ['2026-01-01', '2026-01-02']);
  assert.equal(getDay('2026-01-02').dailyReadiness?.score, 88);
  assert.equal(getDay('2026-01-02').dailySleep?.score, 83);
  const snapshot = getStoreSnapshot();
  assert.equal(snapshot.importState.status, 'success');
  assert.ok(snapshot.importState.lastSuccessAt);
  assert.equal(snapshot.ingestReport.rowCounts.dailyReadiness, 2);
  assert.equal(snapshot.ingestReport.rowCounts.dailySleep, 2);
  assert.ok(progressStates.includes('loading'));
  assert.equal(snapshot.ingestReport.dateRange.end, '2026-01-02');

  const resolved = resolveSelectedRange(getAvailableDates(), { preset: 'latest-day' });
  assert.equal(resolved.end, '2026-01-02');
  assert.equal(resolved.isSingleDay, true);
});

test('upload replaces prior dataset cleanly and resets latest-day against new dates', async () => {
  const secondZip = await buildZip({
    'daily_readiness.csv': 'day,score,temperature_deviation,contributors\n2026-03-10,74,-0.2,"{""resting_heart_rate"":63}"\n2026-03-11,79,-0.1,"{""resting_heart_rate"":66}"',
    'daily_sleep.csv': 'day,score,contributors\n2026-03-10,72,"{""efficiency"":68}"\n2026-03-11,76,"{""efficiency"":70}"',
    'sleep_model.csv': 'day,total_sleep_duration,time_in_bed,efficiency,latency,awake_time,deep_sleep_duration,light_sleep_duration,rem_sleep_duration,lowest_heart_rate,average_heart_rate,average_hrv,average_breath\n2026-03-10,24000,28200,85,720,1500,4200,12600,7200,56,64,31,15.1\n2026-03-11,24600,28500,86,660,1320,4800,12300,7500,55,63,33,14.9'
  });

  await importZipArrayBuffer({ fileName: 'second.zip', arrayBuffer: secondZip });

  assert.deepEqual(getAvailableDates(), ['2026-03-10', '2026-03-11']);
  assert.equal(getDay('2026-01-02').dailyReadiness, null);
  assert.equal(getDay('2026-03-11').dailyReadiness?.score, 79);
  assert.equal(getDay('2026-03-11').dailySleep?.score, 76);

  const previousCustom = { preset: 'custom', start: '2026-01-01', end: '2026-01-02' };
  const resolved = resolveSelectedRange(getAvailableDates(), previousCustom);
  assert.equal(resolved.start, '2026-03-11');
  assert.equal(resolved.end, '2026-03-11');

  const latest = resolveSelectedRange(getAvailableDates(), { preset: 'latest-day' });
  assert.equal(latest.start, '2026-03-11');
  assert.equal(latest.end, '2026-03-11');
});

test('settings upload handler calls import path and resolves latest-day range', async () => {
  let called = 0;
  const file = { name: 'oura.zip' };
  const next = await runSettingsUploadImport({
    file,
    settings: { nightWindowMode: 'auto' },
    importZipFn: async (inputFile, inputSettings, onProgress) => {
      called += 1;
      assert.equal(inputFile, file);
      assert.equal(inputSettings.nightWindowMode, 'auto');
      onProgress?.({ status: 'loading', phase: 'Reading ZIP', percent: 5 });
      return { ok: true };
    },
    getAvailableDatesFn: () => ['2026-04-01', '2026-04-02'],
    resolveSelectedRangeFn: (dates, preferred) => {
      assert.deepEqual(dates, ['2026-04-01', '2026-04-02']);
      assert.equal(preferred.preset, 'latest-day');
      return { preset: 'latest-day', start: '2026-04-02', end: '2026-04-02', isSingleDay: true };
    },
    persistSelectedRangeFn: (range) => {
      assert.deepEqual(range, { preset: 'latest-day', start: '2026-04-02', end: '2026-04-02' });
    }
  });

  assert.equal(called, 1);
  assert.equal(next.end, '2026-04-02');
});

test('debug page does not render date range controls', () => {
  assert.equal(shouldRenderDateRangeForPage('debug'), false);
  assert.equal(shouldRenderDateRangeForPage('index'), true);
  assert.equal(shouldRenderDateRangeForPage('readiness'), true);
  assert.equal(shouldRenderDateRangeForPage('sleep'), true);
  assert.equal(shouldRenderIntroBanner('index'), false);
  assert.equal(shouldRenderIntroBanner('stress'), false);
  assert.equal(shouldRenderIntroBanner('debug'), false);
});

test('large import persists in indexeddb and not full payload localStorage key', async () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalIndexedDb = globalThis.indexedDB;
  const local = createMemoryStorage();
  const fakeIndexedDb = createFakeIndexedDb();
  globalThis.localStorage = local;
  globalThis.indexedDB = fakeIndexedDb;

  try {
    const zip = await buildZip({
      'daily_readiness.csv': 'day,score,temperature_deviation\n2026-05-01,75,0.1\n2026-05-02,80,0.0\n2026-05-03,81,0.0',
      'daily_sleep.csv': 'day,score\n2026-05-01,73\n2026-05-02,74\n2026-05-03,76',
      'sleep_model.csv': 'day,total_sleep_duration,time_in_bed,efficiency,latency,awake_time,deep_sleep_duration,light_sleep_duration,rem_sleep_duration,lowest_heart_rate,average_heart_rate,average_hrv,average_breath\n2026-05-01,24000,28000,85,500,900,5000,11000,8000,52,60,42,13.8\n2026-05-02,24400,28100,86,480,840,5200,11200,8000,51,59,43,13.7\n2026-05-03,24800,28300,87,460,800,5400,11400,8000,50,58,44,13.5'
    });

    await importZipArrayBuffer({ fileName: 'oura.zip', arrayBuffer: zip });
    const snapshot = getStoreSnapshot();
    assert.equal(snapshot.importState.status, 'success');
    assert.equal(snapshot.importState.lastError, null);
    assert.equal(snapshot.ingestReport.dateRange.end, '2026-05-03');
    assert.equal(snapshot.storageState.backend, 'indexeddb');
    assert.equal(snapshot.storageState.largeState.ok, true);
    assert.equal(snapshot.storageState.largeState.readable, true);

    const persistedKeys = local.writes.map((entry) => entry.key);
    assert.ok(persistedKeys.includes('ouraDerivedMetricsMetaV1'));
    assert.ok(!persistedKeys.includes('ouraDerivedMetricsV3'));

    const selected = resolveSelectedRange(getAvailableDates(), { preset: 'latest-day' });
    assert.equal(selected.end, '2026-05-03');
    assert.equal(selected.disabled, false);

    await hydrateFromPersistence({ storage: local, indexedDb: fakeIndexedDb });
    assert.equal(getDay('2026-05-03').dailyReadiness?.score, 81);
    assert.equal(getDay('2026-05-03').dailySleep?.score, 76);
  } finally {
    globalThis.localStorage = originalLocalStorage;
    globalThis.indexedDB = originalIndexedDb;
  }
});

test('activity and heart-rate range data exposes aggregated inputs and activity lists', async () => {
  const zip = await buildZip({
    'daily_activity.csv': 'day,score,steps,active_calories,total_calories,target_calories,low_activity_time,medium_activity_time,high_activity_time,sedentary_time,inactivity_alerts,contributors,class_5_min\n2026-06-01,75,8000,420,2100,2500,3600,2400,600,36000,4,"{""stay_active"":70}",001122\n2026-06-02,85,12000,650,2500,2500,3000,3600,1200,30000,1,"{""stay_active"":88}",112233',
    'sleep_model.csv': 'day,total_sleep_duration,time_in_bed,efficiency,latency,awake_time,deep_sleep_duration,light_sleep_duration,rem_sleep_duration,lowest_heart_rate,highest_heart_rate,average_heart_rate,average_hrv,average_breath\n2026-06-01,24800,28600,86,500,900,5200,11200,8400,51,75,60,41,13.7\n2026-06-02,25200,28800,87,480,850,5400,11300,8500,49,73,58,44,13.6',
    'heart_rate.csv': 'timestamp,bpm\n2026-06-01T21:00:00Z,62\n2026-06-01T22:00:00Z,58\n2026-06-02T01:00:00Z,53\n2026-06-02T10:00:00Z,64\n2026-06-02T14:00:00Z,67',
    'workout.csv': 'day,start_datetime,end_datetime,duration,calories,average_heart_rate,activity,label\n2026-06-02,2026-06-02T17:15:00Z,2026-06-02T18:00:00Z,0,340,141,running,',
    'session.csv': 'day,start_datetime,duration,type\n2026-06-02,2026-06-02T07:00:00Z,1200,Breathwork'
  });

  await importZipArrayBuffer({ fileName: 'activity-heart.zip', arrayBuffer: zip });
  const selectedDay = getDay('2026-06-02');
  assert.equal(selectedDay.dailyActivity?.steps, 12000);
  assert.equal(selectedDay.heartRateWindowSummary?.max, 67);
  assert.equal(selectedDay.activities.length, 2);
  assert.equal(selectedDay.activities.find((row) => row.source === 'workout')?.durationSec, 2700);
  assert.equal(selectedDay.activities.find((row) => row.source === 'workout')?.type, 'running');

  const range = getRange('2026-06-01', '2026-06-02');
  assert.equal(range.dailyActivity.length, 2);
  assert.equal(range.workout.length, 1);
  assert.equal(range.session.length, 1);
  assert.equal(range.daytimeHeartRate.length >= 1, true);
  assert.equal(range.heartRate.length >= 3, true);
});

test('stress datasets hydrate selected-day and range rows', async () => {
  const zip = await buildZip({
    'dailystress.csv': 'id,day,day_summary,recovery_high,stress_high\n1,2026-07-01,normal,1200,2400\n2,2026-07-02,stressed,1800,3600',
    'daytimestress.csv': 'timestamp,recovery_value,stress_value\n2026-07-02T08:00:00Z,60,\n2026-07-02T12:00:00Z,,78\n2026-07-02T19:30:00Z,35,22'
  });

  await importZipArrayBuffer({ fileName: 'stress.zip', arrayBuffer: zip });
  const day = getDay('2026-07-02');
  const range = getRange('2026-07-01', '2026-07-02');
  assert.equal(day.dailyStress?.high, 60);
  assert.equal(day.dailyStress?.recovery, 30);
  assert.equal(day.dailyStress?.daySummary, 'stressed');
  assert.equal(range.dailyStress.length, 2);
  assert.equal(range.daytimeStress.length, 3);
  assert.equal(range.daytimeStress.some((row) => Number.isFinite(row.score)), true);
  assert.equal(range.daytimeStress.some((row) => Number.isFinite(row.recoveryValue)), true);
});
