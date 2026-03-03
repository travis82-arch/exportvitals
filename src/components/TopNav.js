import { navManifest } from '../nav/navManifest.js';

export function renderTopNav(target, currentPath) {
  const mount = target || document.getElementById('topNav') || document.body;
  const tabs = navManifest
    .map((item) => {
      const active = currentPath.endsWith(item.href);
      return `<a class="btn tab-link ${active ? 'active' : ''}" href="${item.href}">${item.label}</a>`;
    })
    .join('');

  mount.innerHTML = `<div class="title">Oura Dashboard</div><div class="tabs">${tabs}</div><div class="row"><a class="btn" href="/data-tools-import.html">Import</a><label class="btn secondary" for="globalImportInput">Quick Import</label><input id="globalImportInput" type="file" accept=".zip,application/zip" style="position:fixed; left:-9999px; opacity:0; width:1px; height:1px;" /></div>`;
}
