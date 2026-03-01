/**
 * Service Worker — Golden Years Club PWA
 *
 * Network-first strategy for dynamic content, cache-first for static assets.
 * No aggressive caching — shelter data changes frequently.
 *
 * Cache version is bumped on each deploy. The activate handler cleans up
 * old caches, so stale page content is evicted automatically.
 */

// Bump this on each deploy (or inject via build script) to bust stale caches.
const CACHE_VERSION = '20260223';
const CACHE_NAME = `gy-v${CACHE_VERSION}`;

// Max age for cached pages (1 hour). After this, cached pages are evicted
// on the next fetch to avoid serving very stale animal listings.
const PAGE_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

const STATIC_ASSETS = [
    '/icon-192.png',
    '/icon-512.png',
    '/no-photo.svg',
];

// Install: pre-cache critical static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

// Fetch: network-first for pages, cache-first for images/static
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip API routes — always go to network
    if (url.pathname.startsWith('/api/')) return;

    // Static assets: cache-first
    if (
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.endsWith('.webp') ||
        url.pathname.startsWith('/_next/static/')
    ) {
        event.respondWith(
            caches.match(request).then((cached) => cached || fetch(request))
        );
        return;
    }

    // Pages: network-first with TTL-aware offline fallback
    event.respondWith(
        fetch(request)
            .then((response) => {
                // Cache successful page responses with a timestamp header
                if (response.ok && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request);
                if (!cached) {
                    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
                }

                // Check if cached response is too old
                const cachedDate = cached.headers.get('date');
                if (cachedDate) {
                    const age = Date.now() - new Date(cachedDate).getTime();
                    if (age > PAGE_CACHE_MAX_AGE_MS) {
                        // Stale — delete from cache and return offline error
                        const cache = await caches.open(CACHE_NAME);
                        await cache.delete(request);
                        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
                    }
                }
                return cached;
            })
    );
});
