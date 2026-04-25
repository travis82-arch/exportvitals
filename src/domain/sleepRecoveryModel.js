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
      helperText: 'Estimated from recent sleep amount versus a rolling personal target.'
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

function formatClockMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const normalized = normalizeClockMinutes(minutes);
  const hh = Math.floor(normalized / 60);
  const mm = normalized % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatClockMinutes12h(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const normalized = normalizeClockMinutes(minutes);
  const hh24 = Math.floor(normalized / 60);
  const mm = normalized % 60;
  const suffix = hh24 >= 12 ? 'PM' : 'AM';
  const hh12 = (hh24 % 12) || 12;
  return `${hh12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

const THREE_HOURS_SEC = 3 * 60 * 60;
const MIN_HISTORY_NIGHTS = 14;
const STRONG_WINDOW_NIGHTS = 90;
const ALIGNMENT_THRESHOLD_MIN = 30;

function toMs(value) {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function toMinuteOfDay(timestampMs) {
  const d = new Date(timestampMs);
  return normalizeClockMinutes((d.getHours() * 60) + d.getMinutes());
}

function medianOfNumbers(values = []) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? median(clean) : null;
}

function medianAbsoluteDeviation(values = [], center) {
  if (!Number.isFinite(center)) return null;
  const deltas = values
    .filter(Number.isFinite)
    .map((value) => circularDistanceMinutes(value, center));
  return medianOfNumbers(deltas);
}

function summarizeSleepWindow(nights = []) {
  if (!nights.length) {
    return {
      bedtimeMinute: null,
      wakeMinute: null,
      midpointMinute: null,
      durationSec: null,
      timeInBedSec: null,
      variabilityMinutes: null
    };
  }
  const bedtimeMinute = circularMedianClockMinutes(nights.map((night) => night.bedtimeStartMinuteOfDay));
  const wakeMinute = circularMedianClockMinutes(nights.map((night) => night.bedtimeEndMinuteOfDay));
  const midpointMinute = circularMedianClockMinutes(nights.map((night) => night.sleepMidpointMinuteOfDay));
  return {
    bedtimeMinute,
    wakeMinute,
    midpointMinute,
    durationSec: medianOfNumbers(nights.map((night) => night.totalSleepDurationSec)),
    timeInBedSec: medianOfNumbers(nights.map((night) => night.timeInBedSec)),
    variabilityMinutes: medianAbsoluteDeviation(nights.map((night) => night.sleepMidpointMinuteOfDay), midpointMinute)
  };
}

export function selectPrimaryLongSleepByDay(sleepModelRows = []) {
  const byDate = new Map();
  for (const row of sleepModelRows || []) {
    const date = row?.date;
    const type = String(row?.type || '').toLowerCase();
    const totalSleepDurationSec = toNumber(row?.totalSleepSec);
    const bedtimeStartMs = toMs(row?.bedtimeStart);
    const bedtimeEndMs = toMs(row?.bedtimeEnd);
    if (!date || type !== 'long_sleep') continue;
    if (!Number.isFinite(totalSleepDurationSec) || totalSleepDurationSec < THREE_HOURS_SEC) continue;
    if (!Number.isFinite(bedtimeStartMs) || !Number.isFinite(bedtimeEndMs) || bedtimeEndMs <= bedtimeStartMs) continue;
    const current = byDate.get(date);
    if (!current || totalSleepDurationSec > current.totalSleepDurationSec) {
      const midpointMs = bedtimeStartMs + Math.round((bedtimeEndMs - bedtimeStartMs) / 2);
      byDate.set(date, {
        date,
        bedtimeStartMs,
        bedtimeEndMs,
        sleepMidpointMs: midpointMs,
        bedtimeStartMinuteOfDay: toMinuteOfDay(bedtimeStartMs),
        bedtimeEndMinuteOfDay: toMinuteOfDay(bedtimeEndMs),
        sleepMidpointMinuteOfDay: toMinuteOfDay(midpointMs),
        totalSleepDurationSec,
        timeInBedSec: toNumber(row?.timeInBedSec),
        sourcePath: 'sleepModel.long_sleep'
      });
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function estimateChronotypeLabel(midpointMinute) {
  if (!Number.isFinite(midpointMinute)) return null;
  // Estimated chronotype bands (simple midpoint-of-sleep buckets).
  if (midpointMinute < 90) return 'Early morning';
  if (midpointMinute < 150) return 'Morning';
  if (midpointMinute < 210) return 'Late morning';
  if (midpointMinute < 270) return 'Early evening';
  if (midpointMinute < 330) return 'Evening';
  return 'Late evening';
}

function baselineConfidenceLabel(nightCount) {
  if (nightCount >= STRONG_WINDOW_NIGHTS) return HIGH_CONFIDENCE;
  if (nightCount >= 30) return MEDIUM_CONFIDENCE;
  return LOW_CONFIDENCE;
}

function describeDifference(offsetMinutes, isSingleDay) {
  if (!Number.isFinite(offsetMinutes)) return 'A comparison could not be calculated.';
  const rounded = Math.round(offsetMinutes);
  const abs = Math.abs(rounded);
  if (abs <= ALIGNMENT_THRESHOLD_MIN) {
    return isSingleDay
      ? 'Your sleep midpoint was closely aligned with your estimated body clock.'
      : 'Your selected range was closely aligned with your estimated body clock.';
  }
  const direction = rounded < 0 ? 'earlier' : 'later';
  return isSingleDay
    ? `Your sleep midpoint was ${abs} min ${direction} than your estimated body clock.`
    : `Your selected range averaged ${abs} min ${direction} than your estimated body clock.`;
}

export function computeBodyClockBaseline({ selectedDate, sleepModelRows = [] } = {}) {
  const allPrimary = selectPrimaryLongSleepByDay(sleepModelRows).filter((night) => !selectedDate || night.date <= selectedDate);
  const nightCount = allPrimary.length;
  if (nightCount < MIN_HISTORY_NIGHTS) {
    return {
      available: false,
      reason: nightCount === 0 ? 'missing_sleepmodel' : 'insufficient_history',
      nightCount,
      totalPrimaryNights: nightCount
    };
  }

  const last90 = nightCount >= STRONG_WINDOW_NIGHTS ? allPrimary.slice(-STRONG_WINDOW_NIGHTS) : allPrimary;
  const baselineNights = nightCount >= STRONG_WINDOW_NIGHTS
    ? last90.slice(0, Math.max(1, Math.round(last90.length * 0.8)))
    : last90;
  const baselineWindow = summarizeSleepWindow(baselineNights);
  const confidence = baselineConfidenceLabel(nightCount);

  return {
    available: true,
    baseline: baselineWindow,
    baselineChronotype: estimateChronotypeLabel(baselineWindow.midpointMinute),
    confidence,
    confidenceLabel: confidence === HIGH_CONFIDENCE
      ? 'Strong estimate from 90+ nights'
      : confidence === MEDIUM_CONFIDENCE
        ? 'Medium confidence estimate from available history'
        : 'Low confidence estimate (limited sleep history)',
    totalPrimaryNights: nightCount,
    baselineNightCount: baselineNights.length,
    baselineWindowStart: baselineNights[0]?.date || null,
    baselineWindowEnd: baselineNights.at(-1)?.date || null,
    allPrimary
  };
}

export function computeBodyClockOffset({
  selectedDate,
  rangeStartDate,
  rangeEndDate,
  sleepModelRows = []
} = {}) {
  const baselineModel = computeBodyClockBaseline({ selectedDate: rangeEndDate || selectedDate, sleepModelRows });
  if (!baselineModel.available) {
    const missingSleepModel = baselineModel.reason === 'missing_sleepmodel';
    return {
      display: {
        title: 'Estimated body clock',
        available: false,
        emptyStateMessage: missingSleepModel
          ? 'Body clock estimate unavailable. Sleep timing data was not found in this export.'
          : 'More sleep history is needed to estimate your body clock.'
      },
      debug: {
        metric: 'derivedBodyClockOffsetEstimate',
        reason: baselineModel.reason,
        primaryNightCount: baselineModel.nightCount
      }
    };
  }

  const primaryRows = baselineModel.allPrimary;
  const selectedStart = rangeStartDate || selectedDate;
  const selectedEnd = rangeEndDate || selectedDate;
  const selectedNights = primaryRows.filter((night) => (!selectedStart || night.date >= selectedStart) && (!selectedEnd || night.date <= selectedEnd));
  const selectedSummary = summarizeSleepWindow(selectedNights);
  const selectedMidpoint = selectedSummary.midpointMinute;
  const baselineMidpoint = baselineModel.baseline.midpointMinute;
  const offsetMinutes = Number.isFinite(selectedMidpoint) && Number.isFinite(baselineMidpoint)
    ? circularSignedDiffMinutes(selectedMidpoint, baselineMidpoint)
    : null;
  const isSingleDay = selectedStart && selectedEnd ? selectedStart === selectedEnd : Boolean(selectedDate);

  return {
    display: {
      title: 'Estimated body clock',
      available: true,
      estimatedChronotype: baselineModel.baselineChronotype,
      baselineMidpointClockMinutes: baselineMidpoint,
      selectedMidpointClockMinutes: selectedMidpoint,
      baselineBedtimeClockMinutes: baselineModel.baseline.bedtimeMinute,
      baselineWakeClockMinutes: baselineModel.baseline.wakeMinute,
      selectedBedtimeClockMinutes: selectedSummary.bedtimeMinute,
      selectedWakeClockMinutes: selectedSummary.wakeMinute,
      offsetMinutes,
      narrative: describeDifference(offsetMinutes, isSingleDay),
      confidence: baselineModel.confidence,
      confidenceLabel: baselineModel.confidenceLabel,
      nightCountLabel: `Based on ${baselineModel.totalPrimaryNights} primary long-sleep nights.`,
      baselineMidpointLabel: formatClockMinutes12h(baselineMidpoint),
      selectedMidpointLabel: formatClockMinutes12h(selectedMidpoint),
      baselineWindowLabel: `${formatClockMinutes12h(baselineModel.baseline.bedtimeMinute)}–${formatClockMinutes12h(baselineModel.baseline.wakeMinute)}`,
      selectedWindowLabel: `${formatClockMinutes12h(selectedSummary.bedtimeMinute)}–${formatClockMinutes12h(selectedSummary.wakeMinute)}`,
      estimateLabel: 'This is an estimate from your export, not an official Oura chronotype.'
    },
    debug: {
      metric: 'derivedBodyClockOffsetEstimate',
      selectedDate,
      rangeStartDate: selectedStart,
      rangeEndDate: selectedEnd,
      selectedMidpoint: formatClockMinutes(selectedMidpoint),
      baselineMidpoint: formatClockMinutes(baselineMidpoint),
      selectedNights: selectedNights.length,
      baselineNightCount: baselineModel.baselineNightCount,
      baselineWindowStart: baselineModel.baselineWindowStart,
      baselineWindowEnd: baselineModel.baselineWindowEnd,
      totalPrimaryNights: baselineModel.totalPrimaryNights,
      confidence: baselineModel.confidence
    }
  };
}
