import { navManifest } from '../nav/navManifest.js';

const toPagePath = (href) => (href === '/' ? '/index.html' : `${href}.html`);

export function renderTopNav(target, { currentPath = window.location.pathname, onUpload = null } = {}) {
  const mount = target || document.getElementById('topNav');
  if (!mount) return;

  const path = currentPath || '/';
  const links = navManifest
    .map((item) => {
      const pagePath = toPagePath(item.href);
      const active = path === item.href || path === pagePath;
      return `<a class="menu-link ${active ? 'active' : ''}" href="${pagePath}">${item.label}</a>`;
    })
    .join('');

  mount.innerHTML = `<div class="top-menu-wrap">
    <button class="menu-trigger" id="menuTrigger" type="button" aria-expanded="false" aria-controls="appMenuPanel" aria-label="Open menu">☰</button>
    <div class="menu-panel" id="appMenuPanel" hidden>
      <button class="menu-upload" id="menuUploadAction" type="button">Upload</button>
      <input id="menuUploadInput" type="file" accept=".zip,application/zip" hidden>
      <div class="menu-upload-status small muted" id="menuUploadStatus"></div>
      <nav class="menu-links" aria-label="Primary">${links}</nav>
    </div>
  </div>`;

  const trigger = mount.querySelector('#menuTrigger');
  const panel = mount.querySelector('#appMenuPanel');
  const uploadAction = mount.querySelector('#menuUploadAction');
  const uploadInput = mount.querySelector('#menuUploadInput');

  const closeMenu = () => {
    if (!panel || !trigger) return;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger?.addEventListener('click', () => {
    if (!panel || !trigger) return;
    const nextHidden = !panel.hidden;
    panel.hidden = nextHidden;
    trigger.setAttribute('aria-expanded', String(!nextHidden));
  });

  document.addEventListener('click', (event) => {
    if (!panel || panel.hidden) return;
    if (mount.contains(event.target)) return;
    closeMenu();
  });

  mount.querySelectorAll('.menu-link').forEach((link) => {
    link.addEventListener('click', () => closeMenu());
  });

  uploadAction?.addEventListener('click', () => uploadInput?.click());
  uploadInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUpload) return;
    closeMenu();
    await onUpload(file);
  });
}

export function setTopNavUploadStatus(text = '') {
  const status = document.getElementById('menuUploadStatus');
  if (status) status.textContent = text;
}
