import { median, toNumber } from '../vitals-core.mjs';

const MINUTES_IN_DAY = 1440;
const HIGH_CONFIDENCE = 'high';
const MEDIUM_CONFIDENCE = 'medium';
const LOW_CONFIDENCE = 'low';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseIso(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[idx];
}

function qualityBand(score) {
  if (!Number.isFinite(score)) return 0;
  if (score >= 85) return 3;
  if (score >= 75) return 2;
  if (score >= 65) return 1;
  return 0;
}

export function normalizeClockMinutes(value) {
  if (!Number.isFinite(value)) return null;
  const normalized = ((Math.round(value) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY;
  return normalized;
}

function circularDistanceMinutes(a, b) {
  const direct = Math.abs(a - b);
  return Math.min(direct, MINUTES_IN_DAY - direct);
}

function circularSignedDiffMinutes(target, baseline) {
  let diff = normalizeClockMinutes(target) - normalizeClockMinutes(baseline);
  if (diff > MINUTES_IN_DAY / 2) diff -= MINUTES_IN_DAY;
  if (diff < -MINUTES_IN_DAY / 2) diff += MINUTES_IN_DAY;
  return diff;
}

export function circularMedianClockMinutes(values) {
  const clean = values.map((v) => normalizeClockMinutes(v)).filter((v) => v != null);
  if (!clean.length) return null;
  let best = clean[0];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const candidate of clean) {
    const cost = clean.reduce((sum, value) => sum + circularDistanceMinutes(candidate, value), 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }
  return best;
}

function inferWindowFromHeartRate(date, heartRateRows = []) {
  const dayStart = new Date(`${date}T18:00:00`).getTime();
  const dayEnd = dayStart + 20 * 60 * 60 * 1000;
  if (!Number.isFinite(dayStart)) return null;

  const points = (heartRateRows || [])
    .map((row) => ({ t: new Date(row.timestamp).getTime(), bpm: toNumber(row.bpm) }))
    .filter((row) => Number.isFinite(row.t) && Number.isFinite(row.bpm) && row.t >= dayStart && row.t <= dayEnd)
    .sort((a, b) => a.t - b.t);

  if (points.length < 10) return null;

  const rolling = [];
  for (let i = 2; i < points.length - 2; i += 1) {
    const window = [points[i - 2].bpm, points[i - 1].bpm, points[i].bpm, points[i + 1].bpm, points[i + 2].bpm];
    const avg = window.reduce((sum, value) => sum + value, 0) / window.length;
    rolling.push({ t: points[i].t, avg });
  }

  if (!rolling.length) return null;
  const lowest = rolling.reduce((best, row) => (row.avg < best.avg ? row : best), rolling[0]);
  const midpoint = lowest.t;
  const estimatedDurationMin = 7 * 60;
  return {
    startMs: midpoint - (estimatedDurationMin / 2) * 60 * 1000,
    endMs: midpoint + (estimatedDurationMin / 2) * 60 * 1000,
    sourcePath: 'heartRate.inferredRollingLowWindow',
    confidence: LOW_CONFIDENCE,
    fallbackUsed: true
  };
}

export function getNightSleepWindow(date, context = {}) {
  const sleepTimeRow = (context.sleepTimeRows || []).find((row) => row.date === date);
  const sleepModelRow = (context.sleepModelRows || []).find((row) => row.date === date);

  const startFromSleepTime = parseIso(sleepTimeRow?.bedtimeStart);
  const endFromSleepTime = parseIso(sleepTimeRow?.bedtimeEnd);
  if (Number.isFinite(startFromSleepTime) && Number.isFinite(endFromSleepTime) && endFromSleepTime > startFromSleepTime) {
    return {
      startMs: startFromSleepTime,
      endMs: endFromSleepTime,
      sourcePath: 'sleepTime.bedtimeStart+bedtimeEnd',
      confidence: HIGH_CONFIDENCE,
      fallbackUsed: false
    };
  }

  const startFromSleepModel = parseIso(sleepModelRow?.bedtimeStart);
  const endFromSleepModel = parseIso(sleepModelRow?.bedtimeEnd);
  if (Number.isFinite(startFromSleepModel) && Number.isFinite(endFromSleepModel) && endFromSleepModel > startFromSleepModel) {
    return {
      startMs: startFromSleepModel,
      endMs: endFromSleepModel,
      sourcePath: 'sleepModel.bedtimeStart+bedtimeEnd',
      confidence: MEDIUM_CONFIDENCE,
      fallbackUsed: true
    };
  }

  if (Number.isFinite(startFromSleepTime)) {
    return {
      startMs: startFromSleepTime,
      endMs: startFromSleepTime + 7 * 60 * 60 * 1000,
      sourcePath: 'sleepTime.bedtimeStart+assumed7h',
      confidence: LOW_CONFIDENCE,
      fallbackUsed: true
    };
  }

  return inferWindowFromHeartRate(date, context.heartRateRows || []);
}

export function getNightSleepAmountEstimate(date, context = {}) {
  const sleepTimeRow = (context.sleepTimeRows || []).find((row) => row.date === date);
  const sleepModelRow = (context.sleepModelRows || []).find((row) => row.date === date);
  const dailySleepRow = (context.dailySleepRows || []).find((row) => row.date === date);

  const explicitDurationFields = [
    'sleepDurationSec',
    'totalSleepDurationSec',
    'asleepDurationSec',
    'durationSec',
    'timeInBedSec'
  ];

  for (const key of explicitDurationFields) {
    const fromSleepTime = toNumber(sleepTimeRow?.[key]);
    if (Number.isFinite(fromSleepTime) && fromSleepTime > 0) {
      return {
        minutes: Math.round(fromSleepTime / 60),
        sourcePath: `sleepTime.${key}`,
        confidence: HIGH_CONFIDENCE,
        method: 'explicit_duration'
      };
    }
  }

  const fromSleepModel = toNumber(sleepModelRow?.totalSleepSec);
  if (Number.isFinite(fromSleepModel) && fromSleepModel > 0) {
    return {
      minutes: Math.round(fromSleepModel / 60),
      sourcePath: 'sleepModel.totalSleepSec',
      confidence: MEDIUM_CONFIDENCE,
      method: 'sleep_model_duration'
    };
  }

  const nightWindow = getNightSleepWindow(date, context);
  if (nightWindow?.startMs && nightWindow?.endMs) {
    return {
      minutes: Math.round((nightWindow.endMs - nightWindow.startMs) / 60000),
      sourcePath: nightWindow.sourcePath,
      confidence: nightWindow.confidence,
      method: 'window_duration'
    };
  }

  const score = toNumber(dailySleepRow?.score);
  if (Number.isFinite(score)) {
    // Lower confidence proxy path when no timing duration is parseable.
    const minutes = clamp(Math.round(330 + score * 2.25), 270, 570);
    return {
      minutes,
      sourcePath: 'dailySleep.score proxy',
      confidence: LOW_CONFIDENCE,
      method: 'score_proxy'
    };
  }

  return {
    minutes: null,
    sourcePath: 'none',
    confidence: LOW_CONFIDENCE,
    method: 'missing'
  };
}

export function getPersonalSleepNeedTarget(nightlyRows = []) {
  const valid = nightlyRows.filter((row) => Number.isFinite(row.minutes) && row.minutes >= 180 && row.minutes <= 900);
  if (!valid.length) return { targetMinutes: 450, confidence: LOW_CONFIDENCE, sourceWindowDays: 0 };

  const window = valid.slice(-28);
  const byQuality = window
    .map((row) => ({ ...row, band: qualityBand(toNumber(row.sleepScore)) }))
    .filter((row) => row.band >= 2);

  let strong = byQuality;
  if (strong.length < Math.min(5, Math.ceil(window.length / 3))) {
    const sortedByScore = [...window].sort((a, b) => (toNumber(b.sleepScore) || 0) - (toNumber(a.sleepScore) || 0));
    strong = sortedByScore.slice(0, Math.max(4, Math.ceil(sortedByScore.length * 0.4)));
  }

  if (!strong.length) {
    const p65 = percentile(window.map((row) => row.minutes), 0.65);
    return {
      targetMinutes: clamp(Math.round(p65 || median(window.map((row) => row.minutes)) || 450), 360, 570),
      confidence: window.length >= 14 ? MEDIUM_CONFIDENCE : LOW_CONFIDENCE,
      sourceWindowDays: window.length
    };
  }

  const baseTarget = median(strong.map((row) => row.minutes));
  return {
    targetMinutes: clamp(Math.round(baseTarget || 450), 360, 570),
    confidence: window.length >= 21 ? HIGH_CONFIDENCE : MEDIUM_CONFIDENCE,
    sourceWindowDays: window.length
  };
}

export function mapSleepDebtStatus(minutes) {
  if (!Number.isFinite(minutes) || minutes < 30) return { label: 'None', band: 'none' };
  if (minutes < 120) return { label: 'Low', band: 'low' };
  if (minutes < 300) return { label: 'Moderate', band: 'moderate' };
  return { label: 'High', band: 'high' };
}

function formatDurationLabel(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return '—';
  const abs = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${hours}h ${minutes}m`;
}

export function computeSleepDebtEstimate({ selectedDate, dailySleepRows = [], sleepTimeRows = [], sleepModelRows = [], heartRateRows = [] } = {}) {
  const allDates = [...new Set([
    ...dailySleepRows.map((row) => row.date),
    ...sleepTimeRows.map((row) => row.date),
    ...sleepModelRows.map((row) => row.date)
  ])]
    .filter(Boolean)
    .sort()
    .filter((date) => !selectedDate || date <= selectedDate);

  const context = { dailySleepRows, sleepTimeRows, sleepModelRows, heartRateRows };

  let debtMinutes = 0;
  let smoothTarget = null;
  const nightly = [];

  for (const date of allDates) {
    const amount = getNightSleepAmountEstimate(date, context);
    if (!Number.isFinite(amount.minutes)) continue;

    const sleepScore = toNumber(dailySleepRows.find((row) => row.date === date)?.score);
    const windowRows = [...nightly, { date, minutes: amount.minutes, sleepScore }];
    const targetModel = getPersonalSleepNeedTarget(windowRows);
    smoothTarget = smoothTarget == null ? targetModel.targetMinutes : Math.round(smoothTarget * 0.82 + targetModel.targetMinutes * 0.18);

    const delta = amount.minutes - smoothTarget;
    if (delta < 0) debtMinutes += Math.abs(delta);
    else debtMinutes -= delta * 0.55; // Surpluses repay debt gradually (not 1:1) to keep reserve behavior stable.
    debtMinutes = clamp(debtMinutes, 0, 12 * 60);

    nightly.push({
      date,
      minutes: amount.minutes,
      sleepScore,
      targetMinutes: smoothTarget,
      deltaMinutes: Math.round(delta),
      debtMinutes: Math.round(debtMinutes),
      sourcePath: amount.sourcePath,
      confidence: amount.confidence,
      method: amount.method
    });
  }

  const selectedNight = nightly.at(-1) || null;
  const recent14 = nightly.slice(-14);
  const status = mapSleepDebtStatus(selectedNight?.debtMinutes ?? 0);
  const confidenceRank = { low: 1, medium: 2, high: 3 };
  const combinedConfidence = recent14.reduce((acc, row) => (confidenceRank[row.confidence] < confidenceRank[acc] ? row.confidence : acc), HIGH_CONFIDENCE);

  return {
    display: {
      title: 'Sleep Debt',
      label: formatDurationLabel(selectedNight?.debtMinutes ?? 0),
      minutes: selectedNight?.debtMinutes ?? 0,
      status: status.label,
      statusBand: status.band,
      gaugeSegments: [
        { label: 'None', min: 0, max: 30 },
        { label: 'Low', min: 30, max: 120 },
        { label: 'Moderate', min: 120, max: 300 },
        { label: 'High', min: 300, max: 720 }
      ],
      helperText: 'Estimated from your recent sleep amount vs personal target.'
    },
    debug: {
      metric: 'derivedSleepDebtEstimate',
      selectedDate,
      sourcePath: selectedNight?.sourcePath || 'none',
      confidence: nightly.length >= 7 ? combinedConfidence : LOW_CONFIDENCE,
      validNightCount: nightly.length,
      rollingTargetMinutes: selectedNight?.targetMinutes ?? null,
      nightlyDeficitsLast14: recent14.map((row) => ({ date: row.date, deltaMinutes: row.deltaMinutes, debtMinutes: row.debtMinutes, sourcePath: row.sourcePath })),
      displayedDebtMinutes: selectedNight?.debtMinutes ?? 0
    }
  };
}

export function getNightMidpoint(date, context = {}) {
  const window = getNightSleepWindow(date, context);
  if (!window?.startMs || !window?.endMs) {
    return { midpointClockMinutes: null, sourcePath: 'none', confidence: LOW_CONFIDENCE };
  }
  const midpoint = window.startMs + (window.endMs - window.startMs) / 2;
  const d = new Date(midpoint);
  const minutes = normalizeClockMinutes(d.getHours() * 60 + d.getMinutes());
  return {
    midpointClockMinutes: minutes,
    sourcePath: window.sourcePath,
    confidence: window.confidence
  };
}

export function computeBodyClockBaseline({ selectedDate, lookbackDays = 35, dailySleepRows = [], sleepTimeRows = [], sleepModelRows = [], heartRateRows = [] } = {}) {
  const allDates = [...new Set([...dailySleepRows.map((r) => r.date), ...sleepTimeRows.map((r) => r.date), ...sleepModelRows.map((r) => r.date)])]
    .filter(Boolean)
    .sort()
    .filter((date) => !selectedDate || date <= selectedDate)
    .slice(-Math.min(42, Math.max(21, lookbackDays)));

  const context = { dailySleepRows, sleepTimeRows, sleepModelRows, heartRateRows };
  const mids = allDates
    .map((date) => ({ date, ...getNightMidpoint(date, context) }))
    .filter((row) => Number.isFinite(row.midpointClockMinutes));

  const baseline = circularMedianClockMinutes(mids.map((row) => row.midpointClockMinutes));
  const sourcePath = mids.at(-1)?.sourcePath || 'none';
  const confidence = mids.length >= 21 ? HIGH_CONFIDENCE : mids.length >= 10 ? MEDIUM_CONFIDENCE : LOW_CONFIDENCE;

  return {
    baselineMidpointClockMinutes: baseline,
    windowStart: allDates[0] || null,
    windowEnd: allDates.at(-1) || null,
    nightCount: mids.length,
    sourcePath,
    confidence
  };
}

function formatClockMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const normalized = normalizeClockMinutes(minutes);
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function formatAheadBehind(offsetMinutes) {
  if (!Number.isFinite(offsetMinutes) || Math.abs(offsetMinutes) < 3) return 'in line with your body clock';
  const abs = Math.abs(Math.round(offsetMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const duration = `${h} h ${m} min`;
  return offsetMinutes > 0 ? `${duration} behind your body clock` : `${duration} ahead of your body clock`;
}

export function computeBodyClockOffset({ selectedDate, dailySleepRows = [], sleepTimeRows = [], sleepModelRows = [], heartRateRows = [] } = {}) {
  const context = { dailySleepRows, sleepTimeRows, sleepModelRows, heartRateRows };
  const selected = getNightMidpoint(selectedDate, context);
  const baseline = computeBodyClockBaseline({ selectedDate, dailySleepRows, sleepTimeRows, sleepModelRows, heartRateRows });

  const offsetMinutes = Number.isFinite(selected.midpointClockMinutes) && Number.isFinite(baseline.baselineMidpointClockMinutes)
    ? circularSignedDiffMinutes(selected.midpointClockMinutes, baseline.baselineMidpointClockMinutes)
    : null;

  return {
    display: {
      title: 'Body Clock',
      selectedMidpointClockMinutes: selected.midpointClockMinutes,
      habitualMidpointClockMinutes: baseline.baselineMidpointClockMinutes,
      offsetMinutes,
      narrative: Number.isFinite(offsetMinutes)
        ? `The midpoint of your sleep was ${formatAheadBehind(offsetMinutes)}.`
        : 'Not enough nights to estimate body clock offset yet.'
    },
    debug: {
      metric: 'derivedBodyClockOffsetEstimate',
      selectedDate,
      selectedMidpoint: formatClockMinutes(selected.midpointClockMinutes),
      habitualMidpoint: formatClockMinutes(baseline.baselineMidpointClockMinutes),
      windowStart: baseline.windowStart,
      windowEnd: baseline.windowEnd,
      windowNightCount: baseline.nightCount,
      sourcePath: selected.sourcePath,
      confidence: baseline.confidence
    }
  };
}
