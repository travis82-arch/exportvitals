import { navManifest } from '../nav/navManifest.js';

export function renderTopNav(target, currentPath) {
  const mount = target || document.getElementById('topNav') || document.body;
  const tabs = navManifest
    .map((item) => {
      const active = currentPath.endsWith(item.href);
      return `<a class="btn tab-link ${active ? 'active' : ''}" href="${item.href}">${item.label}</a>`;
    })
    .join('');

  mount.innerHTML = `<div class="title">Oura Dashboard</div><div class="tabs">${tabs}</div><div class="row"><button class="icon-btn" id="globalImportBtn" title="Import ZIP" aria-label="Import ZIP">⭱</button></div>`;
}
