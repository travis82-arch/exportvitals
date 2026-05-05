const THEME_KEY = 'ouraDashboardThemeV1';
const THEME_OPTIONS = new Set(['dark', 'light']);

function resolveStoredTheme(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.getItem) return 'dark';
  const raw = storage.getItem(THEME_KEY);
  if (raw === 'dark' || raw === 'light') return raw;
  return 'dark';
}

export function applyTheme(mode, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const preferred = THEME_OPTIONS.has(mode) ? mode : 'dark';
  document.documentElement.setAttribute('data-theme', preferred);
  document.body?.setAttribute('data-theme', preferred);
  document.documentElement.style.colorScheme = preferred;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', preferred === 'light' ? '#f3f7ff' : '#0b0f14');
  if (storage?.setItem) storage.setItem(THEME_KEY, preferred);
  return { preferred, effective: preferred };
}

export function initTheme(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  return applyTheme(resolveStoredTheme(storage), storage);
}

export function getPreferredTheme(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  return resolveStoredTheme(storage);
}
