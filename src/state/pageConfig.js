export function shouldRenderDateRangeForPage(pageKey) {
  return pageKey !== 'debug';
}

export function shouldRenderIntroBanner(pageKey) {
  return false;
}
