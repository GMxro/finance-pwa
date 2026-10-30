// Service Worker for PWA - Shell caching only, never cache API/auth

const CACHE_PREFIX = 'finance-pwa-shell-';
const CACHE_NAME = `${CACHE_PREFIX}__BUILD_ID__`;
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/fonts/inter-latin.woff2',
  '/fonts/inter-tight-latin.woff2',
];

// Cloudflare sirve los .html en su ruta limpia (/ y /offline). Pedir
// /index.html o /offline.html devuelve un 307, así que cacheamos la URL final.
const DOCUMENT_PATHS = new Set(['/', '/offline']);

function isHtml(response) {
  return (response.headers.get('content-type') || '').includes('text/html');
}

// Install - cache shell assets. Each asset is cached independently and its
// content type is validated: a missing file or an HTML fallback must never
// abort the install, nor be stored under an image/font URL.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(STATIC_ASSETS.map(async (path) => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (!response.ok) return;
        const isDocument = DOCUMENT_PATHS.has(path);
        if (isDocument ? !isHtml(response) : isHtml(response)) return;
        await cache.put(path, response);
      } catch {
        // One unavailable optional asset must not block SW activation.
      }
    }));
  })());
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && key.startsWith(CACHE_PREFIX))
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch - NetworkFirst for API/auth, CacheFirst for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API, auth, or export requests
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') ||
      url.pathname.includes('/export') || request.method !== 'GET') {
    event.respondWith(
      fetch(request).catch(() => {
        // Offline fallback for API - return a meaningful error
        if (url.pathname.startsWith('/api/')) {
          return new Response(JSON.stringify({
            code: 'OFFLINE',
            message: 'Sin conexión. La operación se intentará cuando recupere internet.'
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response('Sin conexión', { status: 503 });
      })
    );
    return;
  }

  // Navigations: network first so a deploy is picked up immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok && isHtml(response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
        }
        return response;
      }).catch(async () => {
        return (await caches.match('/')) || (await caches.match('/index.html')) || (await caches.match('/offline')) || new Response('Sin conexión', { status: 503 });
      })
    );
    return;
  }

  // Icons / favicons: network first. Never let an HTML fallback be cached
  // under an image URL (that is what broke the iOS home screen icon).
  if (request.destination === 'image' || /\.(png|ico|svg|webp)$/i.test(url.pathname)) {
    event.respondWith(
      fetch(request).then((response) => {
        const type = response.headers.get('content-type') || '';
        if (response.ok && type.startsWith('image/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(async () => {
        const cached = await caches.match(request);
        const type = cached?.headers.get('content-type') || '';
        return cached && type.startsWith('image/') ? cached : Response.error();
      })
    );
    return;
  }

  // Hashed static assets: cache first (content is immutable per build).
  event.respondWith(
    caches.match(request).then((cached) => {
      const isDocumentPath = url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/offline';
      if (cached && (isDocumentPath ? isHtml(cached) : !isHtml(cached))) return cached;
      return fetch(request).then((response) => {
        const type = response.headers.get('content-type') || '';
        // nunca guardar un fallback HTML bajo la URL de un asset
        if (response.ok && !type.startsWith('text/html')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => new Response('Sin conexión', { status: 503 }));
    })
  );
});

// Background Sync - attempt to sync when online (optional enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'finanzas-sync') {
    event.waitUntil(
      // The app handles its own sync via IndexedDB outbox
      // This is just a wake-up signal
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: 'SYNC_WAKEUP' }));
      })
    );
  }
});

// Message handling
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
