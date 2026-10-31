const CACHE_NAME = 'sce-sukien-v3';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './apple-touch-icon.png',
    './app-icon-192.png',
    './app-icon-512.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const reqUrl = event.request.url;

    // TUYỆT ĐỐI KHÔNG CACHE các request xác thực JWT, REST API hoặc Storage của Supabase
    if (
        event.request.method !== 'GET' ||
        reqUrl.includes('supabase.co') ||
        reqUrl.includes('/auth/v1/') ||
        reqUrl.includes('/rest/v1/') ||
        reqUrl.includes('/storage/v1/')
    ) {
        return;
    }

    // Network-First cho giao diện tĩnh để luôn nhận bản cập nhật mới nhất
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
