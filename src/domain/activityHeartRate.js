const DEFAULT_ZONE_SCHEME = [
  { key: 'z1', label: 'Zone 1 · Easy', min: 0, max: 109, color: '#5ab4f8' },
  { key: 'z2', label: 'Zone 2 · Light', min: 110, max: 129, color: '#47c7b3' },
  { key: 'z3', label: 'Zone 3 · Moderate', min: 130, max: 149, color: '#f0c05f' },
  { key: 'z4', label: 'Zone 4 · Hard', min: 150, max: 169, color: '#f28f5f' },
  { key: 'z5', label: 'Zone 5 · Peak', min: 170, max: Number.POSITIVE_INFINITY, color: '#eb5c76' }
];

const MAX_INTERVAL_SECONDS = 120;
const MIN_SAMPLE_COUNT = 6;
const MIN_COVERAGE_RATIO = 0.35;

function toMs(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function computeWindow(activity) {
  const startMs = toMs(activity?.startTime) ?? toMs(`${activity?.date || ''}T00:00:00`);
  if (!Number.isFinite(startMs)) return null;
  const endFromRow = toMs(activity?.endTime);
  const durationMs = Number.isFinite(Number(activity?.durationSec)) ? Number(activity.durationSec) * 1000 : null;
  const fallbackEnd = durationMs ? startMs + durationMs : null;
  const endMs = endFromRow ?? fallbackEnd;
  if (!Number.isFinite(endMs) || endMs <= startMs) return null;
  return { startMs, endMs, expectedSeconds: Math.round((endMs - startMs) / 1000) };
}

function findZone(bpm, zoneScheme) {
  return zoneScheme.find((zone) => bpm >= zone.min && bpm <= zone.max) || null;
}

export function buildActivityHeartRateBreakdown(activity, heartRateRows, options = {}) {
  const zoneScheme = options.zoneScheme || DEFAULT_ZONE_SCHEME;
  const window = computeWindow(activity);
  if (!window) {
    return {
      supported: false,
      reason: 'Activity timing is missing in this export.',
      samples: [],
      zones: zoneScheme.map((zone) => ({ ...zone, seconds: 0, minutes: 0 }))
    };
  }

  const samples = (heartRateRows || [])
    .map((row) => ({ tMs: toMs(row?.timestamp), bpm: Number(row?.bpm) }))
    .filter((row) => Number.isFinite(row.tMs) && Number.isFinite(row.bpm))
    .filter((row) => row.tMs >= window.startMs && row.tMs <= window.endMs)
    .sort((a, b) => a.tMs - b.tMs);

  if (samples.length < MIN_SAMPLE_COUNT) {
    return {
      supported: false,
      reason: 'Detailed heart-rate samples are too sparse for this activity.',
      samples,
      zones: zoneScheme.map((zone) => ({ ...zone, seconds: 0, minutes: 0 })),
      avgHr: null,
      peakHr: samples.length ? Math.max(...samples.map((sample) => sample.bpm)) : null
    };
  }

  const deltas = [];
  for (let idx = 1; idx < samples.length; idx += 1) {
    const delta = (samples[idx].tMs - samples[idx - 1].tMs) / 1000;
    if (Number.isFinite(delta) && delta > 0 && delta <= MAX_INTERVAL_SECONDS) deltas.push(delta);
  }
  const medianDelta = deltas.length ? deltas.sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : 15;

  const zoneSeconds = new Map(zoneScheme.map((zone) => [zone.key, 0]));
  let coveredSeconds = 0;

  for (let idx = 0; idx < samples.length; idx += 1) {
    const sample = samples[idx];
    const next = samples[idx + 1];
    const delta = next ? (next.tMs - sample.tMs) / 1000 : medianDelta;
    if (!Number.isFinite(delta) || delta <= 0 || delta > MAX_INTERVAL_SECONDS) continue;
    const zone = findZone(sample.bpm, zoneScheme);
    if (!zone) continue;
    zoneSeconds.set(zone.key, (zoneSeconds.get(zone.key) || 0) + delta);
    coveredSeconds += delta;
  }

  const coverageRatio = window.expectedSeconds > 0 ? coveredSeconds / window.expectedSeconds : 0;
  if (coverageRatio < MIN_COVERAGE_RATIO) {
    return {
      supported: false,
      reason: 'Detailed heart-rate samples do not cover enough of this activity.',
      samples,
      coverageRatio,
      avgHr: null,
      peakHr: Math.max(...samples.map((sample) => sample.bpm)),
      zones: zoneScheme.map((zone) => ({ ...zone, seconds: 0, minutes: 0 }))
    };
  }

  const avgHr = samples.reduce((sum, sample) => sum + sample.bpm, 0) / samples.length;
  const peakHr = Math.max(...samples.map((sample) => sample.bpm));

  return {
    supported: true,
    reason: '',
    samples,
    coverageRatio,
    avgHr,
    peakHr,
    zones: zoneScheme.map((zone) => {
      const seconds = zoneSeconds.get(zone.key) || 0;
      return {
        ...zone,
        seconds,
        minutes: seconds / 60
      };
    })
  };
}

export { DEFAULT_ZONE_SCHEME };
