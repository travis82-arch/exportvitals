const SETTINGS_KEY = 'ouraDashboardSettingsV2';

export const SETTINGS_DEFAULTS = {
  baselineWindow: 14,
  nightWindowMode: 'auto',
  fallbackStart: '21:00',
  fallbackEnd: '09:00',
  developerMode: false
};

export function loadSettings(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.getItem) return { ...SETTINGS_DEFAULTS };
  try {
    return { ...SETTINGS_DEFAULTS, ...(JSON.parse(storage.getItem(SETTINGS_KEY) || '{}')) };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(next, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.setItem) return { ...SETTINGS_DEFAULTS, ...(next || {}) };
  const merged = { ...SETTINGS_DEFAULTS, ...(next || {}) };
  storage.setItem(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

