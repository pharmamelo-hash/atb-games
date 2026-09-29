// Games @pharmamelo · Antimicrobianos — funciona offline após a primeira abertura
const CACHE = 'atb-games-v3';
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Fontes do Google: cache primeiro, depois rede
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit => hit ||
      fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }))));
    return;
  }
  // Arquivos do jogo: rede primeiro (pega atualizações), cache se offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && url.origin === location.origin) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
    return r;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html'))));
});
