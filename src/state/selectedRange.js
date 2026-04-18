const SELECTED_RANGE_KEY = 'ouraSelectedRangeV1';

export const RANGE_PRESETS = [
  { key: 'latest-day', label: 'Latest day', days: 1 },
  { key: 'last-7', label: 'Last 7 days', days: 7 },
  { key: 'last-14', label: 'Last 14 days', days: 14 },
  { key: 'last-30', label: 'Last 30 days', days: 30 },
  { key: 'last-90', label: 'Last 90 days', days: 90 },
  { key: 'custom', label: 'Custom range', days: null }
];

const PRESET_MAP = Object.fromEntries(RANGE_PRESETS.map((preset) => [preset.key, preset]));

function sortDates(availableDates) {
  return [...new Set((availableDates || []).filter(Boolean))].sort();
}

function coercePreset(preset) {
  return PRESET_MAP[preset] ? preset : 'latest-day';
}

export function loadSelectedRange(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.getItem) return null;
  try {
    const parsed = JSON.parse(storage.getItem(SELECTED_RANGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      preset: coercePreset(parsed.preset),
      start: typeof parsed.start === 'string' ? parsed.start : null,
      end: typeof parsed.end === 'string' ? parsed.end : null
    };
  } catch {
    return null;
  }
}

export function persistSelectedRange(range, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.setItem || !range) return;
  storage.setItem(SELECTED_RANGE_KEY, JSON.stringify(range));
}

export function resolveSelectedRange(availableDates, preferred = null) {
  const sorted = sortDates(availableDates);
  if (!sorted.length) {
    return {
      preset: coercePreset(preferred?.preset),
      start: null,
      end: null,
      disabled: true,
      isSingleDay: false
    };
  }

  const chosenPreset = coercePreset(preferred?.preset);
  const latest = sorted.at(-1);
  if (chosenPreset !== 'custom') {
    const days = PRESET_MAP[chosenPreset]?.days || 1;
    const startIndex = Math.max(0, sorted.length - days);
    const start = sorted[startIndex] || latest;
    return {
      preset: chosenPreset,
      start,
      end: latest,
      disabled: false,
      isSingleDay: start === latest
    };
  }

  let start = preferred?.start;
  let end = preferred?.end;
  if (!start || !sorted.includes(start)) start = sorted[0];
  if (!end || !sorted.includes(end)) end = latest;
  if (start > end) [start, end] = [end, start];

  const first = sorted[0];
  if (start < first) start = first;
  if (end > latest) end = latest;

  return {
    preset: 'custom',
    start,
    end,
    disabled: false,
    isSingleDay: start === end
  };
}

export function summarizeRange(range) {
  if (!range || !range.start || !range.end) return 'No data loaded';
  if (range.start === range.end) return `Single day: ${range.end}`;
  return `${range.start} → ${range.end}`;
}

export { SELECTED_RANGE_KEY };
