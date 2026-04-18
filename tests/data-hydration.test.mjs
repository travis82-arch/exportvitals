import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { importZipArrayBuffer, getAvailableDates, getDay } from '../src/store/dataStore.js';
import { resolveSelectedRange } from '../src/state/selectedRange.js';
import { shouldRenderDateRangeForPage } from '../src/state/pageConfig.js';

async function buildZip(nameToCsv) {
  const zip = new JSZip();
  for (const [name, csv] of Object.entries(nameToCsv)) zip.file(name, csv);
  return zip.generateAsync({ type: 'arraybuffer' });
}

test('successful upload updates active state and latest day is renderable', async () => {
  const firstZip = await buildZip({
    'daily_readiness.csv': 'day,score,temperature_deviation,contributors\n2026-01-01,82,0.1,"{""resting_heart_rate"":80}"\n2026-01-02,88,0.0,"{""resting_heart_rate"":85}"',
    'daily_sleep.csv': 'day,score,contributors\n2026-01-01,77,"{""efficiency"":70}"\n2026-01-02,83,"{""efficiency"":78}"',
    'sleep_model.csv': 'day,total_sleep_duration,time_in_bed,efficiency,latency,awake_time,deep_sleep_duration,light_sleep_duration,rem_sleep_duration,lowest_heart_rate,average_heart_rate,average_hrv,average_breath\n2026-01-01,25200,28800,88,540,1200,5400,12000,7800,52,60,40,14\n2026-01-02,25800,29100,89,480,900,6000,11700,8100,50,59,45,13.8'
  });

  await importZipArrayBuffer({ fileName: 'first.zip', arrayBuffer: firstZip });

  assert.deepEqual(getAvailableDates(), ['2026-01-01', '2026-01-02']);
  assert.equal(getDay('2026-01-02').dailyReadiness?.score, 88);
  assert.equal(getDay('2026-01-02').dailySleep?.score, 83);

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
  assert.equal(resolved.start, '2026-03-10');
  assert.equal(resolved.end, '2026-03-11');

  const latest = resolveSelectedRange(getAvailableDates(), { preset: 'latest-day' });
  assert.equal(latest.start, '2026-03-11');
  assert.equal(latest.end, '2026-03-11');
});

test('settings page does not render date range controls', () => {
  assert.equal(shouldRenderDateRangeForPage('settings'), false);
  assert.equal(shouldRenderDateRangeForPage('index'), true);
  assert.equal(shouldRenderDateRangeForPage('readiness'), true);
  assert.equal(shouldRenderDateRangeForPage('sleep'), true);
});
