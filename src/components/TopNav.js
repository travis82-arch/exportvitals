import { getPublicRepoUrl } from '../config/siteCopy.js';
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
  preferredTheme = 'dark',
  onThemeChange = null
} = {}) {
  const mount = target || document.getElementById('topNav');
  if (!mount) return null;
  const publicRepoUrl = getPublicRepoUrl();

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
      <div class="menu-theme-group">
        <button class="menu-item menu-theme-trigger" id="menuThemeTrigger" type="button" aria-expanded="false" aria-controls="menuThemeOptions">
          <span>Theme</span>
          <span class="menu-theme-value">${preferredTheme === 'light' ? 'Light' : 'Dark'}</span>
        </button>
        <div class="menu-theme-options" id="menuThemeOptions" hidden>
          <button class="menu-item menu-theme-option ${preferredTheme === 'dark' ? 'active' : ''}" data-theme-option="dark" type="button" aria-pressed="${preferredTheme === 'dark' ? 'true' : 'false'}">Dark</button>
          <button class="menu-item menu-theme-option ${preferredTheme === 'light' ? 'active' : ''}" data-theme-option="light" type="button" aria-pressed="${preferredTheme === 'light' ? 'true' : 'false'}">Light</button>
        </div>
      </div>
      ${publicRepoUrl
        ? `<a class="menu-link menu-item" href="${publicRepoUrl}" target="_blank" rel="noreferrer">Public repo</a>`
        : '<button class="menu-item menu-link" type="button" disabled aria-label="Public repo coming soon">Public repo</button>'}
      <a class="menu-link menu-item" href="/">Landing page</a>
      <input id="menuUploadInput" type="file" accept=".zip,application/zip" hidden>
      <progress id="menuUploadProgress" class="menu-upload-progress" value="0" max="4" hidden></progress>
      <div class="menu-upload-status small muted" id="menuUploadStatus"></div>
    </div>
  </div>`;

  const tabSelect = mount.querySelector('#primaryTabSelect');
  const trigger = mount.querySelector('#menuTrigger');
  const panel = mount.querySelector('#appMenuPanel');
  const uploadAction = mount.querySelector('#menuUploadAction');
  const uploadInput = mount.querySelector('#menuUploadInput');
  const themeTrigger = mount.querySelector('#menuThemeTrigger');
  const themeOptions = mount.querySelector('#menuThemeOptions');
  const themeValue = mount.querySelector('.menu-theme-value');
  const menu = createMenuController({ mount, trigger, panel });

  const setThemeExpanded = (expanded) => {
    if (!themeTrigger || !themeOptions) return;
    themeTrigger.setAttribute('aria-expanded', String(Boolean(expanded)));
    themeOptions.hidden = !expanded;
  };

  tabSelect?.addEventListener('change', () => {
    const next = tabSelect.value;
    if (!next) return;
    window.location.href = next;
  });

  trigger?.addEventListener('click', () => {
    if (menu.isOpen()) setThemeExpanded(false);
    menu.toggle();
  });

  mount.querySelectorAll('.menu-link').forEach((link) => {
    link.addEventListener('click', () => {
      setThemeExpanded(false);
      menu.close();
    });
  });
  themeTrigger?.addEventListener('click', () => {
    setThemeExpanded(themeOptions?.hidden);
  });
  mount.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => {
      const nextTheme = button.getAttribute('data-theme-option');
      if (!nextTheme) return;
      onThemeChange?.(nextTheme);
      themeValue.textContent = nextTheme === 'light' ? 'Light' : 'Dark';
      mount.querySelectorAll('[data-theme-option]').forEach((option) => {
        const isActive = option.getAttribute('data-theme-option') === nextTheme;
        option.classList.toggle('active', isActive);
        option.setAttribute('aria-pressed', String(isActive));
      });
      setThemeExpanded(false);
    });
  });

  uploadAction?.addEventListener('click', () => {
    setThemeExpanded(false);
    menu.close();
    uploadInput?.click();
  });

  uploadInput?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUpload) return;
    setThemeExpanded(false);
    menu.close();
    await onUpload(file);
  });

  return menu;
}

export function setTopNavUploadStatus(text = '') {
  const status = document.getElementById('menuUploadStatus');
  const progress = document.getElementById('menuUploadProgress');
  if (typeof text === 'string') {
    if (status) status.textContent = text;
    if (progress) progress.hidden = true;
    return;
  }
  const phaseOrder = ['Reading ZIP', 'Parsing files', 'Computing metrics', 'Loading dashboard'];
  const phase = text?.phase || '';
  const phaseIndex = phaseOrder.indexOf(phase);
  if (status) {
    status.textContent = text?.status === 'error'
      ? `Import failed: ${text?.message || 'Unknown error'}`
      : text?.status === 'success'
        ? 'Import complete.'
        : phase;
  }
  if (progress) {
    progress.hidden = !(text?.status === 'loading');
    progress.max = phaseOrder.length;
    progress.value = phaseIndex >= 0 ? phaseIndex + 1 : 1;
  }
}
