const CACHE = 'nf-v33-auto-update';
const ASSETS = ['./', './index.html', './app.js', './storage.js', './updater.js', './manifest.json', './icon.png', './icon-512.png', './vendor/tailwind.js', './vendor/lucide.js', './vendor/chart.js'];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new Request(path, {cache:'reload'})))));
    // The page requests activation only when it is safe to update.
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => /^nf-v/.test(k) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || !['http:', 'https:'].includes(url.protocol)) return;
    // Versioned app shell: HTML and storage code must always come from one release.
    const shell = url.origin === self.location.origin && ASSETS.some(p => new URL(p, self.registration.scope).pathname === url.pathname);
    event.respondWith(caches.open(CACHE).then(async cache => {
        const cached = await cache.match(request, {ignoreSearch: shell});
        if (shell && cached) return cached;
        try {
            const response = await fetch(request);
            if (response.ok || response.type === 'opaque') event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
            return response;
        } catch (error) { if (cached) return cached; throw error; }
    }));
});

// Foreground updater and recovery page can activate a fully cached release.
self.addEventListener('message', event => { if (event.data?.type === 'NF_ACTIVATE_UPDATE') self.skipWaiting(); });
