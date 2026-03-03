import { resetLocalData } from '../storage/resetLocalData.js';

function cacheBustReload() {
  const url = new URL(window.location.href);
  url.searchParams.set('v', Date.now());
  window.location.href = `${url.pathname}${url.search}${url.hash}`;
}

export function renderBootErrorBoundary(error) {
  const root = document.getElementById('appRoot') || document.body;
  const summary = error?.message || String(error);
  root.innerHTML = `
    <section style="max-width:740px;margin:32px auto;padding:20px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;">
      <h2 style="margin:0 0 8px;">Something went wrong while rendering the app.</h2>
      <p style="margin:0 0 12px;color:#444;">You can reset local data and try again.</p>
      <pre style="white-space:pre-wrap;background:#f9fafb;padding:10px;border-radius:8px;border:1px solid #eee;">${summary}</pre>
      <div style="display:flex;gap:10px;margin-top:14px;">
        <button id="boundaryReset" style="padding:10px 14px;">Reset local data</button>
        <button id="boundaryReload" style="padding:10px 14px;">Reload</button>
      </div>
    </section>`;

  document.getElementById('boundaryReset')?.addEventListener('click', () => {
    resetLocalData();
    cacheBustReload();
  });
  document.getElementById('boundaryReload')?.addEventListener('click', cacheBustReload);
}
