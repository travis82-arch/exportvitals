const MAX_DIAGNOSTIC_ITEMS = 30;

function getDiagStore() {
  if (!window.__ouraDiag) {
    window.__ouraDiag = {
      errors: [],
      rejections: [],
      clicks: [],
      overlayProbe: {}
    };
  }
  return window.__ouraDiag;
}

function pushBounded(list, value, max = MAX_DIAGNOSTIC_ITEMS) {
  list.push(value);
  if (list.length > max) list.splice(0, list.length - max);
}

function describeElement(el) {
  if (!el || el.nodeType !== 1) return null;
  return {
    tag: (el.tagName || '').toLowerCase(),
    id: el.id || '',
    className: typeof el.className === 'string' ? el.className : ''
  };
}

function runOverlayProbe(diag) {
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  const points = [
    { x: 20, y: 20 },
    { x: Math.floor(width / 2), y: Math.floor(height / 2) },
    { x: Math.max(0, width - 20), y: 20 }
  ];

  const results = points.map((point) => {
    const node = document.elementFromPoint(point.x, point.y);
    return {
      ...point,
      element: describeElement(node)
    };
  });

  diag.overlayProbe = {
    time: new Date().toISOString(),
    viewport: { width, height },
    points: results
  };
  return diag.overlayProbe;
}

function createDiagnosticsPanel(diag) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'diagButton';
  button.className = 'diag-button';
  button.textContent = 'Diag';

  const panel = document.createElement('section');
  panel.id = 'diagPanel';
  panel.className = 'diag-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="diag-header">
      <h3>Diagnostics</h3>
      <button type="button" class="btn secondary" data-action="close">Close</button>
    </div>
    <div class="small muted" data-role="errors"></div>
    <div class="small muted" data-role="rejections"></div>
    <h4>Last 10 clicks</h4>
    <pre class="status diag-pre" data-role="clicks"></pre>
    <h4>Overlay probe</h4>
    <pre class="status diag-pre" data-role="probe"></pre>
    <div class="row">
      <button type="button" class="btn" data-action="probe">Refresh probe</button>
      <button type="button" class="btn secondary" data-action="copy">Copy diagnostics</button>
    </div>
  `;

  function renderPanel() {
    const lastError = diag.errors.at(-1) || null;
    const lastRejection = diag.rejections.at(-1) || null;
    const lastClicks = diag.clicks.slice(-10);
    panel.querySelector('[data-role="errors"]').textContent =
      `Last error: ${lastError ? `${lastError.message} @ ${lastError.time}` : 'none'}`;
    panel.querySelector('[data-role="rejections"]').textContent =
      `Last rejection: ${lastRejection ? `${lastRejection.message} @ ${lastRejection.time}` : 'none'}`;
    panel.querySelector('[data-role="clicks"]').textContent = JSON.stringify(lastClicks, null, 2);
    panel.querySelector('[data-role="probe"]').textContent = JSON.stringify(diag.overlayProbe || {}, null, 2);
  }

  button.addEventListener('click', () => {
    runOverlayProbe(diag);
    renderPanel();
    panel.hidden = false;
  });

  panel.addEventListener('click', async (event) => {
    const action = event.target?.dataset?.action;
    if (!action) return;
    if (action === 'close') {
      panel.hidden = true;
      return;
    }
    if (action === 'probe') {
      runOverlayProbe(diag);
      renderPanel();
      return;
    }
    if (action === 'copy') {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      event.target.textContent = 'Copied';
      setTimeout(() => {
        event.target.textContent = 'Copy diagnostics';
      }, 1200);
    }
  });

  document.body.appendChild(button);
  document.body.appendChild(panel);
}

export function installRuntimeDiagnostics() {
  const diag = getDiagStore();
  runOverlayProbe(diag);

  window.addEventListener('error', (event) => {
    const err = event.error || {};
    pushBounded(diag.errors, {
      time: new Date().toISOString(),
      message: err.message || event.message || 'Unknown error',
      stack: err.stack || null,
      source: event.filename || null,
      lineno: event.lineno || null,
      colno: event.colno || null
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    pushBounded(diag.rejections, {
      time: new Date().toISOString(),
      message: reason?.message || String(reason || 'Unhandled rejection'),
      stack: reason?.stack || null
    });
  });

  window.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      const anchor = target?.closest ? target.closest('a') : null;
      pushBounded(diag.clicks, {
        time: new Date().toISOString(),
        tag: target?.tagName ? target.tagName.toLowerCase() : '',
        id: target?.id || '',
        className: typeof target?.className === 'string' ? target.className : '',
        href: anchor?.href || target?.href || '',
        defaultPrevented: Boolean(event.defaultPrevented),
        clientX: Number(event.clientX) || 0,
        clientY: Number(event.clientY) || 0
      });
    },
    true
  );

  createDiagnosticsPanel(diag);
}
