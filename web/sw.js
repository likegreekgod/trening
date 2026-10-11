// Service worker: pliki aplikacji w pamięci telefonu → start bez sieci.
// Zmień VERSION przy każdej publikacji, żeby telefony pobrały nową wersję.
const VERSION = 'v10';
const CACHE = 'trening-' + VERSION;
const SHELL = ['./', 'index.html', 'config.js', 'lib.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png',
  // czcionki lokalne (OFL) – bez nich offline wróciłyby systemowe
  'fonts/big-shoulders-display-latin-ext-wght-normal.woff2',
  'fonts/big-shoulders-display-latin-wght-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2',
  'fonts/ibm-plex-mono-latin-ext-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-ext-500-normal.woff2',
  'fonts/instrument-sans-latin-ext-wght-normal.woff2',
  'fonts/instrument-sans-latin-wght-normal.woff2'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // API Google i Drive – zawsze sieć
  // sieć najpierw (świeża wersja), pamięć gdy brak sieci
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
