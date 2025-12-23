/**
 * ============================================
 * QURAN PWA - Service Worker
 * ============================================
 * 
 * IMPORTANT: Update APP_VERSION when deploying new code!
 * This forces the service worker to update and clear old caches.
 * 
 * Caching strategies:
 * - Static assets (HTML, CSS, JS): Stale-while-revalidate
 * - Icons/images: Cache-first
 * - API calls: Network-first with cache fallback
 * ============================================
 */

// ⚠️ UPDATE THIS VERSION NUMBER WHEN YOU MAKE CHANGES!
const APP_VERSION = '3.59.0';
const CACHE_NAME = `quran-pwa-${APP_VERSION}`;
const STATIC_CACHE = `quran-static-${APP_VERSION}`;
const API_CACHE = 'quran-api-v1';

// Static assets to cache on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.webmanifest',
    './AppImages/logo_nobg.svg',
    './icons/icon-72x72.png',
    './icons/icon-96x96.png',
    './icons/icon-128x128.png',
    './icons/icon-144x144.png',
    './icons/icon-152x152.png',
    './icons/icon-192x192.png',
    './icons/icon-384x384.png',
    './icons/icon-512x512.png'
];

// Assets that should always be fetched fresh (code files)
const ALWAYS_FRESH = ['index.html', 'styles.css', 'app.js'];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log(`[Service Worker] Installing version ${APP_VERSION}...`);

    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[Service Worker] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[Service Worker] Static assets cached');
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Failed to cache static assets:', error);
            })
    );
});

// Activate event - clean up ALL old caches when version changes
self.addEventListener('activate', (event) => {
    console.log(`[Service Worker] Activating version ${APP_VERSION}...`);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            // Delete any cache that isn't the current version (except API cache)
                            return name !== STATIC_CACHE && name !== API_CACHE;
                        })
                        .map((name) => {
                            console.log('[Service Worker] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[Service Worker] Now active, taking control of all clients');
                // Take control of all clients immediately
                return self.clients.claim();
            })
            .then(() => {
                // Notify all clients about the update
                return self.clients.matchAll().then(clients => {
                    clients.forEach(client => {
                        client.postMessage({ type: 'SW_UPDATED', version: APP_VERSION });
                    });
                });
            })
    );
});

// Fetch event - handle requests
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Handle API requests (network-first)
    if (url.hostname === 'api.alquran.cloud' || url.hostname === 'api.aladhan.com') {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    // For HTML, CSS, JS files - use stale-while-revalidate (show cached but fetch fresh in background)
    const fileName = url.pathname.split('/').pop() || 'index.html';
    if (ALWAYS_FRESH.some(f => fileName.includes(f))) {
        event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
        return;
    }

    // Handle other static assets (cache-first)
    event.respondWith(cacheFirst(request, STATIC_CACHE));
});

/**
 * Stale-while-revalidate strategy
 * Return cached response immediately, but fetch fresh in background
 * This ensures users see updates quickly on next page load
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    // Fetch fresh version in background
    const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => {
        // Network failed, that's ok - we have cache
        return null;
    });

    // Return cached response immediately if available
    if (cachedResponse) {
        return cachedResponse;
    }

    // No cache, wait for network
    try {
        const networkResponse = await fetchPromise;
        if (networkResponse) {
            return networkResponse;
        }
    } catch (error) {
        // Ignore
    }

    // Fallback for HTML
    if (request.destination === 'document') {
        return caches.match('./index.html');
    }

    return new Response('Offline', { status: 503 });
}

/**
 * Cache-first strategy
 * Try cache first, fall back to network
 */
async function cacheFirst(request, cacheName) {
    try {
        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[Service Worker] Cache-first failed:', error);

        // Return offline fallback for HTML requests
        if (request.destination === 'document') {
            return caches.match('./index.html');
        }

        return new Response('Offline', { status: 503 });
    }
}

/**
 * Network-first strategy
 * Try network first, fall back to cache
 */
async function networkFirst(request, cacheName) {
    try {
        const networkResponse = await fetch(request);

        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[Service Worker] Network failed, trying cache:', request.url);

        const cachedResponse = await caches.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        // Return an error response for API requests
        return new Response(
            JSON.stringify({
                code: 503,
                status: 'Offline',
                data: 'You are offline. Please check your connection.'
            }),
            {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// Handle messages from main app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Handle notification click - open app and navigate to relevant section
self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification clicked');

    event.notification.close();

    // Get the category from notification data
    const category = event.notification.data?.category || 'home';

    // Open or focus the app window
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // If app is already open, focus it
                for (const client of clientList) {
                    if (client.url.includes('fardh.netlify.app') || client.url.includes('localhost')) {
                        client.postMessage({ type: 'NOTIFICATION_CLICK', category: category });
                        return client.focus();
                    }
                }
                // Otherwise open a new window
                if (clients.openWindow) {
                    return clients.openWindow('./?notification=' + category);
                }
            })
    );
});
