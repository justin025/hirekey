const cacheVersion = "hirkey-pwa-v7";

const precacheURLs = [
    "/",
    "/static/offline.html",
    "/static/manifest.webmanifest",
    "/static/css/style.css",
    "/static/css/font.css",
    "/static/css/leaflet.css",
    "/static/js/main.js",
    "/static/js/auth.js",
    "/static/js/api.js",
    "/static/js/feed.js",
    "/static/js/post.js",
    "/static/js/profile.js",
    "/static/js/search.js",
    "/static/js/events.js",
    "/static/js/marketplace.js",
    "/static/js/settings.js",
    "/static/js/recruit.js",
    "/static/js/chat.js",
    "/static/js/header.js",
    "/static/js/footer.js",
    "/static/img/favicon.png"
];


self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(cacheVersion).then((cache) => {
            return cache.addAll(precacheURLs);
        }).then(() => {
            return self.skipWaiting();
        })
    );
});


self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key === cacheVersion) {
                        return Promise.resolve();
                    }
                    return caches.delete(key);
                })
            );
        }).then(() => {
            return self.clients.claim();
        })
    );
});


self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") {
        return;
    }

    const requestURL = new URL(request.url);
    if (requestURL.origin !== self.location.origin) {
        return;
    }

    if (requestURL.pathname.startsWith("/api/")) {
        event.respondWith(fetch(request));
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    if (requestURL.pathname.startsWith("/static/")) {
        event.respondWith(handleStaticRequest(request));
        return;
    }

    event.respondWith(
        fetch(request).catch(() => {
            return caches.match(request);
        })
    );
});


async function handleNavigationRequest(request) {
    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(cacheVersion);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (_) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        return caches.match("/static/offline.html");
    }
}


async function handleStaticRequest(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        void refreshStaticCache(request);
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(cacheVersion);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (_) {
        return new Response("", {
            status: 503,
            statusText: "Offline"
        });
    }
}


async function refreshStaticCache(request) {
    try {
        const networkResponse = await fetch(request);
        if (!networkResponse || networkResponse.status !== 200) {
            return;
        }
        const cache = await caches.open(cacheVersion);
        await cache.put(request, networkResponse.clone());
    } catch (_) {
    }
}
