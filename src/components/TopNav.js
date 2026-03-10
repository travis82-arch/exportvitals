import { navManifest } from '../nav/navManifest.js';

export function renderTopNav(target, currentPath) {
  const mount = target || document.getElementById('topNav') || document.body;
  const tabs = navManifest
    .map((item) => {
      const active = currentPath.endsWith(item.href);
      return `<a class="btn tab-link ${active ? 'active' : ''}" href="${item.href}">${item.label}</a>`;
    })
    .join('');

  mount.innerHTML = `<div class="title">Oura Dashboard</div><div class="tabs">${tabs}</div><div class="row"><input id="globalImportInput" type="file" accept=".zip,application/zip" style="position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;" /><label class="icon-btn" for="globalImportInput" title="Import ZIP" aria-label="Import ZIP">&#x2B71;</label></div>`;
}
