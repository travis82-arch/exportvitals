const SELECTED_DATE_KEY = 'ouraSelectedDateV1';

export function loadSelectedDate(storage = localStorage) {
  return storage.getItem(SELECTED_DATE_KEY) || null;
}

export function persistSelectedDate(date, storage = localStorage) {
  if (!date) return;
  storage.setItem(SELECTED_DATE_KEY, date);
}

export function resolveInitialSelectedDate(availableDates, preferredDate = null) {
  const sorted = [...new Set((availableDates || []).filter(Boolean))].sort();
  if (preferredDate && sorted.includes(preferredDate)) return preferredDate;
  return sorted.at(-1) || new Date().toISOString().slice(0, 10);
}

export function getLastAvailableDays(availableDates, count = 7) {
  const sorted = [...new Set((availableDates || []).filter(Boolean))].sort();
  return sorted.slice(-count);
}

export { SELECTED_DATE_KEY };
