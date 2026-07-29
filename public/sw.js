/* Equilibrio — service worker.
   CACHE_NAME viene riscritto automaticamente in build dal plugin sw-cache-bump
   (vite.config.js): non va mai bumpato a mano. */

var CACHE_NAME = 'equilibrio-dev';

var GUSCIO = [
  '/',
  '/index.html',
  '/profilo.html',
  '/preferenze.html',
  '/piano.html',
  '/spesa.html',
  '/ricette.html',
  '/progressi.html',
  '/impostazioni.html',
  '/guida.html',
  '/manifest.json',
  '/assets/icons.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (c) { return c.addAll(GUSCIO); })
      // Una pagina mancante non deve far fallire tutta l'installazione.
      .catch(function () { return null; })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (nomi) {
        return Promise.all(nomi.map(function (n) {
          return n === CACHE_NAME ? null : caches.delete(n);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

function daRete(req) {
  return fetch(req).then(function (res) {
    if (res && res.ok && res.type === 'basic') {
      var copia = res.clone();
      caches.open(CACHE_NAME).then(function (c) { c.put(req, copia); });
    }
    return res;
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Open Food Facts: la rete comanda, ma la risposta resta in cache cosi'
  // il prodotto gia' scansionato funziona anche in modalita' aereo.
  if (url.hostname.indexOf('openfoodfacts.org') !== -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copia = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(req, copia); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // L'API della lista condivisa non va mai servita dalla cache:
  // una spunta vecchia sarebbe peggio di un errore di rete.
  if (url.pathname.indexOf('/api/') === 0) return;

  // Navigazioni: prima la rete (per prendere la build nuova), poi la cache.
  if (req.mode === 'navigate') {
    e.respondWith(
      daRete(req).catch(function () {
        return caches.match(req).then(function (r) {
          return r || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // Risorse statiche: prima la cache, aggiornamento in sottofondo.
  e.respondWith(
    caches.match(req).then(function (cached) {
      var rete = daRete(req).catch(function () { return cached; });
      return cached || rete;
    })
  );
});
