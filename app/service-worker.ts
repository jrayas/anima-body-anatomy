// Registers public/sw.js in production builds. Once full detail has loaded it sends the
// service worker the current manifest's file list, so the worker can cache files fetched
// before it took control (first visit) and delete files from earlier deploys.
import {assetUrl, type Manifest} from './data/manifest';

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // Registered after load so it never competes with the first render for bandwidth.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(assetUrl('sw.js'), {scope: import.meta.env.BASE_URL}).catch(error => {
      console.warn('Offline caching is unavailable:', error);
    });
  });
}

export function syncServiceWorkerCache(manifest: Manifest) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const send = () => navigator.serviceWorker.ready.then(registration => {
    // Built JS/CSS loaded by this page (hashed, so safe to cache forever).
    const bundles = performance.getEntriesByType('resource').map(e => e.name)
      .filter(u => u.startsWith(location.origin + assetUrl('assets/')));
    registration.active?.postMessage({
      type: 'sync',
      keep: [...manifest.files.map(f => assetUrl(f.url)), assetUrl(manifest.concepts), ...bundles],
      shell: [assetUrl(''), assetUrl('models/manifest.json')],
    });
  }).catch(() => {/* Caching is an enhancement; nothing to do. */});
  // Wait for the scene's 'anima:full-detail' mark so caching never slows the first load.
  if (performance.getEntriesByName('anima:full-detail').length) return void send();
  const observer = new PerformanceObserver(list => {
    if (list.getEntriesByName('anima:full-detail').length) { observer.disconnect(); send(); }
  });
  observer.observe({type: 'mark'});
}
