/* Console service worker.
 *
 * The app shell is precached so Console opens instantly and works offline.
 * API traffic is never cached: a stale transcript would be worse than none,
 * so network failures fall back to whatever the shell already has in memory.
 */

const VERSION = "console-v3";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./fonts.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/api.js",
  "./js/config.js",
  "./js/render.js",
  "./js/markdown.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-192.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/badge-96.png",
  "./icons/monochrome-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // addAll fails atomically; add individually so one 404 can't break install
      await Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => null),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => null);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isApi(url) {
  if (url.origin === self.location.origin) return /\/api\//.test(url.pathname);
  // cross-origin OpenHands/Cloud traffic (API, telemetry) is never ours to cache
  return url.hostname.endsWith("all-hands.dev");
}

function isFont(url) {
  return /\.(woff2?|ttf|otf)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API calls.
  if (isApi(url)) return;

  // Navigations: network first, offline -> cached shell.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put("./index.html", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL);
          return (
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            new Response("Offline", { status: 503, statusText: "Offline" })
          );
        }
      })(),
    );
    return;
  }

  // Same-origin assets: network first so a redeploy takes effect on the next
  // load, falling back to cache when offline. The shell is precached at install
  // time, so the offline path is always populated.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        try {
          const fresh = await fetch(request);
          if (fresh && fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cached = await cache.match(request);
          return cached || new Response("", { status: 504, statusText: "Offline" });
        }
      })(),
    );
    return;
  }

  // Fonts from any origin: long-lived runtime cache.
  if (isFont(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
          return res;
        } catch {
          return new Response("", { status: 504 });
        }
      })(),
    );
  }
});
