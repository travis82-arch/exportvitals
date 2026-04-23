const SELECTED_RANGE_KEY = 'ouraSelectedRangeV1';

export const RANGE_PRESETS = [
  { key: 'latest-day', label: 'Latest day', days: 1 },
  { key: 'last-7', label: 'Last 7 days', days: 7 },
  { key: 'last-14', label: 'Last 14 days', days: 14 },
  { key: 'last-30', label: 'Last 30 days', days: 30 },
  { key: 'custom', label: 'Custom…', days: null }
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
  if (chosenPreset === 'custom') {
    const preferredStart = typeof preferred?.start === 'string' ? preferred.start : null;
    const preferredEnd = typeof preferred?.end === 'string' ? preferred.end : null;
    if (preferredStart && preferredEnd && sorted.includes(preferredStart) && sorted.includes(preferredEnd)) {
      const start = preferredStart <= preferredEnd ? preferredStart : preferredEnd;
      const end = preferredEnd >= preferredStart ? preferredEnd : preferredStart;
      return {
        preset: chosenPreset,
        start,
        end,
        disabled: false,
        isSingleDay: start === end
      };
    }
  }

  const latest = sorted.at(-1);
  const days = PRESET_MAP[chosenPreset]?.days || 1;
  const startIndex = Math.max(0, sorted.length - days);
  const start = sorted[startIndex] || latest;
  const end = latest;

  return {
    preset: chosenPreset,
    start,
    end,
    disabled: false,
    isSingleDay: start === end
  };
}

function formatIsoLabel(dateText) {
  const dt = new Date(`${dateText}T12:00:00`);
  if (!Number.isFinite(dt.getTime())) return dateText;
  return dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function compactRangeLabel(range) {
  if (!range || !range.start || !range.end) return 'No data';
  if (range.preset !== 'custom') return PRESET_MAP[range.preset]?.label || 'Latest day';
  if (range.start === range.end) return `Custom · ${formatIsoLabel(range.start)}`;
  return `Custom · ${formatIsoLabel(range.start)}–${formatIsoLabel(range.end)}`;
}

export function summarizeRange(range) {
  if (!range || !range.start || !range.end) return 'No data loaded';
  if (range.start === range.end) return range.end;
  return `${range.start} → ${range.end}`;
}

export { SELECTED_RANGE_KEY };
