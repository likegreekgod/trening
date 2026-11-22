// Service worker: pliki aplikacji w pamięci telefonu → start bez sieci.
// Zmień VERSION przy każdej publikacji, żeby telefony pobrały nową wersję.
const VERSION = 'v75';
const CACHE = 'trening-' + VERSION;
const SHELL = ['./', 'index.html', 'config.js', 'lib.js', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon.svg', 'icons/favicon-32.png',
  'icons/apple-touch-icon.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png', 'icons/icon-mono.svg',
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
  // panel trenera: film z Dysku strumieniem. <video> nie wyśle nagłówka z biletem, a Dysk nie przyjmuje biletu w adresie,
  // więc tu bilet z adresu tej strony idzie do nagłówka, a zapytanie o kawałek (Range) przechodzi bez zmian.
  if (url.origin === location.origin && /\/film-strumien\/[^/]+$/.test(url.pathname)) {
    const h = { Authorization: 'Bearer ' + (url.searchParams.get('t') || '') }, rg = e.request.headers.get('range');
    if (rg) h.Range = rg;
    e.respondWith(fetch('https://www.googleapis.com/drive/v3/files/' + url.pathname.split('/').pop() + '?alt=media', { headers: h }));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // API Google i Drive – zawsze sieć
  // sieć najpierw (świeża wersja), pamięć gdy brak sieci
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (/trener\.html$/.test(url.pathname)   // panel trenera bez sieci nie działa: nie podsuwaj mu aplikacji klienta
      ? new Response('Brak połączenia z siecią.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      : caches.match('index.html'))))
  );
});
