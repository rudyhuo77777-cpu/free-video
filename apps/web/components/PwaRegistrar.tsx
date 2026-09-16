'use client';

import { useEffect } from 'react';

export function PwaRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (isLocal) {
      // Demo source changes must never be hidden by a service worker from an older ZIP.
      navigator.serviceWorker.getRegistrations()
        .then(regs => Promise.all(regs.map(reg => reg.unregister())))
        .catch(() => undefined);
      if ('caches' in window) {
        caches.keys()
          .then(keys => Promise.all(keys.filter(key => key.startsWith('auria-shell-')).map(key => caches.delete(key))))
          .catch(() => undefined);
      }
      return;
    }

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
      .then(reg => reg.update().catch(() => undefined))
      .catch(() => undefined);
  }, []);
  return null;
}
