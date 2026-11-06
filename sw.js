// Service Worker: يخزّن ملفات التطبيق ليعمل بدون إنترنت بعد أول زيارة.
// ارفع CACHE_NAME عند تغيير قائمة SHELL_FILES حتى يُستبدل الكاش القديم.
const CACHE_NAME = "douaa-tracker-shell-v2";

const SHELL_FILES = [
  "./",
  "index.html",
  "styles.css",
  "config.js",
  "theme-init.js",
  "app.js",
  "pwa.js",
  "manifest.webmanifest",
  "favicon.svg",
  "favicon.ico",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "fonts/amiri-400-arabic.woff2",
  "fonts/amiri-700-arabic.woff2",
  "fonts/ibm-plex-400-arabic.woff2",
  "fonts/ibm-plex-400-latin.woff2",
  "fonts/ibm-plex-500-arabic.woff2",
  "fonts/ibm-plex-500-latin.woff2",
  "fonts/ibm-plex-600-arabic.woff2",
  "fonts/ibm-plex-600-latin.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isAppAsset(request, url) {
  return request.mode === "navigate" || /\.(?:html|css|js|webmanifest)$/.test(url.pathname);
}

function putInCache(request, response) {
  if (!response || !response.ok) return;
  caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
}

// ملفات التطبيق: الشبكة أولاً حتى تظهر التحديثات، والكاش عند الانقطاع.
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      putInCache(request, response);
      return response;
    })
    .catch(() =>
      caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("index.html");
        return Response.error();
      })
    );
}

// الخطوط والأيقونات: الكاش أولاً لأنها لا تتغيّر.
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      putInCache(request, response);
      return response;
    });
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(isAppAsset(request, url) ? networkFirst(request) : cacheFirst(request));
});
