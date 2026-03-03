const FALLBACK_BUILD = 'dev';

export function getBuildStamp() {
  return window.__OURA_BUILD_STAMP__ || document.documentElement.dataset.buildStamp || FALLBACK_BUILD;
}
