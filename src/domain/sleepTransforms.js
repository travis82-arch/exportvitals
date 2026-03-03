import { median } from '../vitals-core.mjs';

export function scoreToLabel(score) {
  if (score == null) return { label: 'No score', band: 'missing' };
  if (score >= 85) return { label: 'Optimal', band: 'optimal' };
  if (score >= 70) return { label: 'Good', band: 'good' };
  return { label: 'Fair', band: 'fair' };
}

export function breathingIndexToLabel(bdi) {
  if (bdi == null) return { label: 'Not available', explainer: 'No breathing disturbance index for this date.' };
  if (bdi < 2) return { label: 'Optimal', explainer: 'Breathing regularity looks stable.' };
  if (bdi < 5) return { label: 'Good', explainer: 'Mild disturbances detected overnight.' };
  return { label: 'Pay attention', explainer: 'Higher breathing disturbances than usual.' };
}

export function contributorsToBars(contributorsJson) {
  const keys = ['total_sleep', 'efficiency', 'restfulness', 'rem_sleep', 'deep_sleep', 'latency', 'timing'];
  return keys.map((key) => ({ key, value: contributorsJson?.[key] ?? null }));
}

export function selectNightWindow(date, settings, sleepRows = [], heartRows = []) {
  const sleepRow = sleepRows.find((row) => row.date === date);
  const start = sleepRow?.bedtimeStart ? new Date(sleepRow.bedtimeStart) : new Date(`${date}T${settings.fallbackStart}:00`);
  let end = sleepRow?.bedtimeEnd ? new Date(sleepRow.bedtimeEnd) : new Date(`${date}T${settings.fallbackEnd}:00`);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  const windowMode = sleepRow ? 'sleep_time' : 'fallback';
  const hasDataInWindow = heartRows.some((r) => {
    const ts = new Date(r.timestamp);
    return ts >= start && ts <= end;
  });
  return { start, end, windowMode: hasDataInWindow ? windowMode : `${windowMode}_empty` };
}

export function seriesFromHeartRate(dateWindow, heartRows = []) {
  return heartRows
    .map((r) => ({ t: new Date(r.timestamp), v: Number(r.bpm) }))
    .filter((p) => !Number.isNaN(p.t.getTime()) && Number.isFinite(p.v) && p.t >= dateWindow.start && p.t <= dateWindow.end)
    .sort((a, b) => a.t - b.t)
    .map((p) => ({ t: p.t.toISOString(), v: p.v }));
}

export function seriesFromHrvProxy(dateWindow, heartRows = []) {
  const hrSeries = seriesFromHeartRate(dateWindow, heartRows);
  const rr = hrSeries.map((p) => 60000 / p.v);
  if (rr.length < 3) return [];
  const points = [];
  for (let i = 2; i < rr.length; i += 1) {
    const diffs = [rr[i] - rr[i - 1], rr[i - 1] - rr[i - 2]];
    const rmssd = Math.sqrt((diffs[0] ** 2 + diffs[1] ** 2) / 2);
    points.push({ t: hrSeries[i].t, v: rmssd });
  }
  return points;
}

export function medianForDateWindow(rows, key, selectedDate, window = 14) {
  const vals = rows.filter((r) => r.date < selectedDate && r[key] != null).slice(-window).map((r) => r[key]);
  return median(vals);
}
