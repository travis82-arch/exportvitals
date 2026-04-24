import { navManifest } from '../nav/navManifest.js';

const toPagePath = (href) => `${href}/index.html`;
const normalizePath = (path) => String(path || '').replace(/\/$/, '') || '/';

function createMenuController({ mount, trigger, panel }) {
  let isOpen = false;

  const sync = () => {
    if (!panel || !trigger) return;
    panel.hidden = !isOpen;
    trigger.setAttribute('aria-expanded', String(isOpen));
    trigger.setAttribute('aria-label', isOpen ? 'Close utility menu' : 'Open utility menu');
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
  window.addEventListener('pagehide', onPageTransition);

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
      window.removeEventListener('pagehide', onPageTransition);
    }
  };
}

export function renderTopNav(target, {
  currentPath = window.location.pathname,
  onUpload = null,
  preferredTheme = 'light',
  onThemeChange = null
} = {}) {
  const mount = target || document.getElementById('topNav');
  if (!mount) return null;

  const path = currentPath || '/';
  const tabOptions = navManifest
    .map((item) => {
      const pagePath = toPagePath(item.href);
      const normalizedPath = normalizePath(path);
      const active = normalizedPath === normalizePath(item.href) || normalizedPath === normalizePath(pagePath);
      return `<option value="${pagePath}" data-destination="${item.key}" ${active ? 'selected' : ''}>${item.label}</option>`;
    })
    .join('');

  mount.innerHTML = `<div class="top-menu-wrap">
    <label class="sr-only" for="primaryTabSelect">Choose section</label>
    <select class="compact-select tab-select" id="primaryTabSelect" aria-label="Choose section">
      ${tabOptions}
    </select>
    <button class="menu-trigger" id="menuTrigger" type="button" aria-expanded="false" aria-controls="appMenuPanel" aria-label="Open utility menu">☰</button>
    <div class="menu-panel" id="appMenuPanel" hidden>
      <button class="menu-upload menu-item" id="menuUploadAction" type="button">Upload / Import data</button>
      <a class="menu-link menu-item" href="/app/about/index.html">About</a>
      <label class="menu-item menu-toggle-item" for="menuDarkModeToggle">
        <span>Dark Mode</span>
        <input id="menuDarkModeToggle" class="menu-toggle" type="checkbox" role="switch" ${preferredTheme === 'dark' ? 'checked' : ''} aria-label="Dark Mode">
      </label>
      <input id="menuUploadInput" type="file" accept=".zip,application/zip" hidden>
    </div>
  </div>`;

  const tabSelect = mount.querySelector('#primaryTabSelect');
  const trigger = mount.querySelector('#menuTrigger');
  const panel = mount.querySelector('#appMenuPanel');
  const uploadAction = mount.querySelector('#menuUploadAction');
  const uploadInput = mount.querySelector('#menuUploadInput');
  const darkModeToggle = mount.querySelector('#menuDarkModeToggle');
  const menu = createMenuController({ mount, trigger, panel });

  tabSelect?.addEventListener('change', () => {
    const next = tabSelect.value;
    if (!next) return;
    window.location.href = next;
  });

  trigger?.addEventListener('click', () => {
    menu.toggle();
  });

  mount.querySelectorAll('.menu-link').forEach((link) => {
    link.addEventListener('click', () => {
      menu.close();
    });
  });

  darkModeToggle?.addEventListener('change', () => {
    onThemeChange?.(darkModeToggle.checked ? 'dark' : 'light');
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
  if (typeof text === 'string') {
    if (status) status.textContent = text;
    return;
  }
  const phaseOrder = ['Reading ZIP', 'Parsing files', 'Computing metrics', 'Loading dashboard'];
  const phase = text?.phase || '';
  if (status) {
    status.textContent = text?.status === 'error'
      ? `Import failed: ${text?.message || 'Unknown error'}`
      : text?.status === 'success'
        ? 'Import complete.'
        : phase;
  }
}
