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
const APP_VERSION = '3.81.0';
const CACHE_NAME = `quran-pwa-${APP_VERSION}`;
const STATIC_CACHE = `quran-static-${APP_VERSION}`;
const API_CACHE = 'quran-api-v1';
const OFFLINE_DATA_CACHE = 'quran-offline-data-v1';

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

// Offline Islamic data files to cache (for offline Quran & Dua reading)
const OFFLINE_DATA_ASSETS = [
    // Quran data
    './islamic_data/jsons/all-surah-meanings.json',
    // Dua categories
    './islamic_data/dua-dhikr/daily-dua/en.json',
    './islamic_data/dua-dhikr/morning-dhikr/en.json',
    './islamic_data/dua-dhikr/evening-dhikr/en.json',
    './islamic_data/dua-dhikr/dhikr-after-salah/en.json',
    './islamic_data/dua-dhikr/selected-dua/en.json',
    // Other Islamic content
    './islamic_data/jsons/list_allah_names.json',
    './islamic_data/jsons/wudu-guide.json',
    './islamic_data/jsons/islamic-facts.json',
    './islamic_data/jsons/islamic-terms.json',
    './islamic_data/jsons/prophet_stories.json',
    './islamic_data/jsons/hadiths/bukhari.json',
    './islamic_data/jsons/hadiths/muslim.json',
    './islamic_data/jsons/hadiths/tirmidhi.json'
];

// Assets that should always be fetched fresh (code files)
const ALWAYS_FRESH = ['index.html', 'styles.css', 'app.js'];

// Install event - cache static assets and offline data
self.addEventListener('install', (event) => {
    console.log(`[Service Worker] Installing version ${APP_VERSION}...`);

    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE)
                .then((cache) => {
                    console.log('[Service Worker] Caching static assets');
                    return cache.addAll(STATIC_ASSETS);
                }),
            // Cache offline data files (for offline Quran & Dua)
            caches.open(OFFLINE_DATA_CACHE)
                .then((cache) => {
                    console.log('[Service Worker] Caching offline Islamic data...');
                    // Cache each file individually to avoid failing if one is missing
                    return Promise.allSettled(
                        OFFLINE_DATA_ASSETS.map(url =>
                            cache.add(url).catch(err => {
                                console.warn(`[Service Worker] Failed to cache ${url}:`, err);
                            })
                        )
                    );
                })
        ])
            .then(() => {
                console.log('[Service Worker] All assets cached');
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Failed to cache assets:', error);
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
                            // Delete any cache that isn't the current version (except API and offline data caches)
                            return name !== STATIC_CACHE && name !== API_CACHE && name !== OFFLINE_DATA_CACHE;
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

    // CRITICAL: Handle navigation requests (when user opens the app)
    // This must come FIRST to ensure offline loads work
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    // Try network first
                    const networkResponse = await fetch(request);
                    if (networkResponse.ok) {
                        const cache = await caches.open(STATIC_CACHE);
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    }
                } catch (error) {
                    // Network failed, use cache
                }

                // Fallback to cached index.html
                const cachedResponse = await caches.match(request) || await caches.match('./index.html') || await caches.match('/index.html');

                if (cachedResponse) {
                    return cachedResponse;
                }

                // Final fallback - custom offline page
                return new Response(
                    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Offline - Fardh</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:linear-gradient(135deg,#102218 0%,#1a3a2e 100%);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:20px}.container{max-width:400px}.icon{font-size:4rem;margin-bottom:1.5rem;opacity:0.9}h1{font-size:1.75rem;margin-bottom:0.75rem;font-weight:600}p{font-size:1rem;color:rgba(255,255,255,0.8);margin-bottom:2rem;line-height:1.5}.btn{background:#10b981;color:white;border:none;padding:14px 32px;border-radius:25px;font-size:1rem;font-weight:600;cursor:pointer;transition:all 0.3s ease;box-shadow:0 4px 15px rgba(16,185,129,0.3)}.btn:active{transform:scale(0.95)}</style></head><body><div class="container"><div class="icon">📖</div><h1>You\'re Offline</h1><p>Please connect to the internet and open the app once to enable offline access.</p><button class="btn" onclick="window.location.reload()">Retry</button></div></body></html>',
                    {
                        status: 200,
                        headers: { 'Content-Type': 'text/html' }
                    }
                );
            })()
        );
        return;
    }

    // Handle API requests (network-first)
    if (url.hostname === 'api.alquran.cloud' || url.hostname === 'api.aladhan.com') {
        event.respondWith(networkFirst(request, API_CACHE));
        return;
    }

    // Handle local Islamic data files (cache-first for offline use)
    if (url.pathname.includes('islamic_data/')) {
        event.respondWith(cacheFirst(request, OFFLINE_DATA_CACHE));
        return;
    }

    // Handle Google Fonts Styles (Stale While Revalidate)
    if (url.hostname === 'fonts.googleapis.com') {
        event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
        return;
    }

    // Handle Google Fonts Webfiles (Cache First)
    if (url.hostname === 'fonts.gstatic.com') {
        event.respondWith(cacheFirst(request, STATIC_CACHE));
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
        const fallback = await caches.match('./index.html');
        if (fallback) {
            return fallback;
        }

        // Final fallback to avoid browser error page
        return new Response(
            '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Offline</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#102218;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center}h1{margin-bottom:1rem}.btn{background:#10b981;color:white;border:none;padding:10px 20px;border-radius:20px;font-size:1rem;cursor:pointer;margin-top:20px}</style></head><body><h1>You are offline</h1><p>Please check your connection and try again.</p><button class="btn" onclick="window.location.reload()">Retry</button></body></html>',
            {
                status: 503,
                headers: { 'Content-Type': 'text/html' }
            }
        );
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
