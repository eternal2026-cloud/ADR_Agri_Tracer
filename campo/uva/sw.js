/* ============================================================================
 * sw.js — Tiempo de ciclo Uva sin señal (solo este módulo: alcance /campo/uva/).
 * Red primero: con señal siempre se usa la versión publicada (y se guarda copia);
 * sin señal se abre la copia guardada. Solo archivos del sitio (GET); las llamadas
 * a Supabase nunca se guardan (los registros viven en el equipo y suben luego).
 * ==========================================================================*/
var CACHE = 'integra-uva-v6';
var BASE = [
  './', 'index.html', 'css/app.css', 'img/icono.svg',
  'fonts/jost-latin-400-normal.woff2', 'fonts/jost-latin-500-normal.woff2', 'fonts/jost-latin-600-normal.woff2', 'fonts/jost-latin-700-normal.woff2',
  'js/nucleo.js', 'js/catalogo.js', 'js/datos.js', 'js/permisos.js', 'js/mascota.js', 'js/integra.js', 'js/registrar.js',
  'js/alertas.js', 'js/vistas.js', 'js/nube.js', 'js/resumen.js', 'js/faq.js', 'js/app.js',
  'data/lotes_uva.geojson', '../../vendor/leaflet/leaflet.css', '../../vendor/leaflet/leaflet.js', '../../vendor/anime.min.js', '../../vendor/supabase.min.js', '../../js/supabase-cliente.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(BASE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (l) {
    return Promise.all(l.filter(function (k) { return k.indexOf('integra-uva-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(function (r) {
    if (r && r.ok) { var copia = r.clone(); caches.open(CACHE).then(function (c) { c.put(req, copia); }); }
    return r;
  }).catch(function () {
    return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
  }));
});
