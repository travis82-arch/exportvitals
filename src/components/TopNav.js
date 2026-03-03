import { navManifest } from '../nav/navManifest.js';

export function renderTopNav(target, currentPath, developerMode = false) {
  const links = navManifest.filter((item) => developerMode || !item.debugOnly);
  const tabs = links.map((item) => {
    const active = currentPath.endsWith(item.href);
    return `<a class="tab-link ${active ? 'active' : ''}" href="${item.href}">${item.label}</a>`;
  }).join('');

  target.innerHTML = `<div class="tabs">${tabs}</div><button class="icon-btn" id="globalImportBtn" aria-label="Import Oura ZIP" title="Import Oura ZIP">⇪</button>`;
}
