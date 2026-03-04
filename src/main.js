import { installGlobalErrorHandlers, showFatalOverlay } from './boot/fatalOverlay.js';
import { renderBootErrorBoundary } from './boot/ErrorBoundary.js';
import { resetLocalData } from './storage/resetLocalData.js';
import { bootApp } from './app.js';

function initBootShell() {
  const shell = document.getElementById('bootShell');
  const status = document.getElementById('bootStatus');
  const resetBtn = document.getElementById('bootResetReload');

  if (status) status.textContent = 'Loading…';
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetLocalData();
      const url = new URL(window.location.href);
      url.searchParams.set('v', Date.now());
      window.location.href = `${url.pathname}${url.search}${url.hash}`;
    });
  }

  return {
    done() {
      if (shell) shell.style.display = 'none';
    },
    fail(message) {
      if (status) status.textContent = message;
    }
  };
}

installGlobalErrorHandlers();
const bootShell = initBootShell();

try {
  bootApp();
  bootShell.done();
} catch (error) {
  bootShell.fail('Startup failed. Use reset and reload.');
  renderBootErrorBoundary(error);
  showFatalOverlay(error, { type: 'bootApp' });
}
