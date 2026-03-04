import { resetLocalData } from '../storage/resetLocalData.js';
import { getBuildStamp } from '../buildStamp.js';

const OVERLAY_ID = 'fatalOverlay';

function summarizeError(error) {
  if (!error) return 'Unknown startup error';
  if (typeof error === 'string') return error;
  return error.message || error.reason?.message || String(error);
}

function diagnosticPayload(error, context = {}) {
  const err = error?.reason || error;
  return {
    context,
    build: getBuildStamp(),
    userAgent: navigator.userAgent,
    location: window.location.href,
    error: {
      name: err?.name || 'Error',
      message: err?.message || summarizeError(err),
      stack: err?.stack || null
    },
    timestamp: new Date().toISOString()
  };
}

function cacheBustReload() {
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now());
  window.location.href = `${url.pathname}${url.search}${url.hash}`;
}

function isChunkLoadFailure(message = '') {
  return [
    'Loading chunk',
    'Importing a module script failed',
    'Failed to fetch dynamically imported module'
  ].some((token) => message.includes(token));
}

export function showFatalOverlay(error, context = {}) {
  const existing = document.getElementById(OVERLAY_ID);
  if (existing) existing.remove();

  const summary = summarizeError(error);
  const staleCache = isChunkLoadFailure(summary);
  const panel = document.createElement('div');
  panel.id = OVERLAY_ID;
  panel.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#05070b;color:#fff;padding:24px;font-family:system-ui,sans-serif;overflow:auto;';
  panel.innerHTML = `
    <div style="max-width:760px;margin:0 auto;background:#111;border:1px solid #444;border-radius:12px;padding:20px;">
      <h1 style="margin:0 0 8px;font-size:24px;">App failed to load</h1>
      <p style="margin:0 0 12px;color:#ddd;">${staleCache ? 'Stale cache after deploy detected. Try a cache-busted reload first.' : 'A runtime error interrupted app startup.'}</p>
      <pre style="white-space:pre-wrap;background:#1b1b1b;padding:10px;border-radius:8px;border:1px solid #333;">${summary}</pre>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;">
        <button data-action="close" style="padding:10px 14px;border-radius:8px;border:1px solid #666;background:transparent;color:#fff;cursor:pointer;">Close</button>
        <button data-action="reload" style="padding:10px 14px;border-radius:8px;border:0;background:#2f7cf6;color:#fff;cursor:pointer;">Reload (cache-bust)</button>
        <button data-action="reset" style="padding:10px 14px;border-radius:8px;border:0;background:#d97706;color:#fff;cursor:pointer;">Reset local data + reload</button>
        <button data-action="copy" style="padding:10px 14px;border-radius:8px;border:1px solid #666;background:transparent;color:#fff;cursor:pointer;">Copy diagnostics</button>
      </div>
    </div>`;

  panel.addEventListener('click', async (event) => {
    const action = event.target?.dataset?.action;
    if (action === 'close') panel.remove();
    if (action === 'reload') cacheBustReload();
    if (action === 'reset') {
      resetLocalData();
      cacheBustReload();
    }
    if (action === 'copy') {
      const diagnostics = JSON.stringify(diagnosticPayload(error, context), null, 2);
      await navigator.clipboard.writeText(diagnostics);
      event.target.textContent = 'Diagnostics copied';
    }
  });

  document.body.appendChild(panel);
}

export function installGlobalErrorHandlers() {
  window.onerror = (message, source, lineno, colno, error) => {
    showFatalOverlay(error || message, { type: 'window.onerror', source, lineno, colno });
    return false;
  };

  window.onunhandledrejection = (event) => {
    showFatalOverlay(event.reason || event, { type: 'window.onunhandledrejection' });
  };
}
