const CACHE_NAME = 'concorsi-ai-v33';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './data.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './js/config.js',
    './js/state.js',
    './js/cloud.js',
    './js/api.js',
    './js/api/helpers.js',
    './js/api/prompts.js',
    './js/api/evaluation.js',
    './js/api/orale.js',
    './js/api/tutor.js',
    './js/api/quiz.js',
    './js/api/traces.js',
    './js/utils.js',
    './js/timer.js',
    './js/theme.js',
    './js/metering.js',
    './js/gamification.js',
    './js/router.js',
    './js/main.js',
    './js/views/home.js',
    './js/views/analytics.js',
    './js/views/tracce.js',
    './js/views/glossario.js',
    './js/views/simulation.js',
    './js/views/result.js',
    './js/views/orale.js',
    './js/views/community.js',
    './js/views/history.js',
    './js/views/pricing.js',
    './js/views/schedule.js',
    './js/views/modals.js',
    './js/views/admin.js',
    './js/views/legal.js',
    './js/views/quiz.js',
    './js/views/giurisprudenza.js',
    './js/views/bandi.js',
    './js/views/briefing.js',
    './js/controllers/simulation.js',
    './js/controllers/orale.js',
    './js/controllers/auth.js',
    './js/controllers/community.js',
    './js/controllers/tutor.js',
    './js/controllers/quiz.js',
    './js/views/lezione.js',
    './js/controllers/lezione.js'
];

// --- INSTALL: Pre-cache app shell ---
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            console.log('[SW] Pre-caching app shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    // Attiva subito il nuovo SW senza aspettare la chiusura dei tab
    self.skipWaiting();
});

// --- FETCH: Stale-While-Revalidate per file locali, Network-First per API ---
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Ignora le richieste POST e le richieste API
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Per richieste API (OpenAI, Supabase) → sempre network
    if (url.origin !== location.origin) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // Se offline e abbiamo una copia in cache, restituiscila
                return caches.match(event.request);
            })
        );
        return;
    }

    // Per risorse locali → Stale-While-Revalidate
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            // Lancia il fetch in background per aggiornare la cache
            const fetchPromise = fetch(event.request).then(networkResponse => {
                // Aggiorna la cache solo se la risposta è valida
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Network fallito, la cached response verrà usata (se c'è)
                return cachedResponse;
            });

            // Restituisci subito la versione in cache (se esiste), altrimenti aspetta il network
            return cachedResponse || fetchPromise;
        })
    );
});

// --- ACTIVATE: Pulisci vecchie cache ---
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Eliminazione vecchia cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Prendi il controllo di tutti i client immediatamente
            return self.clients.claim();
        })
    );
});

// --- MESSAGE: Notifica i client quando c'è un aggiornamento ---
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
