// Games @pharmamelo · Antimicrobianos — funciona offline após a primeira abertura
const CACHE = 'atb-games-v14';
const CORE = ['./', './index.html', './manifest.webmanifest', './config.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './cards/achromobacter.webp',
  './cards/acinetobacter.webp',
  './cards/bacteroides-fragilis.webp',
  './cards/burkholderia-pseudomallei.webp',
  './cards/burkholderia.webp',
  './cards/chlamydia.webp',
  './cards/chryseobacterium.webp',
  './cards/citrobacter.webp',
  './cards/clostridioides-difficile.webp',
  './cards/clostridium-botulinum.webp',
  './cards/clostridium-perfringens.webp',
  './cards/clostridium-tetani.webp',
  './cards/corynebacterium.webp',
  './cards/cronobacter-sakazakii.webp',
  './cards/ecoli.webp',
  './cards/elizabethkingia.webp',
  './cards/enterobacter.webp',
  './cards/enterococcus-faecalis.webp',
  './cards/enterococcus.webp',
  './cards/haemophilus.webp',
  './cards/klebsiella-aerogenes.webp',
  './cards/klebsiella-oxytoca.webp',
  './cards/klebsiella.webp',
  './cards/legionella.webp',
  './cards/listeria.webp',
  './cards/morganella.webp',
  './cards/mycobacterium-tuberculosis.webp',
  './cards/mycoplasma.webp',
  './cards/neisseria-gonorrhoeae.webp',
  './cards/neisseria-meningitidis.webp',
  './cards/proteus.webp',
  './cards/providencia.webp',
  './cards/pseudomonas.webp',
  './cards/ralstonia.webp',
  './cards/salmonella-enterica.webp',
  './cards/saureus.webp',
  './cards/serratia.webp',
  './cards/shigella-sonnei.webp',
  './cards/sphingomonas.webp',
  './cards/staphylococcus-epidermidis.webp',
  './cards/staphylococcus-saprophyticus.webp',
  './cards/stenotrophomonas.webp',
  './cards/streptococcus-agalactiae.webp',
  './cards/streptococcus-gallolyticus.webp',
  './cards/streptococcus-pneumoniae.webp',
  './cards/streptococcus-pyogenes.webp',
  './cards/streptococcus-viridans.webp',
  './cards/yersinia-enterocolitica.webp'];
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
  // Fontes do Google e biblioteca do Supabase: cache primeiro, depois rede
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com') || url.hostname.includes('cdn.jsdelivr.net')) {
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
