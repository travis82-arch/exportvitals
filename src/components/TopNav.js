import { navManifest } from '../nav/navManifest.js';

const toPagePath = (href) => (href === '/' ? '/index.html' : `${href}.html`);

function createMenuController({ mount, trigger, panel }) {
  let isOpen = false;

  const sync = () => {
    if (!panel || !trigger) return;
    panel.hidden = !isOpen;
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  };

  const setOpen = (next) => {
    isOpen = Boolean(next);
    sync();
  };

  const onDocumentPointerDown = (event) => {
    if (!isOpen) return;
    if (!mount?.contains(event.target)) setOpen(false);
  };

  const onEscape = (event) => {
    if (event.key !== 'Escape') return;
    if (!isOpen) return;
    setOpen(false);
    trigger?.focus();
  };

  const onPageTransition = () => setOpen(false);

  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('keydown', onEscape);
  window.addEventListener('popstate', onPageTransition);
  window.addEventListener('pageshow', onPageTransition);

  sync();

  return {
    isOpen: () => isOpen,
    toggle() {
      setOpen(!isOpen);
    },
    close() {
      setOpen(false);
    },
    destroy() {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      document.removeEventListener('keydown', onEscape);
      window.removeEventListener('popstate', onPageTransition);
      window.removeEventListener('pageshow', onPageTransition);
    }
  };
}

export function renderTopNav(target, { currentPath = window.location.pathname, onUpload = null } = {}) {
  const mount = target || document.getElementById('topNav');
  if (!mount) return null;

  const path = currentPath || '/';
  const links = navManifest
    .map((item) => {
      const pagePath = toPagePath(item.href);
      const active = path === item.href || path === pagePath;
      return `<a class="menu-link ${active ? 'active' : ''}" href="${pagePath}" data-destination="${item.key}">${item.label}</a>`;
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
  const menu = createMenuController({ mount, trigger, panel });

  trigger?.addEventListener('click', () => menu.toggle());

  mount.querySelectorAll('.menu-link').forEach((link) => {
    link.addEventListener('click', () => menu.close());
  });

  uploadAction?.addEventListener('click', () => {
    menu.close();
    uploadInput?.click();
  });

  uploadInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUpload) return;
    menu.close();
    await onUpload(file);
  });

  return menu;
}

export function setTopNavUploadStatus(text = '') {
  const status = document.getElementById('menuUploadStatus');
  if (status) status.textContent = text;
}
