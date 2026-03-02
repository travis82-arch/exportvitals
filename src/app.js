// Minimal local-first starter (no external dependencies).
// Next step will add ZIP parsing (e.g., with a small library) and CSV parsing,
// but this starter keeps things simple so Cloudflare Pages can deploy without a build.

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installBtn');
  btn.hidden = false;
  btn.addEventListener('click', async () => {
    btn.hidden = true;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }, { once: true });
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js');
  });
}

const zipInput = document.getElementById('zipInput');
const clearBtn = document.getElementById('clearBtn');
const status = document.getElementById('status');

function setStatus(msg) {
  status.textContent = msg;
}

zipInput.addEventListener('change', () => {
  const f = zipInput.files?.[0];
  if (!f) {
    setStatus('No file selected.');
    return;
  }
  const mb = (f.size / (1024 * 1024)).toFixed(2);
  setStatus(`Selected: ${f.name} (${mb} MB). Ready to parse in the next step.`);
});

clearBtn.addEventListener('click', () => {
  zipInput.value = '';
  setStatus('Cleared. No file selected.');
});

// Placeholder KPI values (will be replaced after parsing)
document.getElementById('kpiReadiness').textContent = '—';
document.getElementById('kpiSleep').textContent = '—';
document.getElementById('kpiHrv').textContent = '—';
document.getElementById('kpiRhr').textContent = '—';
