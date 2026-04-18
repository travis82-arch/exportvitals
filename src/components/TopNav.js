import { navManifest } from '../nav/navManifest.js';

const toPagePath = (href) => (href === '/' ? '/index.html' : `${href}.html`);

export function renderTopNav(target, currentPath = window.location.pathname) {
  const mount = target || document.getElementById('topNav');
  if (!mount) return;

  const path = currentPath || '/';
  const tabs = navManifest
    .map((item) => {
      const pagePath = toPagePath(item.href);
      const active = path === item.href || path === pagePath;
      return `<a class="tab-link ${active ? 'active' : ''}" href="${pagePath}">${item.label}</a>`;
    })
    .join('');

  mount.innerHTML = `<div class="top-nav-title">Oura Dashboard</div><nav class="tabs" aria-label="Primary">${tabs}</nav>`;
}
