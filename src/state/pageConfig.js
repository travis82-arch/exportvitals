export function shouldRenderDateRangeForPage(pageKey) {
  return pageKey !== 'settings';
}

export function shouldRenderIntroBanner(pageKey) {
  return false;
}
