/* ==================================================================
   XQD716 NEXUS 6.0 — Service Worker Engine (PWA Performance & Cache)
   ================================================================== */

const CACHE_NAME = 'xqd716-nexus-v6.0.4';

const STATIC_ASSETS = [
    './',
    'index.html',
    'styles.css',
    '3d-space.js',
    'backend-config.js',
    'security.js',
    'app.js',
    'manifest.webmanifest'
];

// Install Event: Pre-cache App Shell Assets
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Pre-caching static app shell');
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// Activate Event: Purge Deprecated Caches and Claim Control
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        console.log('[SW] Purging deprecated cache storage:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Network-first for dynamic cloud data, Stale-while-revalidate for local assets
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Bypass caching for Firebase Cloud Firestore, Auth, and Analytics endpoints
    if (
        requestUrl.hostname.includes('firebase') ||
        requestUrl.hostname.includes('firestore') ||
        requestUrl.hostname.includes('googleapis') ||
        requestUrl.hostname.includes('gstatic') ||
        event.request.method !== 'GET'
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request)
                .then(networkResponse => {
                    // Cache valid internal responses
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(err => {
                    console.warn('[SW] Network request failed, fallback to cache:', err);
                    return cachedResponse;
                });

            // Return cached version immediately if exists, then update in background
            return cachedResponse || fetchPromise;
        })
    );
});

// Background Sync & Message Handling
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
