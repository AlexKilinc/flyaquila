// ── Service worker AQUILA AT01 — application 100 % hors-ligne ──
// À la première visite, l'application complète (index.html, tout est intégré
// dedans : icônes, images, manifest) est mise en cache. Ensuite l'app démarre
// toujours depuis le cache (mode avion inclus) et se met à jour en arrière-plan
// quand le réseau est disponible : la mise à jour est visible au rechargement
// suivant. Les polices Google sont mises en cache à la volée au premier
// chargement en ligne, puis servies hors-ligne.

const CACHE = 'aquila-at01-v2';
const CORE = ['./', './index.html'];
// SDK Supabase (auth cloud) : précaché pour que l'app démarre aussi hors-ligne
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all([
        c.addAll(CORE),
        // cross-origin : réponse opaque acceptée ; échec non bloquant (offline)
        c.add(new Request(SDK_URL, { mode: 'no-cors' })).catch(() => {})
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const isSdk = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !isFont && !isSdk) return;

  // Cache d'abord (démarrage instantané et hors-ligne), réseau en arrière-plan
  // pour rafraîchir le cache quand une connexion existe.
  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      if (cached) return cached;
      // Rien en cache : réseau, et pour une navigation on retombe sur
      // l'index déjà en cache (SPA monofichier) si le réseau échoue.
      return network.then((res) => {
        if (res) return res;
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
