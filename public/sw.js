// SW AUTO-DISTRUGGENTE (kill-switch) — giugno 2026.
// Sostituisce il vecchio Service Worker (Stale-While-Revalidate) che inchiodava
// gli utenti a build vecchie: serviva un index.html cachato con riferimenti a
// chunk hashati ormai inesistenti (404 → "Failed to fetch dynamically imported
// module"). Questo SW non cacha nulla: svuota tutte le cache, si de-registra e
// ricarica UNA volta i client per servire la build fresca.
// index.html NON registra piu alcun SW, quindi nessun loop di reload.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
            await self.registration.unregister();
            const clients = await self.clients.matchAll({ type: 'window' });
            clients.forEach((client) => client.navigate(client.url));
        } catch (_e) {
            // best effort: se qualcosa fallisce, l'unregister lato pagina copre comunque
        }
    })());
});
