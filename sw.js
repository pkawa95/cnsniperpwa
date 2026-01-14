// sw.js

/* =========================
   🧱 VERSIONING
   ========================= */
const VERSION = "2.1.5"; // 🔥 ZMIEŃ PRZY KAŻDYM DEPLOYU
const CACHE_NAME = `cnsniper-${VERSION}`;

/* =========================
   📦 CORE ASSETS (STATIC ONLY)
   ========================= */
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/stats.js",
  "/subscribe.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/badge.png",
];

/* =========================
   🚫 NEVER CACHE / NEVER TOUCH
   ========================= */
const NEVER_INTERCEPT = [
  "/api/",
  "/auth/",
  "/push/",
  "/ws/",
];

/* =========================
   ⚙️ INSTALL
   ========================= */
self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

/* =========================
   ⚙️ ACTIVATE
   ========================= */
self.addEventListener("activate", event => {
  event.waitUntil(
    (async () => {
      // 🧹 usuń stare cache
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );

      // 🟢 przejmij kontrolę
      await self.clients.claim();

      // 🔄 notify clients
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach(c => c.postMessage({ type: "SW_UPDATED" }));
    })()
  );
});

/* =========================
   🌐 FETCH STRATEGY
   ========================= */
self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);

  // ❌ NIE DOTYKAMY:
  // - POST / PUT / DELETE
  // - API / AUTH / PUSH / WS
  if (
    req.method !== "GET" ||
    NEVER_INTERCEPT.some(p => url.pathname.startsWith(p))
  ) {
    return;
  }

  // 🌍 HTML – NETWORK FIRST
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // 📦 ASSETS – CACHE FIRST
  event.respondWith(cacheFirst(req));
});

/* =========================
   📦 CACHE STRATEGIES
   ========================= */
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || Response.error();
  }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  const res = await fetch(req);
  if (res && res.status === 200) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
  }
  return res;
}

/* =========================
   🔔 PUSH
   ========================= */
self.addEventListener("push", event => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || "Nowa oferta",
      {
        body: data.body || "",
        icon: data.icon || "/icons/icon-192.png",
        badge: data.badge || "/icons/badge.png",
        image: data.image || undefined,
        data, // 🔥 pełny payload
      }
    )
  );
});

/* =========================
   👉 NOTIFICATION CLICK
   ========================= */
self.addEventListener("notificationclick", event => {
  event.notification.close();

  const { match_key, app_url } = event.notification.data || {};
  const base = app_url || "/";
  const targetUrl = match_key
    ? `${base}?match_key=${encodeURIComponent(match_key)}`
    : base;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clients) {
        if (client.url.startsWith(base)) {
          await client.focus();
          client.postMessage({ fromPush: true, match_key });
          return;
        }
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});
