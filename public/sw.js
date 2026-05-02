// ═══════════════════════════════════════════════════════════════
// AVIASCAN SERVICE WORKER
// Permet le fonctionnement hors-ligne et le caching intelligent
// ═══════════════════════════════════════════════════════════════

const CACHE_VERSION = 'aviascan-v1.0.0';
const CACHE_NAME = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Ressources à mettre en cache lors de l'installation
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ─── INSTALLATION ───
self.addEventListener('install', (event) => {
  console.log('[SW] Installation en cours...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Mise en cache des ressources statiques');
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.warn('[SW] Erreur de mise en cache :', err);
        });
      })
      .then(() => self.skipWaiting()) // Active immédiatement
  );
});

// ─── ACTIVATION (nettoyage des anciens caches) ───
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation en cours...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => !name.startsWith(CACHE_VERSION))
            .map(name => {
              console.log('[SW] Suppression de l\'ancien cache :', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim()) // Prend contrôle de tous les clients
  );
});

// ─── INTERCEPTION DES REQUÊTES ───
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorer les requêtes non-HTTP
  if (!request.url.startsWith('http')) return;

  // Ignorer Chrome extensions
  if (url.protocol === 'chrome-extension:') return;

  // ━━━ STRATÉGIE : Firebase / API / Chariow → Network First avec fallback cache ━━━
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('chariow.com') ||
      url.hostname.includes('emailjs.com') ||
      url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Mise en cache des requêtes réussies (sauf POST)
          if (response.status === 200 && request.method === 'GET') {
            const responseClone = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Si offline, on essaie le cache
          return caches.match(request);
        })
    );
    return;
  }

  // ━━━ STRATÉGIE : Images (Unsplash, etc.) → Cache First ━━━
  if (request.destination === 'image' ||
      url.hostname.includes('unsplash.com') ||
      url.hostname.includes('googleusercontent.com')) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE)
                .then(cache => cache.put(request, clone));
            }
            return response;
          });
        })
        .catch(() => caches.match('/icon-192.png'))
    );
    return;
  }

  // ━━━ STRATÉGIE : Fonts Google → Cache First ━━━
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request)
        .then(cached => cached || fetch(request).then(response => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, clone));
          }
          return response;
        }))
    );
    return;
  }

  // ━━━ STRATÉGIE : HTML / Pages → Network First avec fallback cache ━━━
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(cached => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // ━━━ DÉFAUT : Cache First avec mise à jour en arrière-plan ━━━
  event.respondWith(
    caches.match(request)
      .then(cached => {
        const fetchPromise = fetch(request)
          .then(response => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE)
                .then(cache => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
  );
});

// ─── NOTIFICATIONS PUSH ───
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'AviaScan', body: event.data.text() };
  }

  const options = {
    body: data.body || 'Nouvelle notification',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'aviascan-notification',
    requireInteraction: false,
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'AviaScan', options)
  );
});

// ─── CLIC SUR NOTIFICATION ───
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Si une fenêtre est déjà ouverte, on la focus
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Sinon on ouvre une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ─── MESSAGE DEPUIS L'APP (mise à jour forcée) ───
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] AviaScan Service Worker chargé - Version', CACHE_VERSION);
