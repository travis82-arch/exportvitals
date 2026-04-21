const THEME_KEY = 'ouraDashboardThemeV1';
const THEME_OPTIONS = new Set(['dark', 'light', 'system']);

function resolveStoredTheme(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  if (!storage?.getItem) return 'dark';
  const raw = storage.getItem(THEME_KEY);
  return THEME_OPTIONS.has(raw) ? raw : 'dark';
}

function resolveEffectiveTheme(preferred) {
  if (preferred === 'system') {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  }
  return preferred === 'light' ? 'light' : 'dark';
}

export function applyTheme(mode, storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  const preferred = THEME_OPTIONS.has(mode) ? mode : 'dark';
  const effective = resolveEffectiveTheme(preferred);
  document.documentElement.setAttribute('data-theme', effective);
  document.body?.setAttribute('data-theme', effective);
  document.documentElement.style.colorScheme = effective;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effective === 'light' ? '#edf2fb' : '#0b0f14');
  if (storage?.setItem) storage.setItem(THEME_KEY, preferred);
  return { preferred, effective };
}

export function initTheme(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  return applyTheme(resolveStoredTheme(storage), storage);
}

export function getPreferredTheme(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
  return resolveStoredTheme(storage);
}
