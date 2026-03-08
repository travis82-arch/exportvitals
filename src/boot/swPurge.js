const CACHE_PURGE_KEY = '__ouraSwPurgeReloadedV1';

export function hasPurgedReloadFlag() {
  try {
    return window.sessionStorage?.getItem(CACHE_PURGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPurgedReloadFlag() {
  try {
    window.sessionStorage?.setItem(CACHE_PURGE_KEY, '1');
  } catch {
    // ignore storage restrictions
  }
}

export async function purgeStaleServiceWorkersAndCaches() {
  let unregisteredCount = 0;
  let deletedCaches = [];

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      const results = await Promise.all(regs.map((registration) => registration.unregister()));
      unregisteredCount = results.filter(Boolean).length;
    } catch {
      // keep boot resilient
    }
  }

  if (typeof window !== 'undefined' && window.caches?.keys) {
    try {
      const keys = await caches.keys();
      deletedCaches = keys.filter((key) => key.startsWith('oura-') || key.includes('oura'));
      await Promise.all(deletedCaches.map((key) => caches.delete(key)));
    } catch {
      deletedCaches = [];
    }
  }

  return { unregisteredCount, deletedCaches };
}

