const SELECTED_DATE_KEY = 'ouraSelectedDateV1';

export function loadSelectedDate(storage = localStorage) {
  return storage.getItem(SELECTED_DATE_KEY) || null;
}

export function persistSelectedDate(date, storage = localStorage) {
  if (!date) return;
  storage.setItem(SELECTED_DATE_KEY, date);
}

export function resolveInitialSelectedDate(availableDates, fallbackDates = [], today = new Date().toISOString().slice(0, 10), preferredDate = null) {
  const unique = [...new Set([...(availableDates || []), ...(fallbackDates || [])].filter(Boolean))].sort();
  if (preferredDate && unique.includes(preferredDate)) return preferredDate;
  return unique.at(-1) || today;
}

export { SELECTED_DATE_KEY };
