import { getBuildStamp } from '../buildStamp.js';
import { showFatalOverlay } from '../boot/fatalOverlay.js';
import { resetLocalData } from '../storage/resetLocalData.js';

function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** idx)).toFixed(idx ? 1 : 0)} ${units[idx]}`;
}

export function createImportController({ importZip, onImported, onStateChange }) {
  const state = {
    status: 'idle',
    selectedFile: null,
    phase: 'Idle',
    percent: 0,
    result: null,
    error: null,
    lastProgressPhase: null
  };

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `<div class="card modal-card import-modal">
    <div class="row split-row"><h2>Import Oura ZIP</h2><button class="btn secondary" data-action="close">Close</button></div>
    <input type="file" accept=".zip,application/zip" hidden data-role="file-input" />
    <div data-role="content"></div>
  </div>`;

  document.body.appendChild(modal);
  const input = modal.querySelector('[data-role="file-input"]');
  const content = modal.querySelector('[data-role="content"]');

  function notify() {
    if (onStateChange) onStateChange({ ...state });
  }

  function diagnosticsPayload() {
    return {
      build: getBuildStamp(),
      userAgent: navigator.userAgent,
      lastProgressPhase: state.lastProgressPhase,
      parsedFiles: state.result?.parsedFiles || [],
      file: state.selectedFile ? { name: state.selectedFile.name, size: state.selectedFile.size } : null,
      error: state.error
    };
  }

  async function copyDiagnostics(button) {
    await navigator.clipboard.writeText(JSON.stringify(diagnosticsPayload(), null, 2));
    button.textContent = 'Diagnostics copied';
  }

  function setState(next) {
    Object.assign(state, next);
    render();
    notify();
  }

  function render() {
    const summary = state.result
      ? `<div class="status top-gap">Imported ${state.result.dateRange?.days || 0} days\nRange: ${state.result.dateRange?.start || '—'} → ${state.result.dateRange?.end || '—'}\nRows: ${JSON.stringify(state.result.rowCounts || {}, null, 2)}</div>`
      : '';

    if (state.status === 'error') {
      content.innerHTML = `<p class="muted">Import failed. Nothing was silently ignored.</p>
      <div class="status">${state.error?.message || 'Unknown error'}\n\n${state.error?.stack || ''}</div>
      <div class="row top-gap">
        <button class="btn" data-action="retry">Retry</button>
        <button class="btn secondary" data-action="copy">Copy diagnostics</button>
        <button class="btn secondary" data-action="reset">Reset local data</button>
      </div>`;
      return;
    }

    if (state.status === 'success') {
      content.innerHTML = `<p>Imported successfully ✓</p>${summary}
      <div class="row top-gap">
        <button class="btn" data-action="go-date">Go to By Date</button>
        <button class="btn secondary" data-action="pick">Import another ZIP</button>
      </div>`;
      return;
    }

    if (state.status === 'importing') {
      content.innerHTML = `<p>Importing… ${state.phase}</p>
      <div class="progress"><span style="width:${state.percent}%"></span></div>
      <p class="small muted">${state.percent}%</p>
      <p class="small muted">Selected file: ${state.selectedFile?.name || '—'} (${formatBytes(state.selectedFile?.size)})</p>`;
      return;
    }

    if (state.status === 'selected') {
      content.innerHTML = `<p>Selected file:</p>
      <div class="status">${state.selectedFile?.name || '—'} (${formatBytes(state.selectedFile?.size)})</div>
      <div class="row top-gap"><button class="btn" data-action="start">Start import</button><button class="btn secondary" data-action="pick">Choose different ZIP</button></div>`;
      return;
    }

    content.innerHTML = `<p>Import Oura ZIP from any page.</p>
      <div class="row"><button class="btn" data-action="pick">Choose ZIP</button></div>`;
  }

  async function handleFile(file) {
    if (!file) return;
    setState({ status: 'selected', selectedFile: file, error: null, result: null, phase: 'Selected', percent: 0 });
    setState({ status: 'importing', phase: 'Reading ZIP', percent: 5, lastProgressPhase: 'Reading ZIP' });
    try {
      const result = await importZip(file, (progress) => {
        setState({
          status: progress.status,
          phase: progress.phase,
          percent: progress.percent,
          lastProgressPhase: progress.phase
        });
      });
      setState({ status: 'success', result, phase: 'Done', percent: 100 });
      if (onImported) onImported(result, file);
    } catch (error) {
      const err = { message: error?.message || String(error), stack: error?.stack || null };
      setState({ status: 'error', error: err });
      showFatalOverlay(error, {
        type: 'importZip',
        build: getBuildStamp(),
        lastProgressPhase: state.lastProgressPhase,
        parsedFiles: state.result?.parsedFiles || []
      });
    }
  }

  input.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    await handleFile(file);
  });

  modal.addEventListener('click', async (event) => {
    const action = event.target?.dataset?.action;
    if (!action) return;
    if (action === 'close') {
      modal.classList.remove('open');
      return;
    }
    if (action === 'pick') {
      input.click();
      return;
    }
    if (action === 'start') {
      await handleFile(state.selectedFile);
      return;
    }
    if (action === 'retry') {
      await handleFile(state.selectedFile);
      return;
    }
    if (action === 'copy') {
      await copyDiagnostics(event.target);
      return;
    }
    if (action === 'reset') {
      resetLocalData();
      window.location.reload();
      return;
    }
    if (action === 'go-date') {
      window.location.href = '/index.html';
    }
  });

  render();

  return {
    open() {
      modal.classList.add('open');
    }
  };
}
