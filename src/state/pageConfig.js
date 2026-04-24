const PAGES_WITHOUT_RANGE_CONTROL = new Set(['debug', 'about', 'settings']);

export function shouldRenderDateRangeForPage(pageKey) {
  return !PAGES_WITHOUT_RANGE_CONTROL.has(pageKey);
}

export function shouldRenderIntroBanner(pageKey) {
  return false;
}
